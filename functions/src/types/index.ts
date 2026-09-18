export type MessageSender = 'user' | 'astrologer';

export interface ChatMessageRecord {
  sender: MessageSender;
  text: string;
}

export type Gender = 'female' | 'male' | 'other';

export type MandateMethod = 'card' | 'upi';
export type MandateStatus = 'none' | 'pending' | 'active' | 'failed' | 'cancelled';

export interface UserProfileRecord {
  uid: string;
  phoneNumber: string;
  name?: string;
  dateOfBirth?: string;
  timeOfBirth?: string;
  placeOfBirth?: string;
  latitude?: number;
  longitude?: number;
  timezoneOffset?: number;
  gender?: Gender;
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
