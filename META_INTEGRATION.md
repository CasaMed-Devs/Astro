# Meta (Facebook) Events Integration — Plan for Astro101

Reference implementation: `HOTI/hastrekha` (sister app, same stack: Expo + Firebase Functions + Razorpay). This doc records exactly how Hastrekha does it and maps each piece onto Astro101's own screens/files, so we don't re-derive this later. **Nothing has been implemented yet** — this is analysis + plan only.

---

## 1. How Hastrekha does it today

### Package & init
- `react-native-fbsdk-next` (client SDK), installed and linked via the Expo config plugin in `mobile/app.json`:
  ```json
  ["react-native-fbsdk-next", {
    "appID": "1073090351978693",
    "clientToken": "b0c88e15c6a6356d0c3d84c3cb6136fb",
    "displayName": "Hastrekha",
    "scheme": "fb1073090351978693",
    "advertiserIDCollectionEnabled": true,
    "autoLogAppEventsEnabled": true,
    "isAutoInitEnabled": true
  }]
  ```
  App ID/Client Token are hardcoded directly in `app.json`, the same for every build profile (dev/preview/production) — not env-driven, despite `.env.example` documenting `FACEBOOK_APP_ID`/`FACEBOOK_CLIENT_TOKEN` as if they were (they're dead/unused — `app.config.js` never reads them).
- `SDK init` is called once in `app/_layout.tsx`, in the root layout's mount effect: `FacebookEvents.init()`.

### The wrapper: `mobile/src/services/analytics.ts`
A single `FacebookEvents` object is the only thing screens import — nothing calls `react-native-fbsdk-next` directly. Key pattern worth copying as-is:
- **Lazy `require()`**, not a top-level import — `AppEventsLogger`/`Settings` are native modules that don't exist in plain Expo Go, so a top-level import would crash app startup there (same reasoning already used for `react-native-razorpay` in both apps).
- **`USE_MOCKS` flag** (`src/services/config.ts`, from `Constants.expoConfig.extra.useMocks`, set via `.env`'s `USE_MOCKS=true`) — when on, every call just `console.log`s with a `[FB EVENT]` prefix instead of touching the native SDK, so the call sites can be exercised on a simulator/Expo Go build without a native rebuild.
- Five methods, each a thin wrapper over one `AppEventsLogger` call:
  - `logCompleteRegistration({ method })` → `AppEventsLogger.AppEvents.CompletedRegistration`
  - `logLogin({ method })` → raw string `"fb_mobile_login"`
  - `logViewContent({ contentType, contentId? })` → `AppEventsLogger.AppEvents.ViewedContent`
  - `logInitiatedCheckout({ plan, amount, currency })` → `AppEventsLogger.AppEvents.InitiatedCheckout`
  - `logPurchase({ amount, currency, plan, subscriptionId })` → `AppEventsLogger.logPurchase(amount, currency, params)` (the SDK's dedicated purchase-logging method, not a generic `logEvent`)

### Where each call actually fires (file:line)
| Event | File | Trigger |
|---|---|---|
| SDK init | `app/_layout.tsx:34` | Root layout mount |
| `ViewContent(onboarding)` | `app/onboarding/3.tsx:14` | Only the **last** onboarding slide's CTA — slides 1 and 2 fire nothing |
| `CompleteRegistration` + `Login` | `app/auth/otp.tsx:118-119` | Immediately after OTP verify succeeds — **fires on every successful OTP verify, not just first-time signup** (see bug below) |
| `ViewContent(paywall)` | `app/paywall.tsx:82` | Paywall screen mount |
| `InitiatedCheckout` | `app/paywall.tsx:91` | Right before opening Razorpay checkout |
| `Purchase` | `app/paywall.tsx:100` | Inside the `if (result.success)` branch after Razorpay checkout closes — gated only on the checkout SDK's own success callback, not on `result.activated` (the backend's own poll-confirmed status) |
| One-time purchases (scan refill, report unlock) | `src/components/PurchaseModal.tsx` | **Nothing fires here at all** — zero Meta events for this entire purchase path |

### Server side
**None.** Zero Meta Conversions API / server-side App Events calls anywhere in `functions/`. Every event is client-SDK-only. The backend does have exactly the right authoritative confirmation points to hang server-side events off of, though — it just doesn't use them for this:
- `functions/src/payments/subscriptionSync.ts`'s `syncSubscriptionFromRazorpay()` — the single place that authoritatively transitions a user to `"trial"` (first real payment confirmed) or advances `paidCount` (a real ₹299 renewal actually billed). Called from both `checkSubscriptionStatus.ts` (right after checkout) and `refreshSubscriptionStatus.ts` (every app open/login).
- `functions/src/payments/oneTimePurchase.ts`'s `confirmOneTimePayment()` — signature-verified, idempotent (`orderData.status === "fulfilled"` short-circuit) confirmation for the scan-refill/report-unlock one-time orders.
- `functions/src/payments/razorpayWebhook.ts` — verifies Razorpay's webhook signature and handles `subscription.charged`/`cancelled`/`halted`/`completed`, independent of anything the client does.

### Known gaps/bugs in Hastrekha's implementation (don't copy these)
1. **`CompleteRegistration`/`Login` fire on every login, not just first signup.** The backend's `verifyOtp` Cloud Function already computes and returns `isNewUser: boolean` (`functions/src/auth/otp/otpService.ts:239`, `VerifyOtpResponse.isNewUser` in `types.ts:30`) — but the mobile client (`src/services/backend.ts`'s `verifyOtp()`) discards it, only reading `uid`/`customToken` off the response. So a returning user logging in on a new device fires `CompleteRegistration` again. This inflates/corrupts the registration signal Meta's ad algorithm optimizes against.
2. **`Purchase` fires only once, ever, per user — the ₹49 trial addon — and never again.** There is no event for the recurring ₹299/month charges (`subscription.charged`, handled server-side in the webhook, has zero Meta signal). Meta never sees the real lifetime value of a subscriber, only the trial price. If campaigns are using value-based bidding, this makes the input value drastically wrong.
3. **`Purchase` is gated only on the client checkout SDK's own "success" callback**, not on `result.activated` (the backend's own confirmed status). Razorpay's SDK only returns a payment id once genuinely captured, so this is *lower* risk than a fully-client-trusted flow, but there's still no reconciliation path — if the backend's poll never confirms (`activated: false`), the event has already fired and can't be walked back, and there's no compensating server event either.
4. **One-time purchases are completely uninstrumented** — no `ViewContent`, `InitiatedCheckout`, or `Purchase` anywhere in `PurchaseModal.tsx`'s flow.
5. **Zero server-side signal at all.** Every event depends on the app being foregrounded, the SDK successfully batching/flushing, and (on iOS) ATT consent — any of which silently drops the event with no way to recover it.
6. **No ATT (App Tracking Transparency) handling on iOS** despite a real iOS bundle id (`com.hastrekha.app`) and `advertiserIDCollectionEnabled: true` in the fbsdk plugin config. `expo-tracking-transparency` isn't installed. This is an Apple App Store compliance gap for any iOS build that ships.
7. **No dedup mechanism** (no `event_id` threading) — moot today since there's no CAPI/server-side channel to dedup against, but would need to be designed in from day one once one exists.
8. **Same real Meta App ID used for every build profile** (dev, preview, production — see `eas.json`) — internal QA/testing traffic pollutes the same ad account's real event data. No separate test/staging Meta app.

