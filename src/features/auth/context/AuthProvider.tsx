import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { restoreSession, signOut as endSession, subscribeToAuthState } from '@/services/auth.service';
import { reconcilePayments } from '@/services/payment.service';
import type { Session } from '@/services/session';
import { getMyProfile } from '@/services/user.service';
import { clearPaywallData, prefetchPaywallData } from '@/services/paywallData';
import type { UserProfile } from '@/types/firestore';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  profile: UserProfile | null;
  hasBirthDetails: boolean;
  // False from sign-in until the first profile fetch settles (success or failure).
  profileReady: boolean;
  refreshProfile: () => Promise<void>;
  // Applies a balance the server just reported (e.g. after a chat message)
  // without a full profile round-trip.
  syncCredits: (credits: number) => void;
  signOut: () => Promise<void>;
}

// Don't hit Razorpay through the backend more than once a minute per device.
const RECONCILE_MIN_INTERVAL_MS = 60_000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    restoreSession();
    const unsubscribe = subscribeToAuthState((nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
      if (!nextSession) {
        setProfile(null);
        setProfileReady(false);
        clearPaywallData();
      }
    });
    return unsubscribe;
  }, []);

  const fetchProfile = async () => {
    try {
      const nextProfile = await getMyProfile();
      setProfile(nextProfile);
    } catch (error) {
      if (__DEV__) {
        console.warn('[AuthProvider] getMyProfile failed:', error);
      }
    } finally {
      setProfileReady(true);
    }
  };

  const syncCredits = useCallback((credits: number) => {
    setProfile((prev) => (prev && prev.credits !== credits ? { ...prev, credits } : prev));
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchProfile();
    // Warm the paywall's data now so it opens instantly later.
    prefetchPaywallData();
  }, [session]);

  // Payment safety net: on sign-in and whenever the app returns to the
  // foreground, ask the backend to apply any payment the in-app verify and the
  // webhook both missed (e.g. the app was killed right after paying).
  const lastReconcileAt = useRef(0);
  useEffect(() => {
    if (!session) return;

    const reconcile = async () => {
      const now = Date.now();
      if (now - lastReconcileAt.current < RECONCILE_MIN_INTERVAL_MS) return;
      lastReconcileAt.current = now;
      try {
        const result = await reconcilePayments();
        // Refresh on a resolved order, or when the live Razorpay check just
        // downgraded the mandate — the paywall gate reads profile.mandateStatus,
        // so it needs the corrected value too. (Checking `=== 'cancelled'`
        // rather than diffing against `profile` here avoids a stale-closure
        // read of profile state inside this effect.)
        if (result.resolved.length > 0 || result.mandateStatus === 'cancelled') {
          await fetchProfile();
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('[AuthProvider] reconcilePayments failed:', error);
        }
      }
    };

    reconcile();
    const subscription = AppState.addEventListener('change', (nextState) => {
      // Always re-read the profile on return, even when reconcile is
      // throttled or finds nothing: credits and subscription state also
      // change from outside this device (a renewal, an admin grant).
      if (nextState === 'active') reconcile().then(fetchProfile);
    });
    return () => subscription.remove();
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      profileReady,
      hasBirthDetails: Boolean(
        profile?.dateOfBirth && profile?.timeOfBirth && profile?.placeOfBirth,
      ),
      refreshProfile: fetchProfile,
      syncCredits,
      signOut: endSession,
    }),
    [status, session, profile, profileReady, syncCredits],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
