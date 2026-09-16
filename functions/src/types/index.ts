export type MessageSender = 'user' | 'astrologer';

export interface ChatMessageRecord {
  sender: MessageSender;
  text: string;
}

export type Gender = 'female' | 'male' | 'other';

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
}

export type SubscriptionStatus = 'active' | 'pending' | 'cancelled' | 'expired' | 'failed';

export interface SubscriptionRecord {
  planId: string;
  status: SubscriptionStatus;
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  currentPeriodStart?: FirebaseFirestore.Timestamp;
  currentPeriodEnd?: FirebaseFirestore.Timestamp;
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