---

## 2. Astro101's own funnel — where equivalent events would go

Astro101 has no analytics of any kind today (confirmed: no `react-native-fbsdk-next` or any analytics package in `package.json`, no `analytics.ts`, no `logEvent`/`trackEvent` anywhere in the codebase). Platform target today is **Android only** (`app.json` has an `android` block, no `ios` block, no `GoogleService-Info.plist`) — unlike Hastrekha, which already ships both platforms.

**Decided scope for Astro101 — deliberately narrower than Hastrekha's set.** No `ViewContent` anywhere, and `Purchase` is limited to the trial and subscription (no `Purchase` for report unlock or wallet top-up):

| Event | Astro101 file | Trigger | Notes |
|---|---|---|---|
| SDK init | `app/_layout.tsx` (`RootLayout`, currently line ~21) | Root layout mount | Same pattern as Hastrekha |
| App Install (automatic) | — (config only) | First SDK init after install | Driven by `autoLogAppEventsEnabled: true` in the fbsdk plugin config — no call site, the SDK logs `fb_mobile_first_launch` on its own |
| App Activate (automatic) | — (config only) | Every app foreground/session start | Same config flag — `fb_mobile_activate_app`, also no call site |
| `CompleteRegistration` + `Login` | `app/(onboarding)/otp.tsx`, `handleVerify` (after `confirmOtp` succeeds, ~line 35) | OTP verified | **Must gate `CompleteRegistration` on a real new-vs-returning signal** — see gap below, same bug class as Hastrekha's #1 |
| `InitiatedCheckout` | `app/paywall/index.tsx`'s `handleStartTrial` and `app/paywall/upgrade.tsx`'s `handleSubscribe`, right before `openRazorpaySubscriptionCheckout` | Before Razorpay sheet opens | |
| `Purchase` (trial) | `app/paywall/index.tsx`, inside `finishTrial()` (called once `verification.status === 'ok'` or the poll confirms `trialCreditsClaimed`) | Trial confirmed | Astro101 already gates this correctly server-side (`verifyTrialPayment`/polling `getMandate()`) — better starting point than Hastrekha's client-only gate |
| `Purchase` (direct subscribe, and renewals) | `app/paywall/upgrade.tsx`'s `finish()`, **plus** server-side on `applyNewMandateRenewal` (`functions/src/services/mandate.service.ts`) | Subscription confirmed / renewed | Astro101's backend already has the exact right hook Hastrekha is missing — `applyNewMandateRenewal` fires on every real recurring charge (see the mandate-status work done earlier this session) |

