export type MessageSender = 'user' | 'astrologer';

export interface ChatMessageRecord {
  sender: MessageSender;
  text: string;
}

export type Gender = 'female' | 'male' | 'other';

export type MandateMethod = 'card' | 'upi';

/**
 * Shared lifecycle vocabulary for both users/{uid}.mandateStatus and every
 * subscriptions/{cycleId}.status. Every mandate is registered via Razorpay's
 * Subscriptions API (mandate.service.ts's startNewMandateSubscription) —
 * Razorpay owns billing/retries/lifecycle entirely and reports its OWN
 * status strings directly (see node_modules/razorpay's
 * Subscriptions.RazorpaySubscription type), which this enum mirrors:
 *
 *   none          no registration ever started
 *   created       registration created, no payment attempted yet
 *   authenticated Razorpay captured the mandate's first payment, but it
 *                 isn't fully confirmed active yet.
 *   active        mandate is live, Razorpay will charge it on its own
 *                 schedule. Covers trial AND paid alike; which one is on
 *                 subscriptions/{cycleId}.planId ('trial' | 'plus'), not a
 *                 separate status value.
 *   pending       a charge is due but hasn't been attempted yet.
 *   halted        Razorpay's own retry attempts on a failed charge were
 *                 exhausted.
 *   completed     every billing cycle (total_count) has been charged; the
 *                 subscription naturally ended.
 *   cancelled     mandate was cancelled (by the user or by Razorpay).
 *   expired       registration abandoned (no payment) — reserved for a future
 *                 sweep mirroring paymentOrders' 7-day expiry; not yet written
 *                 by any code path today.
 */
export type MandateStatus =
  | 'none'
  | 'created'
  | 'authenticated'
  | 'active'
  | 'pending'
  | 'halted'
  | 'completed'
  | 'cancelled'
  | 'expired';

export interface UserProfileRecord {
  uid: string;
  phoneNumber: string;
  // Points at users/{uid}'s personal-details doc: userProfiles/{userProfileId}
  // (see services/userProfile.service.ts). Not named `profileId` — that name
  // is already used elsewhere in this codebase for the astrologer PERSONA id
  // (personaChats.profileId, PersonaProfile.id) — a different concept entirely.
  // Every user gets one created at sign-in (auth.controller.ts), so this is
  // always present for any user doc created going forward.
  userProfileId: string;
  credits: number;
  // One-time 5-credit trial gift, granted on the first successful Rs.1
  // mandate registration — never granted again, even if the mandate is
  // later cancelled and re-registered.
  trialCreditsClaimed?: boolean;
  mandateMethod?: MandateMethod;
  mandateStatus?: MandateStatus;
  // Set once the one-time Rs.49 kundali payment is verified — lifetime access.
  kundaliUnlocked?: boolean;
  kundaliUnlockedAt?: FirebaseFirestore.Timestamp;
  // Points at the user's CURRENT subscription-cycle doc:
  // subscriptions/{razorpaySubscriptionId}. Owned exclusively by
  // mandate.service.ts (startSubscriptionCycleFromRazorpay sets it on every
  // new mandate registration; updateCurrentSubscription never changes it).
  // One doc per registration lifecycle, not per user — a cancel-then-
  // re-register gets a fresh id here, so a prior cycle's history is never
  // overwritten. transactions.service.ts only reads this field, never writes it.
  subscriptionId?: string;
  // Set the first time this subscription cycle's mandate becomes entitled
  // (applyNewMandateEntitlement) — the trial's Rs.1 addon charge, or a direct
  // subscription's first charge. Not touched by renewals, cancellations, or
  // status-only syncs; a cancel-then-re-register overwrites it with the new
  // cycle's own activation time.
  subscriptionActivatedAt?: FirebaseFirestore.Timestamp;
  lastTransactionId?: string; // transactions/{id}, the user's newest payment
  transactionCount?: number;
}

/**
 * subscriptions/{razorpaySubscriptionId} — one doc per mandate-registration
 * lifecycle (see mandate.service.ts's startSubscriptionCycleFromRazorpay/
 * updateCurrentSubscription), not one per user. Doc id is the real Razorpay
 * subscription id, referenced by users/{uid}.subscriptionId, which always
 * points at the CURRENT cycle.
 */
export interface SubscriptionCycleRecord {
  userId: string;
  planId: 'trial' | 'plus';
  status: MandateStatus;
  mandateMethod?: MandateMethod;
  registrationAmount?: number; // Rupees — the authorization amount at registration time
  lastPaymentId?: string;
  lastPaymentAmount?: number; // Rupees
  lastPaymentAt?: FirebaseFirestore.Timestamp;
  currentPeriodStart?: FirebaseFirestore.Timestamp;
  lastTransactionId?: string; // transactions/{id}
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
}

/**
 * userProfiles/{userProfileId} — a user's personal/birth details, split out
 * of users/{uid} so the profile-editing surface (name, dob/tob/pob, gender)
 * is a separate concern from account/billing state. Doc id is a generated
 * id, not the phone number, so a future "multiple profiles per account"
 * feature (e.g. checking a family member's kundali) has somewhere to go
 * without a schema change — today it's still a strict 1:1 with `uid` via
 * users/{uid}.userProfileId.
 */
export interface UserProfileDetailsRecord {
  uid: string; // owner — the users/{uid} this profile belongs to
  name?: string;
  dateOfBirth?: string;
  timeOfBirth?: string;
  placeOfBirth?: string;
  latitude?: number;
  longitude?: number;
  timezoneOffset?: number;
  gender?: Gender;
  createdAt?: FirebaseFirestore.Timestamp;
  updatedAt?: FirebaseFirestore.Timestamp;
}

export type ReportStatus = 'pending' | 'ready' | 'failed';

export interface ReportRecord {
  status: ReportStatus;
  content?: string;
  kundali?: unknown;
  generatedAt?: FirebaseFirestore.Timestamp;
}

declare global {
  namespace Express {
    interface Request {
      uid?: string;
    }
  }
}
