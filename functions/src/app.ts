import cors from 'cors';
import express, { type Express } from 'express';

import { router } from './routes';
import { handleRazorpayWebhook } from './controllers/webhook.controller';
import { asyncHandler } from './utils/asyncHandler';
import { errorHandler } from './middleware/errorHandler';
import { env } from './config/env';

/**
 * Plain Express app shared by both entrypoints:
 *  - index.ts wraps it as a Cloud Function for deploy.
 *  - server.ts runs it with `app.listen()` for local development.
 * Keeping all routing/business logic here (not in either entrypoint) is
 * what lets local dev work without the Firebase Emulator Suite.
 */
export function createApp(): Express {
  const app = express();

  // /admin/* is called from the standalone admin-dashboard app (its own
  // origin, e.g. a separate Vercel deploy) using a cookie session, which
  // requires CORS credentials enabled for that exact origin — the wildcard
  // cors() used for the rest of the API can't be combined with credentials.
  // Everything else (the mobile app) authenticates with a Bearer token, not
  // a cookie, so it doesn't need credentialed CORS at all.
  app.use((req, res, next) => {
    if (req.path.startsWith('/admin')) {
      return cors({ origin: env.admin.dashboardOrigin, credentials: true })(req, res, next);
    }
    return cors()(req, res, next);
  });

  // Razorpay webhook needs the raw body for signature verification, so it
  // must be registered before the global JSON body parser below.
  app.post(
    '/webhooks/razorpay',
    express.raw({ type: 'application/json' }),
    asyncHandler(handleRazorpayWebhook),
  );

  app.use(express.json());
  app.use(router);

  app.use(errorHandler);

  return app;
}
