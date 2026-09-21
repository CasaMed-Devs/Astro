# Astro101 — Firestore Database Structure

This documents the **actual current schema**, derived directly from `firestore.rules` and every `.collection(...)` call in `functions/src/`. It supersedes the "Database" section of `docs/BACKEND_AND_DATABASE.md`, which describes an earlier version of the chat architecture (see [§6 Known Inconsistencies](#6-known-inconsistencies--stale-references)).

Database: **Cloud Firestore** (NoSQL, document/collection model). All access goes through the Admin SDK on the backend (`functions/src/`) — the app has **no Firebase Auth session**, so `request.auth` is always `null` client-side and every collection is locked to `allow read, write: if false` except two explicitly public ones.

---

## 1. Collection Overview

| Collection | Doc ID | Written by | Read by client? | Purpose |
|---|---|---|---|---|
| `users` | the user's own phone number (E.164, e.g. `+919876543210`) | backend only | ❌ (via REST API instead) | One profile per person |
| `personaChats` | `${phoneNumber}_${profileId}` | backend only | ❌ | Thin ownership record for a chat session — **not** the message store |
| `subscriptions` | `{phoneNumber}` | backend only | ❌ | Astro101 Plus subscription state |
| `payments` | auto-ID | backend only | ❌ | Payment attempt log (Razorpay) |
| `transactions` | Razorpay payment ID | backend only | ❌ | One record per payment, incl. which channel confirmed it |
| `paymentOrders` | Razorpay order ID | backend only | ❌ | Every order we created; what payment reconciliation checks |
| `reports` | `{phoneNumber}` | backend only | ❌ | Kundali chart + AI-generated report |
| `otps` | `{phoneNumber}` | backend only | ❌ | Short-lived OTP verification state |
| `horoscopes/{sign}/daily` | `{date}` (`YYYY-MM-DD`) | backend only | ✅ public read | Cached daily horoscope per zodiac sign |
| `appConfig` | — | *nobody* | ✅ public read | Declared in rules, unused by any current code (dead) |

The client app never talks to Firestore directly — it calls the backend's REST API (`functions/src/routes`), which uses the Admin SDK (bypasses rules entirely). The Firestore rules exist purely as defense-in-depth in case someone tries to hit the database directly.

Chat **messages themselves are not stored in Firestore at all** — they live in an external "Persona API" vendor (see `functions/src/services/personaApi.service.ts`). `personaChats` only records who owns which session.

---

## 2. Collection Details

### `users/{phoneNumber}`
Source: `functions/src/types/index.ts` (`UserProfileRecord`), written in `auth.controller.ts`, `user.controller.ts`, `credits.service.ts`.

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Same as the doc ID and the same value as `phoneNumber` below — there's no Firebase Auth, so "uid" here just *is* the user's phone number (`functions/src/utils/uid.ts`); kept as its own field for API-response shape compatibility |
| `phoneNumber` | string | E.164 format, set at sign-in |
| `name` | string? | Set via `PUT /users/me/name` |
| `dateOfBirth` | string? | Set via birth-details form |
| `timeOfBirth` | string? | |
| `placeOfBirth` | string? | Free-text place name |
| `latitude` | number? | From place autocomplete / geocoding |
| `longitude` | number? | |
| `timezoneOffset` | number? | |
| `gender` | `'female' \| 'male' \| 'other'`? | |
| `credits` | number | Free-tier message balance. **Only the backend mutates this**, via `FieldValue.increment(-cost)` inside a transaction (`credits.service.ts`) — prevents race-condition overspend |
| `fcmTokens` | string[] | Push notification tokens; set at sign-in as `[]`, used by `subscriptionExpiry.ts` to send renewal reminders. No code currently *adds* tokens after creation — see §6 |
| `createdAt` / `updatedAt` | Timestamp | Server-set |

### `personaChats/{sessionId}`
Source: `functions/src/services/chat.service.ts`. `sessionId = ${phoneNumber}_${profileId}`, so re-opening the same astrologer always resumes the same session — no duplicate chat docs per persona.

| Field | Type | Notes |
|---|---|---|
| `userId` | string | Owner; checked on every read/write (`requireOwnedChat`) |
| `profileId` | string | Which astrologer persona |
| `createdAt` | Timestamp | Server-set on first open |

The `ChatMeta` TypeScript interface also declares `updatedAt` and `lastMessage`, but **no code path currently writes either field** — they'll always come back `undefined`/fallback in the API response. Actual message history (who said what, when) is fetched live from the Persona API vendor per request, not persisted here.

### `subscriptions/{phoneNumber}`
Source: `functions/src/types/index.ts` (`SubscriptionRecord`), written in `payment.controller.ts`, `webhook.controller.ts`, read in `credits.service.ts`, `status.controller.ts`, expired by `scheduled/subscriptionExpiry.ts`.

| Field | Type | Notes |
|---|---|---|
| `planId` | string | e.g. an "Astro101 Plus" plan key |
| `status` | `'active' \| 'pending' \| 'cancelled' \| 'expired' \| 'failed'` | `'active'` bypasses the credit check entirely in `assertAndConsumeEntitlement` |
| `razorpayCustomerId` | string? | |
| `razorpaySubscriptionId` | string? | Set to the Razorpay order ID on verify |
| `currentPeriodStart` | Timestamp? | |
| `currentPeriodEnd` | Timestamp? | Checked daily by the scheduled function to auto-expire and send a 3-day renewal reminder push |
| `updatedAt` | Timestamp | |

Lifecycle: `pending` (order created) → `active` (signature verified, or Razorpay webhook `subscription.charged`) → `cancelled` / `failed` (webhook) / `expired` (scheduled function, past `currentPeriodEnd`).

### `payments/{autoId}`
Source: `functions/src/controllers/payment.controller.ts`. Append-only log, one doc per payment attempt (`.add(...)`, never updated).

| Field | Type | Notes |
|---|---|---|
| `userId` | string | |
| `orderId` | string | Razorpay order ID |
| `razorpayPaymentId` | string | |
| `purpose` | `'subscription' \| 'report'` | |
| `status` | string | Always written as `'paid'` at creation time (only reached after signature verification succeeds) |
| `createdAt` | Timestamp | |

### `transactions/{razorpayPaymentId}`
Source: `functions/src/services/transactions.service.ts` (`recordTransaction`). One doc per Razorpay payment; `payments` remains the idempotency ledger and this collection is the audit/user-facing record. Written best-effort — a failure to record never blocks a payment.

| Field | Type | Notes |
|---|---|---|
| `userId`, `paymentId`, `orderId` | string | Links to `users/{userId}` and `paymentOrders/{orderId}`. `orderId` may be null (e.g. some auto-debits) |
| `subscriptionId` | string? | Links to `subscriptions/{id}` (equals `userId`); null for one-off top-ups and kundali unlocks |
| `purpose` | `'topup' \| 'trial' \| 'subscription' \| 'direct_subscription' \| 'report' \| 'autodebit'` | |
| `status` | `'paid' \| 'failed'` | Failed auto-debits are recorded from the `payment.failed` webhook |
| `amount` / `currency` | number (rupees) / string | |
| `creditsAwarded` | number | 0 when the payment awards none |
| `paymentMethod` | string? | `card` / `upi` / … from the Razorpay payment when known, else the user's stored `mandateMethod` |
| `createdVia` | `'client_verify' \| 'webhook' \| 'reconciliation' \| 'auto_debit'` | The first channel that recorded it. `client_verify` is the app's `/verify` call right after checkout (client-side polling only reads and never records) |
| `confirmedVia` | string[] | Every channel that has confirmed this payment — shows the redundancy firing (e.g. `['webhook', 'client_verify']`) |
| `sequence` | number | This user's nth transaction (1, 2, 3 …) |
| `failureReason` | string? | For `failed` |
| `createdAt`, `updatedAt` | Timestamp | |

**Relationships.** Firestore has no foreign keys, so links are stored as ids and checked by `recordTransaction`, which writes the transaction and all parent pointers in one atomic Firestore transaction:

```
users/{uid} ──subscriptionId──▶ subscriptions/{uid} ──lastTransactionId──▶ transactions/{paymentId}
users/{uid} ──lastTransactionId──▶ transactions/{paymentId}
transactions/{paymentId} ──userId / subscriptionId / orderId──▶ users / subscriptions / paymentOrders
payments/{…} and paymentOrders/{orderId} ──transactionId──▶ transactions/{paymentId}
```

A transaction is refused (logged, payment unaffected) if its user doc doesn't exist, or if its `orderId` was recorded for a different user. A failed charge never moves the subscription's `lastTransactionId`. Because recording is best-effort, a pointer can occasionally be missing (never wrong); only new payments carry these links.

`users/{phoneNumber}.transactionCount` is incremented once per newly created transaction, alongside `lastTransactionId` and (for subscription payments) `subscriptionId`. The synthetic `token_<id>` id used by the `token.confirmed` webhook is not a real payment and never creates a transaction.

### `paymentOrders/{razorpayOrderId}`
Source: `functions/src/services/paymentOrders.service.ts`, resolved in `reconcile.service.ts`. Recorded when an order is created (`status: 'created'`, with `userId`); gets a `transactionId` once its payment is recorded; reconciliation marks it `paid` (with `razorpayPaymentId`, `resolvedVia`) or `expired` after 7 days without a captured payment.

### `reports/{phoneNumber}`
Source: `functions/src/types/index.ts` (`ReportRecord`), written/read in `report.service.ts`, `status.controller.ts`.

| Field | Type | Notes |
|---|---|---|
| `status` | `'pending' \| 'ready' \| 'failed'` | |
| `content` | string? | AI-written report text (600–900 words), set once `status: 'ready'` |
| `kundali` | object? | Set as soon as chart math completes — **before** the AI text step, so the chart renders even if AI generation later fails |
| `kundali.geo` | `{ latitude, longitude, timezoneOffset, completeName }` | |
| `kundali.planets[]` | `{ name, fullDegree, normDegree, isRetrograde, currentSign, houseNumber? }` | One entry per planet + Ascendant |
| `kundali.mahaDasas[]` | `{ lord, startTime, endTime }` | Vimsottari Maha Dasha periods (ISO date strings) |
| `generatedAt` | Timestamp? | Set only once the AI text finishes |

Written with `{ merge: true }` at each stage (`pending` → kundali saved → `ready`/`failed`), so a failure after the chart is calculated still leaves the chart visible to the user.

### `otps/{phoneNumber}`
Source: `functions/src/services/otp.service.ts`. Doc ID is the raw phone number — short-lived, self-cleaning.

| Field | Type | Notes |
|---|---|---|
| `codeHash` | string | `sha256(phoneNumber:code)` — the code itself is never stored |
| `expiresAt` | Timestamp | 5-minute TTL |
| `attempts` | number | Incremented on each wrong guess; deleted after 5 failed attempts |
| `createdAt` | Timestamp | Also used to enforce a 30s resend cooldown |

Deleted immediately on successful verification, on expiry, or after too many failed attempts.

### `horoscopes/{sign}/daily/{date}`
Source: `functions/src/services/horoscope.service.ts`. The only collection with a genuine public client read.

| Field | Type | Notes |
|---|---|---|
| `sign` | string | e.g. `"aries"` |
| `date` | string | `YYYY-MM-DD`, also the doc ID under `daily` |
| `content` | string | AI-generated (falls back to a curated static string per sign if the AI provider isn't configured) |
| `createdAt` | Timestamp | |

Computed **once per sign per day** and cached — subsequent requests for the same sign/day reuse the doc instead of re-calling the AI.

### `appConfig/{document}` — *unused*
Declared in `firestore.rules` with public read access, but **no code anywhere reads or writes it**. Reserved for future use (e.g. remote feature flags / maintenance banner) — not yet wired up.

---

## 3. IDs & Relationships

```
users/{phoneNumber}                              doc id = the user's own E.164 phone number
  │
  ├─ owns ──▶ personaChats/{phoneNumber}_{profileId}   (1 per user × persona pair, deterministic)
  ├─ owns ──▶ subscriptions/{phoneNumber}              (0 or 1)
  ├─ owns ──▶ reports/{phoneNumber}                    (0 or 1 — latest report only, overwritten each regenerate)
  └─ referenced by ──▶ payments/{autoId}.userId        (many, append-only log)

otps/{phoneNumber}                       same key space — exists pre-account-creation

horoscopes/{sign}/daily/{date}           global, not user-scoped
```

Every per-user collection above is keyed directly by the phone number (or `${phoneNumber}_${profileId}`), so there are no join queries — ownership is enforced by doc-ID equality plus an explicit `userId` field check in the handler (e.g. `requireOwnedChat`), not by a Firestore query.

---

## 4. Security Rules Summary (`firestore.rules`)

```
users/{phoneNumber}                deny all
chats/{chatId}                     deny all   ⚠️ stale, see §6
  messages/{messageId}             deny all   ⚠️ stale, see §6
subscriptions/{phoneNumber}        deny all
payments/{paymentId}               deny all
reports/{phoneNumber}              deny all
personaChats/{sessionId}           deny all
personaConfig/{profileId}          deny all
otps/{phoneNumber}                 deny all
horoscopes/{sign}/daily/{date}     read: true,  write: false
appConfig/{document}               read: true,  write: false
```

Because the app authenticates via a custom backend-issued JWT (not Firebase Auth), `request.auth` is always `null` for any request coming from the phone — so the `if false` rules aren't really doing fine-grained per-user filtering, they're a blanket "the client can never touch this collection at all" wall. All real authorization (whose chat/report/subscription this is) happens in the backend's own handler code via `req.uid` (== the caller's phone number) from the verified JWT.

`firestore.indexes.json` is empty — no composite indexes are currently defined (queries like `chats.where('userId', '==', uid)` in `account.controller.ts` run against a single field, which Firestore indexes automatically).

---

## 5. Related: Cloud Storage (`storage.rules`)

```
users/{uid}/avatar/{fileName}
  read: true
  write: request.auth != null && request.auth.uid == uid && size < 5MB && image/*
```

Not part of Firestore, but worth flagging alongside it: this rule requires `request.auth.uid`, which — same as above — is never populated, since the app doesn't use Firebase Auth. No current app screen uploads a user avatar either, so this path is effectively dead code today (a client write here would always be denied).

---

## 6. Known Inconsistencies / Stale References

Found while cross-referencing `firestore.rules` against actual backend code — flagging rather than silently "fixing," since these may be intentional leftovers from a migration:

1. **`chats` vs `personaChats`** — `firestore.rules` still declares `chats/{chatId}` and a `messages` subcollection, matching an older architecture where messages were stored directly in Firestore. The current `chat.service.ts` uses a *different* collection, `personaChats`, and stores no messages in Firestore at all (they live in the external Persona API). The `chats` rule is now dead.
2. **`account.controller.ts` deletes the wrong collection** — `deleteAccount` still queries `chats` (`db.collection('chats').where('userId', '==', uid)`) to clean up on account deletion, but real chat-ownership docs live in `personaChats`. As written today, **account deletion does not remove a user's `personaChats` docs** — likely an oversight from the same migration.
3. **`appConfig`** — declared with public read access in rules, but no backend code reads or writes it yet.
4. **`fcmTokens`** — initialized to `[]` at sign-in and read by the subscription-expiry reminder job, but no endpoint currently exists to *populate* it, so renewal push notifications can't actually be delivered yet.

None of these break the app's current features (chat works fine via `personaChats` + the vendor API) — they're just gaps worth closing: point `deleteAccount` at `personaChats`, and either remove the stale `chats` rule or repurpose it.

---

## 7. Quick Reference: Types Source

All backend-side shapes above are typed in `functions/src/types/index.ts` (`UserProfileRecord`, `SubscriptionRecord`, `ReportRecord`, `ChatMessageRecord`). The client mirrors a subset in `src/types/firestore.ts` for API response typing — client types describe the JSON the backend returns, not the raw Firestore documents.
