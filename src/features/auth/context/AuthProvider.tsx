import {
  createContext,
  PropsWithChildren,
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
        if (result.resolved.length > 0) await fetchProfile();
      } catch (error) {
        if (__DEV__) {
          console.warn('[AuthProvider] reconcilePayments failed:', error);
        }
      }
    };

    reconcile();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') reconcile();
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
      signOut: endSession,
    }),
    [status, session, profile, profileReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