Explicitly out of scope (decided): report unlock (`app/report/index.tsx`) and wallet top-up (`app/wallet/topup.tsx`) get no Meta events at all, for now.

### The `isNewUser` gap already exists in Astro101 too — worth fixing at the same time
Astro101's `signInUser()` (`functions/src/controllers/auth.controller.ts:30-49`) already computes `!snapshot.exists` internally to decide whether to create the user doc, but — exactly like Hastrekha — never returns that boolean to the client. `verifyOtpAndSignIn` (`auth.controller.ts:51-57`) only responds with `{ token, uid }`. This needs a matching `isNewUser` field added to the response (and threaded through `src/services/auth.service.ts`'s `confirmOtp()`) before `CompleteRegistration` can be gated correctly — otherwise Astro101 will inherit the exact same bug Hastrekha has.

---

## 3. Recommended architecture for Astro101 (client SDK + server-side, not client-only)

Take Hastrekha's client-wrapper pattern as the base (it's clean and worth reusing almost as-is), but close its two biggest gaps from day one:

1. **Client SDK (`react-native-fbsdk-next`) for events with no server equivalent**: `CompleteRegistration`, `Login`, `InitiatedCheckout`. These are fine to stay client-only — no money involved, no fraud/dedup concern. (App Install/Activate are automatic — see §2 — no explicit call needed.)
2. **Server-side App Events for the revenue events** (trial `Purchase`, direct-subscribe `Purchase`, and every subscription renewal) — fired from the exact backend functions that already authoritatively confirm each charge:
   - `applyNewMandateEntitlement` (trial's first charge / a direct subscription's first charge) — `functions/src/services/mandate.service.ts`
   - `applyNewMandateRenewal` (every recurring ₹299 charge) — same file. **This is the event Hastrekha has no equivalent of at all** — Astro101 can get real subscriber LTV signal into Meta that Hastrekha currently can't.
3. **Dedup via a shared `event_id`**: generate one per purchase (e.g. the Razorpay `paymentId` itself, which is already unique and available on both client and server) and pass it to both the client SDK's event log and the server-side App Events call for the same charge. Meta dedups client+server events sharing an `event_id` within its normal window, so this needs to be designed in from the start — Hastrekha never built this because it never added a server-side channel at all.

---

## 4. What's needed before implementation can start

