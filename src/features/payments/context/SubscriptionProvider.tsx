import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/context/AuthProvider';
import { isSubscriptionActive, subscribeToSubscription } from '@/services/subscription.service';
import type { SubscriptionDoc } from '@/types/firestore';

interface SubscriptionContextValue {
  subscription: SubscriptionDoc | null;
  isActive: boolean;
  loading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionDoc | null>(null);
  const [subscriptionLoaded, setSubscriptionLoaded] = useState(false);

  useEffect(() => {
    if (!session) return;

    const unsubscribe = subscribeToSubscription((next) => {
      setSubscription(next);
      setSubscriptionLoaded(true);
    });
    return unsubscribe;
  }, [session]);

  const effectiveSubscription = session ? subscription : null;
  const loading = Boolean(session) && !subscriptionLoaded;

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      subscription: effectiveSubscription,
      isActive: isSubscriptionActive(effectiveSubscription),
      loading,
    }),
    [effectiveSubscription, loading],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within a SubscriptionProvider');
  return context;
}
