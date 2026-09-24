# Astro108 Admin Dashboard

Standalone React + Vite admin app for managing astrologer pricing/order, paywall pricing, and
looking up user accounts. Talks to the `functions/` backend's `/admin/*` API over a cookie
session — it does not share a codebase or deploy with the backend or the mobile app.

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
