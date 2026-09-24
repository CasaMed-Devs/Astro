import { onRequest } from 'firebase-functions/v2/https';

import { createApp } from './app';

const app = createApp();

// No `invoker: 'public'` here on purpose: the app only ever reaches this
// function through the Firebase Hosting rewrite (see firebase.json), which
// invokes it via Hosting's own service identity rather than a public
// `allUsers` binding. Declaring `invoker: 'public'` forces Firebase CLI to
// (re-)set that IAM binding on every deploy, which this org's Domain
// Restricted Sharing policy (iam.allowedPolicyMemberDomains) blocks
// outright — no IAM role can override an org policy constraint, so every
// deploy failed on that step regardless of the deploying account's
// permissions.
export const api = onRequest({ region: 'asia-south1' }, app);

export { processAutoDebits } from './scheduled/processAutoDebits';
export { onUserCreated } from './triggers/onUserCreated';
