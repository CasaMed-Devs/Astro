import { onRequest } from 'firebase-functions/v2/https';

import { createApp } from './app';

const app = createApp();

export const api = onRequest({ region: 'asia-south1', invoker: 'public' }, app);

export { processAutoDebits } from './scheduled/processAutoDebits';
export { onUserCreated } from './triggers/onUserCreated';
