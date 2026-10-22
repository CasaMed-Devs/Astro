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

/**
 * True while the user is in their trial or a month they've paid for. The
 * backend keeps mandateStatus 'active' until that period actually ends, even
 * after a cancellation or a failing renewal.
 */
export function hasAccess(profile: UserProfile | null): boolean {
  return profile?.mandateStatus === 'active';
}

/** Out of credits: users who still have access top up; everyone else sees the paywall. */
export function getOutOfCreditsRoute(
  profile: UserProfile | null,
): '/wallet/topup' | '/paywall' | '/paywall/upgrade' {
  return hasAccess(profile) ? '/wallet/topup' : getPaywallRoute(profile);
}
