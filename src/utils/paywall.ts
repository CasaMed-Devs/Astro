import type { UserProfile } from '@/types/firestore';

/**
 * A user who has never claimed their Rs.1 trial gift sees the trial screen;
 * anyone past that (mandate already set up) sees the Rs.299 "add credits"
 * screen instead. Centralized since the chat screen, astrologer detail
 * screen, profile, and home screen all need to make this same call.
 */
export function getPaywallRoute(profile: UserProfile | null): '/paywall' | '/paywall/upgrade' {
  return profile?.trialCreditsClaimed ? '/paywall/upgrade' : '/paywall';
}
