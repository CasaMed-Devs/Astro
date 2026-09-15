import cors from 'cors';
import express, { type Express } from 'express';

import { router } from './routes';
import { handleRazorpayWebhook } from './controllers/webhook.controller';
import { asyncHandler } from './utils/asyncHandler';
import { errorHandler } from './middleware/errorHandler';

/**
 * Plain Express app shared by both entrypoints:
 *  - index.ts wraps it as a Cloud Function for deploy.
 *  - server.ts runs it with `app.listen()` for local development.
 * Keeping all routing/business logic here (not in either entrypoint) is
 * what lets local dev work without the Firebase Emulator Suite.
 */
export function createApp(): Express {
  const app = express();

  app.use(cors());

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
