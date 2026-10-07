# Astro108 Admin Dashboard

Standalone React + Vite admin app for managing astrologer pricing/order, paywall pricing, and
looking up user accounts. Talks to the `functions/` backend's `/admin/*` API over a cookie
session — it does not share a codebase or deploy with the backend or the mobile app.

## Access settings

Manual subscription controls for support, all keyed by the user's mobile number (10 digits get
`+91` added). Every action is confirmed on screen first and recorded in the **Activity log** with
the name the admin typed at sign-in. Dates are calendar days in India time (IST).

- **Give subscription** — adds credits on top of the user's balance and keeps their subscription
  active until the end of the chosen date. A user who already pays for a subscription only gets
  the credits.
- **Reset subscription** — back to a brand-new state: subscription `none`, Razorpay auto-debit
  cancelled, credits 0, Rs.1 trial claimable again. Profile, chats, kundali and payment history
  are kept.
- **Expire subscription** — ends an active subscription and cancels the Razorpay auto-debit.
  Credits are kept.
- **Get dispute data** — every payment (paid or failed) and admin credit grant for a user.

Reset and Expire run immediately for today's date; a future date is queued and applied by the
backend's `adminActionsSweep` scheduled function (every 15 minutes), or when the user next opens
the app.

## Local development

1. Copy `.env.example` to `.env` and set `VITE_API_URL` to your local backend
   (defaults to `http://localhost:3000`, matching `npm run backend:dev` in the repo root).
2. In `functions/.env`, set `ADMIN_PASSWORD` and `ADMIN_DASHBOARD_ORIGIN=http://localhost:5174`
   (this app's dev server port) — the backend refuses the cross-origin cookie session
   without an exact origin match.
3. `npm install && npm run dev` — opens on `http://localhost:5174`.

## Deploying

`npm run build` produces a static `dist/` folder — deploy it anywhere that serves static files
(Vercel, Netlify, etc.), then set `ADMIN_DASHBOARD_ORIGIN` on the backend to that deployed URL.
