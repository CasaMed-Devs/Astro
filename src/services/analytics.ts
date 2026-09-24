/**
 * Meta (Facebook) event tracking — client-side only for now (see
 * META_INTEGRATION.md for the full plan, including the server-side
 * Purchase/renewal events still to come). Ported from HOTI/hastrekha's
 * src/services/analytics.ts, trimmed to the events Astro101 actually wants:
 * no ViewContent, and Purchase only for the trial/subscription (never
 * report unlock or wallet top-up).
 *
 * Uses `react-native-fbsdk-next` (app.json's plugin config carries the real
 * appID/clientToken). Lazily required, not imported at the top of this file
 * — same reasoning as src/services/payment.service.ts's react-native-razorpay
 * usage: both are native modules that don't exist inside plain Expo Go, so a
 * top-level import would crash app startup there even when a call is never
 * actually made.
 *
 * Set EXPO_PUBLIC_META_MOCK_EVENTS=true to log every call to the console
 * with a "[META EVENT]" prefix instead of touching the native SDK — lets the
 * call sites (OTP verify, paywall, etc.) be exercised in Expo Go/simulator
 * without a native rebuild, mirroring hastrekha's USE_MOCKS flag.
 */

const MOCK_EVENTS = process.env.EXPO_PUBLIC_META_MOCK_EVENTS === 'true';

type EventParams = Record<string, string | number | boolean | undefined>;

function logMock(eventName: string, params?: EventParams): void {
  // eslint-disable-next-line no-console
  console.log(`[META EVENT] ${eventName}`, params ?? {});
}

function getAppEventsLogger() {
  return require('react-native-fbsdk-next').AppEventsLogger;
}

function getSettings() {
  return require('react-native-fbsdk-next').Settings;
}

export const MetaEvents = {
  init() {
    if (MOCK_EVENTS) {
      logMock('SDK_INIT');
      return;
    }
    getSettings().initializeSDK();
  },

  logCompleteRegistration(params: { method: 'phone_otp' }) {
    if (MOCK_EVENTS) return logMock('CompleteRegistration', params);
    const AppEventsLogger = getAppEventsLogger();
    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.CompletedRegistration, params);
  },

  logLogin(params: { method: 'phone_otp' }) {
    if (MOCK_EVENTS) return logMock('Login', params);
    getAppEventsLogger().logEvent('fb_mobile_login', params);
  },

  logInitiatedCheckout(params: { plan: string; amount: number; currency: string }) {
    if (MOCK_EVENTS) return logMock('InitiatedCheckout', params);
    const AppEventsLogger = getAppEventsLogger();
    AppEventsLogger.logEvent(AppEventsLogger.AppEvents.InitiatedCheckout, params);
  },

  logPurchase(params: { amount: number; currency: string; plan: string; subscriptionId: string }) {
    if (MOCK_EVENTS) return logMock('Purchase', params);
    getAppEventsLogger().logPurchase(params.amount, params.currency, {
      plan: params.plan,
      subscriptionId: params.subscriptionId,
    });
  },
};
