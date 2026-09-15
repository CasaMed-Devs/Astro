import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { LoadingView } from '@/components/states/LoadingView';

export default function Index() {
  const { status, hasBirthDetails } = useAuth();

  if (status === 'loading') {
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
