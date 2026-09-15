import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

import { env } from './env';

/**
 * Works identically when run locally (`server.ts`, credentials from
 * env vars) and when deployed as a Cloud Function (`index.ts`, where
 * `initializeApp()` with no args picks up Application Default
 * Credentials automatically) — no Firebase Emulator required either way.
 */
function createApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  if (env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey) {
    return initializeApp({
      credential: cert({
        projectId: env.firebase.projectId,
        clientEmail: env.firebase.clientEmail,
        privateKey: env.firebase.privateKey,
      }),
    });
  }

  return initializeApp();
}

const app = createApp();

export const adminFirestore = () => getFirestore(app);
export const adminMessaging = () => getMessaging(app);
