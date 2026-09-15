import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { OtpFlowProvider } from '@/features/auth/context/OtpFlowProvider';

export default function OnboardingLayout() {
  const { status, hasBirthDetails } = useAuth();

  if (status === 'authenticated' && hasBirthDetails) {
    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <OtpFlowProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </OtpFlowProvider>
  );
}
