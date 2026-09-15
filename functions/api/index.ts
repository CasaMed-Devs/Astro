import { createApp } from '../src/app';

// This app parses request bodies itself (express.json() for most routes,
// express.raw() for the Razorpay webhook's signature check in app.ts) the
// same way as the Firebase and local dev entrypoints — Vercel's own body
// parsing must be disabled or the webhook's raw-body verification breaks.
export const config = {
  api: { bodyParser: false },
};

export default createApp();
