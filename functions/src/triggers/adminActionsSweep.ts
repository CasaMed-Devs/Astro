import { onSchedule } from 'firebase-functions/v2/scheduler';

import { runDueAdminActions } from '../services/adminSubscription.service';

/**
 * Applies the dashboard's dated subscription actions when their day arrives:
 * scheduled resets/expiries, and admin-given subscriptions that have run
 * out. A user's own app-open applies theirs too (see reconcile.service.ts),
 * but only this sweep stops a future-dated expiry's auto-debit on time for
 * someone who never opens the app.
 */
export const adminActionsSweep = onSchedule(
  { schedule: 'every 15 minutes', region: 'asia-south1' },
  async () => {
    await runDueAdminActions();
  },
);
