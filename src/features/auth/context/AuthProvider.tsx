import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { restoreSession, signOut as endSession, subscribeToAuthState } from '@/services/auth.service';
import type { Session } from '@/services/session';
import { getMyProfile } from '@/services/user.service';
import type { UserProfile } from '@/types/firestore';

export type AuthStatus = 'loading' | 'unauthenticated' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  profile: UserProfile | null;
  hasBirthDetails: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    restoreSession();
    const unsubscribe = subscribeToAuthState((nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'unauthenticated');
      if (!nextSession) setProfile(null);
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
    }
  };

  useEffect(() => {
    if (!session) return;
    fetchProfile();
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      hasBirthDetails: Boolean(
        profile?.dateOfBirth && profile?.timeOfBirth && profile?.placeOfBirth,
      ),
      refreshProfile: fetchProfile,
      signOut: endSession,
    }),
    [status, session, profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
