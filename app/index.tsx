import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { LoadingView } from '@/components/states/LoadingView';

export default function Index() {
  const { status, hasBirthDetails, profileReady } = useAuth();

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

  return <Redirect href="/(tabs)/home" />;
}
