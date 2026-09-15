import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';

import { env } from '../config/env';

/**
 * Grants the free-tier message credit balance server-side the moment a
 * user profile is created. The backend always creates the profile doc
 * with `credits: 0` right after OTP verification (see
 * controllers/auth.controller.ts) — only this trusted trigger sets the
 * real starting balance, so a client can never self-grant credits by
 * writing a large number at signup (and clients can't write to `users/*`
 * at all — see firestore.rules).
 */
export const onUserCreated = onDocumentCreated('users/{uid}', async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  await snapshot.ref.update({
    credits: env.credits.freeMessageCredits,
    updatedAt: FieldValue.serverTimestamp(),
  });
});
