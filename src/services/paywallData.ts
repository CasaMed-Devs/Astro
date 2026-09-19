import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getPricing, type PublicPricing } from '@/services/payment.service';
import { fetchAstrologerProfiles } from '@/services/astrologers.service';
import type { AstrologerProfile } from '@/features/astrologers/types';

/**
 * Data both paywall screens need (admin pricing + astrologer avatars), kept in
 * memory and on disk so the screens render instantly instead of waiting on the
 * network. Prefetched as soon as the user is signed in (see AuthProvider), and
 * always refreshed in the background — cached values are only what's shown
 * first, never a substitute for the server's price at payment time (the
 * backend charges its own amount).
 */
const STORAGE_KEY = 'paywallData.v1';
const AVATAR_COUNT = 6;

interface PaywallData {
  pricing: PublicPricing | null;
  avatars: AstrologerProfile[];
}

let cache: PaywallData = { pricing: null, avatars: [] };
let hydrated: Promise<void> | null = null;
let refreshing: Promise<void> | null = null;
const listeners = new Set<(data: PaywallData) => void>();

function publish(next: Partial<PaywallData>) {
  cache = { ...cache, ...next };
  listeners.forEach((listener) => listener(cache));
}

// Loads the last-known data from disk (a few ms) — used before the network answers.
function hydrate(): Promise<void> {
  hydrated ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (!raw) return;
      const saved = JSON.parse(raw) as PaywallData;
      // Don't overwrite fresher data that arrived while reading from disk.
      publish({
        pricing: cache.pricing ?? saved.pricing,
        avatars: cache.avatars.length ? cache.avatars : saved.avatars,
      });
    })
    .catch(() => undefined);
  return hydrated;
}

/** Fetches fresh data in the background; safe to call repeatedly. */
export function prefetchPaywallData(): Promise<void> {
  void hydrate();
  refreshing ??= Promise.allSettled([getPricing(), fetchAstrologerProfiles()])
    .then(([pricing, astrologers]) => {
      const next: Partial<PaywallData> = {};
      if (pricing.status === 'fulfilled') next.pricing = pricing.value;
      if (astrologers.status === 'fulfilled') {
        next.avatars = astrologers.value.slice(0, AVATAR_COUNT);
        // Warm the image cache so avatars are painted the moment the screen opens.
        next.avatars.forEach((a) => a.photoUrl && Image.prefetch(a.photoUrl).catch(() => undefined));
      }
      publish(next);
      return AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ pricing: cache.pricing, avatars: cache.avatars }),
      ).catch(() => undefined);
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export function clearPaywallData() {
  cache = { pricing: null, avatars: [] };
  hydrated = null;
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}

/** Cached-first paywall data: renders with whatever we have, then updates. */
export function usePaywallData(): PaywallData {
  const [data, setData] = useState<PaywallData>(cache);

  useEffect(() => {
    listeners.add(setData);
    setData(cache);
    void hydrate();
    void prefetchPaywallData();
    return () => {
      listeners.delete(setData);
    };
  }, []);

  return data;
}