### Meta Business Manager / Developer console
- [ ] Decide: reuse Hastrekha's existing Meta App (`1073090351978693`) — clearly not right, that's Hastrekha's own app identity — or confirm whether Astro101 already has its own Meta App registered somewhere. **If not, a new Meta App needs to be created** in Meta Business Manager, under the correct ad account/Business Manager, before any App ID/Client Token can be put in `app.json`.
- [ ] Once the Astro101 Meta App exists: App ID + Client Token (from Events Manager → Data Sources → this app) for the client SDK.
- [ ] **App Secret** (App dashboard → Settings → Basic) — required for server-side App Events API calls (different mechanism from web Pixel Conversions API; for mobile apps this is Meta's "Server-Side API for App Events", authenticated with an app access token derived from `app_id|app_secret`, or a System User token with the right permissions). Must be stored as a Firebase Functions secret (`META_APP_SECRET`), never committed, same pattern as `RAZORPAY_KEY_SECRET`.
- [ ] Decide whether a **separate test/staging Meta App** should exist so dev/internal QA traffic never lands in the real ad account's event data (Hastrekha does not do this — worth doing better in Astro101, especially since Astro101 has an `EXPO_PUBLIC_BACKEND_TARGET` (local/firebase/vercel) build-profile split already, in `eas.json`, that a second App ID could hook into).
- [ ] Confirm the actual ad campaign objective(s) marketing plans to run (trial signups vs. value-optimized subscriptions vs. report/top-up revenue) — this decides which events need to be *accurate* first vs. which can wait.

### iOS (only relevant once/if Astro101 ships iOS — it currently doesn't: no `ios` block in `app.json`)
- [ ] If iOS ships: `expo-tracking-transparency` + an ATT consent prompt must ship in the same build as `advertiserIDCollectionEnabled: true`, or the build risks App Store rejection. Not urgent today since Astro101 is Android-only, but should not be silently skipped later the way Hastrekha has.

### Product/compliance
- [ ] Confirm the privacy policy already covers sending hashed phone number (Advanced Matching) and device/ad identifiers to Meta — Astro101 already collects `phoneNumber` (E.164) on every user, which is a strong Advanced Matching signal once hashed (SHA-256) client-side per Meta's spec.

### Engineering
- [x] Add `isNewUser` to `verifyOtpAndSignIn`'s response (backend) and thread it through `confirmOtp()` (client) — prerequisite for correct `CompleteRegistration` gating. (`functions/src/controllers/auth.controller.ts`, `src/services/auth.service.ts`)
- [x] Add `react-native-fbsdk-next` + config plugin to `app.json`, with `autoLogAppEventsEnabled: true` so Install/Activate fire automatically. App ID `4636056799964613` / Client Token set — **client-only for now, no App Secret** (Hastrekha doesn't have one either — confirmed by grepping its `functions/`, it's 100% client-side too). Decided: skip server-side events for this pass, add them later.
- [x] Port `analytics.ts`'s wrapper pattern (lazy require, mock-mode flag via `EXPO_PUBLIC_META_MOCK_EVENTS`) into `src/services/analytics.ts` — trimmed to `logCompleteRegistration`, `logLogin`, `logInitiatedCheckout`, `logPurchase` (no `logViewContent`, matching the decided scope).
- [x] Wire client-side calls:
  - SDK init — `app/_layout.tsx`
  - `CompleteRegistration` (gated on `isNewUser`) + `Login` — `app/(onboarding)/otp.tsx`
  - `InitiatedCheckout` + `Purchase` (trial) — `app/paywall/index.tsx`
  - `InitiatedCheckout` + `Purchase` (direct subscribe) — `app/paywall/upgrade.tsx`
- [ ] **Still not done — deliberately deferred:** server-side `Purchase` event on `applyNewMandateRenewal` (`functions/src/services/mandate.service.ts`) for the recurring ₹299/month autopay charge, which never runs the client through any screen. This is still the one gap Astro101 can close that Hastrekha structurally can't — needs the App Secret when we're ready to do it.
- [ ] Decide on and implement the staging/production App ID split (Astro101 currently uses one App ID for every build profile, same gap as Hastrekha).

---

*This document is analysis + plan only — no code has been changed as part of it. Update it as decisions above get made, rather than starting a second doc.*
