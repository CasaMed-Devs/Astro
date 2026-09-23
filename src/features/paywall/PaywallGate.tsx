import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router, usePathname } from 'expo-router';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { getPaywallRoute } from '@/utils/paywall';

/**
 * Shows the paywall when the app comes back to the foreground (backgrounded,
 * not killed — the JS context and current route survive, so app/index.tsx's
 * own cold-start gating never re-runs) while the signed-in user has no
 * active subscription. Renders nothing — it only watches AppState.
 */
export function PaywallGate() {
  const { status, profile, profileReady, hasBirthDetails } = useAuth();
  const pathname = usePathname();

  const latestRef = useRef({ status, profile, profileReady, hasBirthDetails, pathname });
  useEffect(() => {
    latestRef.current = { status, profile, profileReady, hasBirthDetails, pathname };
  }, [status, profile, profileReady, hasBirthDetails, pathname]);

  const maybeShowPaywall = () => {
    const current = latestRef.current;
    if (current.status !== 'authenticated' || !current.profileReady || !current.hasBirthDetails) {
      return;
    }
    if (!current.profile || current.profile.mandateStatus === 'active') return;
    if (current.pathname?.startsWith('/paywall')) return;
    router.push(getPaywallRoute(current.profile));
  };

  // App coming back to the foreground after being backgrounded (not killed).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') maybeShowPaywall();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
