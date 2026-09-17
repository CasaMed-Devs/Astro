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
// functions/.env can't set FIREBASE_PROJECT_ID itself — Firebase's own env
// loader rejects any FIREBASE_-prefixed key at deploy time — so the project
// id here is a plain fallback used whenever it isn't supplied another way
// (e.g. on Vercel, where that restriction doesn't apply).
const DEFAULT_PROJECT_ID = 'astro-d9814';

function createApp(): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  if (env.firebase.clientEmail && env.firebase.privateKey) {
    const projectId = env.firebase.projectId ?? DEFAULT_PROJECT_ID;

    if (!env.firebase.privateKey.includes('BEGIN PRIVATE KEY')) {
      // Never log the key itself — just enough shape info to diagnose a bad
      // FIREBASE_PRIVATE_KEY / FIREBASE_PRIVATE_KEY_B64 value without a leak.
      console.error('[firebase-admin] FIREBASE_PRIVATE_KEY does not look like a valid PEM key after normalization', {
        length: env.firebase.privateKey.length,
        startsWith: env.firebase.privateKey.slice(0, 15),
        newlineCount: (env.firebase.privateKey.match(/\n/g) ?? []).length,
      });
    }

    return initializeApp({
      projectId,
      credential: cert({
        projectId,
        clientEmail: env.firebase.clientEmail,
        privateKey: env.firebase.privateKey,
      }),
    });
  }

  if (env.firebase.projectId) {
    return initializeApp({ projectId: env.firebase.projectId });
  }

  return initializeApp({ projectId: DEFAULT_PROJECT_ID });
}

const app = createApp();

export const adminFirestore = () => getFirestore(app);
export const adminMessaging = () => getMessaging(app);
