import { getApp } from '@react-native-firebase/app';
import { getMessaging } from '@react-native-firebase/messaging';

/**
 * Firebase is kept only for push notifications (FCM) — sign-in and all
 * data access now go through the app's own backend (see src/services/
 * auth.service.ts, src/services/session.ts) via voicenSMS OTP + a custom
 * session token, not Firebase Authentication.
 */
export const firebaseApp = () => getApp();
export const messaging = () => getMessaging(firebaseApp());
