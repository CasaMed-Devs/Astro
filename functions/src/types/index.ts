export type MessageSender = 'user' | 'astrologer';

export interface ChatMessageRecord {
  sender: MessageSender;
  text: string;
}

export type Gender = 'female' | 'male' | 'other';

export type MandateMethod = 'card' | 'upi';

/**
 * Shared lifecycle vocabulary for both users/{uid}.mandateStatus and every
 * subscriptions/{cycleId}.status — one enum, so the two never drift into
 * different vocabularies again (they used to: this doc's status could be
 * 'trialing'/'past_due', values mandateStatus never actually took).
 *
 *   none          no registration ever started
 *   created       registration order/link created, no payment attempted yet
 *   authenticated Razorpay captured the payment, but the recurring token
 *                 isn't confirmed yet — a real, previously invisible gap:
 *                 webhook.controller.ts's payment.captured handler waits for
 *                 token_id before doing anything, so a UPI mandate mid
 *                 bank-approval looked IDENTICAL to "never touched" before.
 *   active        token confirmed — mandate is live, auto-debits will fire.
 *                 Covers trial AND paid alike; which one is on
 *                 subscriptions/{cycleId}.planId ('trial' | 'plus'), not a
 *                 separate status value — splitting trial into its own live
 *                 status would silently drop trial users out of
 *                 processDueAutoDebits's `where('mandateStatus','==','active')`
 *                 query unless every such check were updated too.
 *   past_due      an auto-debit charge failed; inside the 3-day grace period
 *   cancelled     grace period expired, or otherwise terminated
 *   expired       registration abandoned (no payment) — reserved for a future
 *                 sweep mirroring paymentOrders' 7-day expiry; not yet written
 *                 by any code path today.
 */
export type MandateStatus =
  | 'none'
  | 'created'
  | 'authenticated'
  | 'active'
  | 'past_due'
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
  razorpayCustomerId?: string;
  // The saved card/UPI mandate token used for auto-debit charges.
  razorpayTokenId?: string;
  mandateMethod?: MandateMethod;
  mandateStatus?: MandateStatus;
  // When the next scheduled auto-debit should fire (day-2 after the trial,
  // then every 30 days thereafter).
  nextAutoDebitAt?: FirebaseFirestore.Timestamp;
  nextAutoDebitAmount?: number; // Rupees
  // Set when an auto-debit charge fails; cleared on the next success.
  graceUntil?: FirebaseFirestore.Timestamp;
  lastPaymentFailureReason?: string;
  // Set once the one-time Rs.49 kundali payment is verified — lifetime access.
  kundaliUnlocked?: boolean;
  kundaliUnlockedAt?: FirebaseFirestore.Timestamp;
  // Points at the user's CURRENT subscription-cycle doc: subscriptions/{autoId}.
  // Owned exclusively by mandate.service.ts (startSubscriptionCycle sets it on
  // every new mandate registration; updateCurrentSubscription never changes
  // it). One doc per registration lifecycle, not per user — a cancel-then-
  // re-register gets a fresh id here, so a prior cycle's history is never
  // overwritten. transactions.service.ts only reads this field, never writes it.
  subscriptionId?: string;
  lastTransactionId?: string; // transactions/{id}, the user's newest payment
  transactionCount?: number;
}

/**
 * subscriptions/{cycleId} — one doc per mandate-registration lifecycle (see
 * mandate.service.ts's startSubscriptionCycle/updateCurrentSubscription),
 * not one per user. Doc id is a generated id, referenced by
 * users/{uid}.subscriptionId, which always points at the CURRENT cycle.
 */
export interface SubscriptionCycleRecord {
  userId: string;
  planId: 'trial' | 'plus';
  status: MandateStatus;
  mandateMethod?: MandateMethod;
  razorpayCustomerId?: string;
  razorpayTokenId?: string;
  registrationAmount?: number; // Rupees — the authorization amount at registration time
  lastPaymentId?: string;
  lastPaymentAmount?: number; // Rupees
  lastPaymentAt?: FirebaseFirestore.Timestamp;
  currentPeriodStart?: FirebaseFirestore.Timestamp;
  nextAutoDebitAt?: FirebaseFirestore.Timestamp;
  nextAutoDebitAmount?: number; // Rupees
  lastPaymentFailureReason?: string;
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
