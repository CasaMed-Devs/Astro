import { onSchedule } from 'firebase-functions/v2/scheduler';

import { downgradeExpiredGracePeriods, processDueAutoDebits } from '../services/mandate.service';

/**
 * Runs hourly (not daily) because the trial's first auto-debit lands exactly
 * 24h after registration — a daily job could miss it by most of a day. Each
 * run charges every mandate whose nextAutoDebitAt has passed, then downgrades
 * anyone whose failed-charge grace period has elapsed. Both steps live in
 * mandate.service.ts so they can be invoked directly in tests/emulator.
 */
export const processAutoDebits = onSchedule(
  { schedule: 'every 60 minutes', region: 'asia-south1' },
  async () => {
    const result = await processDueAutoDebits();
    const downgraded = await downgradeExpiredGracePeriods();
    console.log(
      `[processAutoDebits] charged=${result.charged} failed=${result.failed} downgraded=${downgraded}`,
    );
  },
);
