import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { OtpFlowProvider } from '@/features/auth/context/OtpFlowProvider';
import { SplashView } from '@/components/states/SplashView';
import { getPaywallRoute } from '@/utils/paywall';

export default function OnboardingLayout() {
  const { status, hasBirthDetails, profileReady, profile } = useAuth();

  if (status === 'authenticated') {
    if (!profileReady) {
      return <SplashView />;
    }
    if (hasBirthDetails) {
      if (profile?.mandateStatus !== 'active') {
        return <Redirect href={getPaywallRoute(profile)} />;
      }
      return <Redirect href="/(tabs)/home" />;
    }
  }

  return (
    <OtpFlowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OtpFlowProvider>
  );
}
