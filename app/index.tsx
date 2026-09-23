import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { LoadingView } from '@/components/states/LoadingView';
import { getPaywallRoute } from '@/utils/paywall';

export default function Index() {
  const { status, profile, hasBirthDetails, profileReady } = useAuth();

  // Wait for the profile too: on app reopen the session is restored before
  // the profile arrives, and deciding now would flash birth-details.
  if (status === 'loading' || (status === 'authenticated' && !profileReady)) {
    return <LoadingView />;
  }

  if (status === 'unauthenticated') {
    return <Redirect href="/(onboarding)" />;
  }

  if (!hasBirthDetails) {
    return <Redirect href="/(onboarding)/birth-details" />;
  }

  // Every fresh launch lands unsubscribed users on the paywall instead of
  // home — this is the entry point re-evaluated from scratch each time the
  // app is opened after being closed, so it's the reliable place to gate on
  // subscription status (PaywallGate's AppState listener covers the
  // background/foreground case where this component doesn't remount).
  if (profile?.mandateStatus !== 'active') {
    return <Redirect href={getPaywallRoute(profile)} />;
  }

  return <Redirect href="/(tabs)/home" />;
}
