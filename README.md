# Astro101

An AI-astrologer chat app built with React Native (Expo) + a Firebase-backed Node/Express API. Onboarding, birth-details, an AI kundali report, an astrologer/persona chat, and an Astro101 Plus subscription paywall — all built from the [Astro101 Figma design](https://www.figma.com/design/Wsv2rE8AswBECuWU5xSwxh/Astro101).

## Product decisions baked into this codebase

These were decided during planning and are reflected throughout the code — read this before you go looking for something that "should" be here:

- **Astrologers are AI personas, not real people.** Each persona in `src/features/astrologers/config/personas.ts` (mirrored server-side in `functions/src/config/personas.ts`) has its own specialty, tone, and system prompt. There is no astrologer login or human-operator backend.
- **The AI provider is pluggable, not chosen.** `functions/src/services/ai.service.ts` picks OpenAI or Anthropic based on the `AI_PROVIDER` env var. Until it's set, every AI-backed endpoint (chat replies, horoscopes, the kundali report) returns a clear 503 "temporarily unavailable" — never a fake canned response.
- **Monetization is credits + subscription + one-time report unlock.** New users get a fixed number of free AI messages (`FREE_MESSAGE_CREDITS`), granted server-side by a Firestore trigger the moment their profile is created (never client-writable). Astro101 Plus grants unlimited messages. The kundali report is a separate one-time purchase.
- **No pricing is hardcoded anywhere.** `src/features/payments/config/plans.ts` and the corresponding backend env vars are left unset; the paywall and report screens render a "pricing coming soon" state until you configure real amounts.
- **Android-first.** Firebase Phone Authentication uses `@react-native-firebase/auth` (native SDK), which requires an EAS custom development client — this **will not run in plain Expo Go**. iOS can be added later by supplying an `ios` block in `app.json` and a matching `GoogleService-Info.plist`.
- **No Firebase project or Razorpay account exists yet.** Every credential is a placeholder (see `.env.example` / `functions/.env.example`) — the app is structured so you drop in real values and it starts working, with no code changes.

## Tech stack

- **Mobile**: Expo (SDK 57), TypeScript, Expo Router, React Query, `@react-native-firebase` (auth/firestore/storage/messaging), `react-native-razorpay`
- **Backend**: Express (TypeScript) shared between a local Node server and a Firebase Cloud Function — see [Backend architecture](#backend-architecture)
- **Data**: Firestore (see [Firestore schema](#firestore-schema)), Firebase Storage, Firebase Cloud Messaging
- **Payments**: Razorpay Orders API, backend-verified signatures
- **Tooling**: ESLint (flat config) + Prettier, Jest (mobile: `jest-expo`; backend: `ts-jest`)

## Project structure

```
astro101/
├── app/                        Expo Router screens (file-based routing)
│   ├── (onboarding)/           Carousel → mobile number → OTP → birth details
│   ├── (tabs)/                 Home, Horoscope, Astrologers, Profile
│   ├── astrologer/[id].tsx     Persona detail
│   ├── astrologer/chat/[chatId].tsx
│   ├── paywall/, report/, settings/
│
├── src/
│   ├── components/             common/, buttons/, forms/, cards/, states/
│   ├── constants/               theme.ts (design tokens from Figma), zodiac.ts
│   ├── features/                auth/, astrologers/, chat/, payments/, onboarding/
│   ├── firebase/                config.ts, firestore.ts
│   ├── services/                one file per domain: auth, user, chat, payment,
│   │                            subscription, horoscope, report, account, apiClient
│   ├── hooks/, types/, utils/, validation/
│
├── functions/                   Backend — deployable AND locally runnable
│   ├── src/
│   │   ├── app.ts               Express app (routes + middleware) — the shared core
│   │   ├── index.ts              Cloud Functions entrypoint (wraps app.ts)
│   │   ├── server.ts             Local dev entrypoint (wraps app.ts)
│   │   ├── controllers/, services/, middleware/, routes/, config/, scheduled/, triggers/
│   └── package.json             Separate dependency tree (deployed as its own unit)
│
├── firestore.rules, storage.rules, firestore.indexes.json, firebase.json
├── app.json, eas.json
├── .env.example, functions/.env.example
```

## Backend architecture: one Express app, two entrypoints

`functions/src/app.ts` contains all routing and business logic. It is wrapped by:

- **`functions/src/server.ts`** — runs `app.listen()` locally with `ts-node-dev`. **No Firebase Emulator required.**
- **`functions/src/index.ts`** — wraps the same app as `onRequest()` for deployment.

Both initialize Firebase Admin from the same `functions/src/config/firebase-admin.ts`, which reads a service account from env vars locally and falls back to Application Default Credentials when deployed. This means local dev talks to your **real** (presumably dev-tier) Firebase project and Razorpay test-mode keys — there's no emulator layer to keep in sync.

## Firestore schema

```
users/{uid}                    name, phone, dob/time/place, gender, credits, fcmTokens[]
chats/{chatId}                 userId, personaId, lastMessage
chats/{chatId}/messages/{id}   sender: 'user'|'astrologer', text, status
subscriptions/{uid}            planId, status, razorpay ids, period start/end
payments/{paymentId}           userId, orderId, purpose: 'subscription'|'report', status
reports/{uid}                  status: 'pending'|'ready'|'failed', content
horoscopes/{sign}/daily/{date} sign, date, content
```

Astrologer personas and subscription plans are **not** Firestore collections — they're typed config files on both the app and backend, editable without a data migration.

### Security rules highlights

- `users/{uid}.credits` can only be changed by the Admin SDK (a rule blocks any client update that changes it); a Firestore trigger grants free credits on account creation.
- Chat messages: a client may only create `sender: 'user'` messages; astrologer replies are written exclusively by the backend.
- `subscriptions`, `payments`, `reports`: read-only for the owning user, no client writes at all.

## Getting started

### 1. Install dependencies

```bash
npm install
npm install --prefix functions
```

### 2. Set up a Firebase project (you'll need to do this once)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Enable **Authentication → Phone** sign-in.
3. Create a **Firestore** database and a **Storage** bucket.
4. Add an Android app with package name `com.astro101.app`; download `google-services.json` into the project root (it's git-ignored — `google-services.json.example` shows the shape).
5. Generate a service account key (Project settings → Service accounts → Generate new private key) and fill in `functions/.env`:
   ```
   FIREBASE_PROJECT_ID=...
   FIREBASE_CLIENT_EMAIL=...
   FIREBASE_PRIVATE_KEY=...
   ```
6. Deploy security rules once you're ready to test against real data (see [Deploying](#deploying-firebase)).

### 3. Configure environment variables

```bash
cp .env.example .env
cp functions/.env.example functions/.env
```

Fill in `functions/.env` as you get each credential — everything works incrementally:

- No `AI_PROVIDER`/API key → chat, horoscope, and report endpoints return a clear "temporarily unavailable" error; the rest of the app works.
- No Razorpay keys → the paywall and report screens show "pricing coming soon"; nothing crashes.
- No `SUBSCRIPTION_PRICE_AMOUNT`/`REPORT_PRICE_AMOUNT` → same as above, by design (see [Product decisions](#product-decisions-baked-into-this-codebase)).

### 4. Point the app at your backend

```bash
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` in `.env`. This is **not** `localhost` for a physical device — a phone's own "localhost" is the phone itself, not your computer. Use your computer's LAN IP instead (find it with `ipconfig` on Windows / `ifconfig` on macOS/Linux, the WiFi adapter's IPv4 address), e.g. `http://192.168.1.15:3000`, and make sure your phone and computer are on the **same WiFi network** — mobile data can never reach your dev machine. An Android emulator (not a physical device) can instead use `http://10.0.2.2:3000`, which always maps to the host machine regardless of network.

If your computer's IP changes (reconnecting to WiFi), update this value and reload the app.

### 5. Run the backend + app together

Firebase Phone Auth needs the native SDK, which needs a **custom dev client** — plain Expo Go will crash on the auth screens.

```bash
npx expo prebuild -p android      # generates the native android/ project, once
eas build --profile development --platform android   # or: npx expo run:android
npm run android                   # after the dev client is installed: starts the backend AND Metro together
```

`npm run android` (and `npm start`) now run the local backend (`backend:dev`) and the Expo/Metro process together via `concurrently`, labeled `[BACKEND]`/`[APP]` in the terminal — stopping either one stops both. Run them separately with `npm run android:app` / `npm run start:app` (frontend only) and `npm run backend:dev` (backend only) if you ever need to.

The backend logs both the `localhost` and LAN-reachable URLs on startup — use the LAN one to confirm it matches `EXPO_PUBLIC_API_URL`.

### 6. Add the AI provider key when you have one

```
AI_PROVIDER=openai            # or anthropic
OPENAI_API_KEY=sk-...         # or ANTHROPIC_API_KEY
```

Nothing else changes — restart the backend and chat/horoscope/report generation start working immediately.

### 7. Configure Razorpay

1. Get test-mode keys from the [Razorpay dashboard](https://dashboard.razorpay.com) → Settings → API Keys.
2. Fill in `functions/.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
3. Set a webhook (Settings → Webhooks) pointing at `<your-backend-url>/webhooks/razorpay` for `subscription.charged`, `subscription.cancelled`, `payment.failed`; copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.
4. Set real prices in `functions/.env` (`SUBSCRIPTION_PRICE_AMOUNT`/`CURRENCY`, `REPORT_PRICE_AMOUNT`/`CURRENCY` — amounts are in the smallest currency unit, e.g. paise) and mirror the display copy in `src/features/payments/config/plans.ts`.

> **Note on subscriptions**: this backend uses Razorpay's **Orders API** to collect the first charge and marks the subscription active on verified payment — it does not yet call Razorpay's separate Subscriptions API for automated recurring billing. Wiring that up (a Razorpay Plan + Subscription, with the existing webhook handler already listening for `subscription.charged`/`cancelled`) is the natural next step once you're ready to charge recurring, unattended renewals.

## Development commands

```bash
npm run start           # Backend + Metro bundler together (needs a dev-client build, not Expo Go)
npm run android         # Backend + expo run:android together
npm run start:app       # Metro only, no backend
npm run android:app     # expo run:android only, no backend
npm run lint            # ESLint, zero warnings allowed
npm run typecheck       # tsc --noEmit
npm run test            # Jest (mobile)

npm run backend:dev     # Local backend with hot reload, standalone
npm run backend:build   # Compile functions/ to functions/lib
npm run backend:test    # Jest (backend)
```

## Building for real devices

```bash
eas login                                  # if not already
eas build:configure
eas build --profile preview --platform android    # shareable APK
eas build --profile production --platform android # AAB for Play Store
```

## Deploying Firebase

```bash
firebase login
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only functions
```

`firebase.json`'s `predeploy` hook runs `npm run build` inside `functions/` automatically. Cloud Functions deploy with Application Default Credentials — you don't need `FIREBASE_PRIVATE_KEY` set in production, only Razorpay/AI provider secrets (set via `firebase functions:config:set` or, for 2nd-gen functions, your own secret manager / `.env` bundled at deploy time — do not commit it).

## What's genuinely not built yet (by design, not oversight)

- **Astrologer/AI provider key** — the integration boundary (`ai.service.ts` + two adapters) is complete; you supply the key.
- **Real pricing** — plans and report price are structurally complete but intentionally unpriced.
- **Recurring Razorpay Subscriptions API integration** — see the note above; the current flow verifies a first payment and the webhook handler is ready, but true auto-renewing subscriptions need the Subscriptions API wired into `payment.controller.ts`.
- **iOS build target** — Android-only was the agreed v1 scope; adding iOS is mostly `app.json` config plus a `GoogleService-Info.plist`.
- **In-app admin UI for personas/pricing** — intentionally out of scope for v1; edit the config files and redeploy.

## Figma reference

Design source: [Astro101 in Figma](https://www.figma.com/design/Wsv2rE8AswBECuWU5xSwxh/Astro101). Design tokens (colors, type scale, radii) were extracted directly from the file into `src/constants/theme.ts`. The Figma file covers onboarding, phone entry, birth details, the kundali report teaser, the Plus paywall, and the astrologer list. Screens it doesn't include — OTP verification, home tab, chat, persona detail, profile, settings — were designed to match that same system (same tokens, same component patterns).
