export type Gender = 'female' | 'male' | 'other';

export interface UserProfile {
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
  createdAt?: string;
  updatedAt?: string;
}

export type MessageSender = 'user' | 'astrologer';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed';

export interface ChatDoc {
  id: string;
  userId: string;
  personaId: string;
  createdAt?: string;
  updatedAt?: string;
  lastMessage?: string;
}

export interface ChatReplyMeta {
  cards?: unknown;
  leaning?: unknown;
  timing?: unknown;
  remedy?: unknown;
}

export interface ChatMessageDoc {
  id: string;
  sender: MessageSender;
  text: string;
  createdAt: string | null;
  status: MessageStatus;
  meta?: ChatReplyMeta;
}

export interface ChatSessionStatus {
  sessionActive: boolean;
  sessionExpiresAt: string | null;
  isSubscriber: boolean;
}

export type SubscriptionStatus =
  | 'active'
  | 'pending'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'failed';

export interface SubscriptionDoc {
  planId: string;
  status: SubscriptionStatus;
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  graceUntil?: string;
  lastPaymentFailureReason?: string;
}

export type PaymentPurpose = 'subscription' | 'report' | 'topup';
export type PaymentStatus = 'created' | 'paid' | 'failed' | 'refunded';

export interface PaymentDoc {
  id: string;
  userId: string;
  orderId: string;
  razorpayPaymentId?: string;
  amount: number;
  currency: string;
  purpose: PaymentPurpose;
  status: PaymentStatus;
  createdAt?: string;
}

export type ReportStatus = 'pending' | 'ready' | 'failed';

export interface ReportPlanet {
  name: string;
  fullDegree: number;
  normDegree: number;
  isRetrograde: boolean;
  currentSign: number;
  houseNumber?: number;
}

export interface ReportDasha {
  lord: string;
  startTime: string;
  endTime: string;
}

export interface ReportKundali {
  geo: { latitude: number; longitude: number; timezoneOffset: number; completeName: string };
  planets: ReportPlanet[];
  mahaDasas: ReportDasha[];
}

export interface ReportDoc {
  status: ReportStatus;
  content?: string;
  kundali?: ReportKundali;
  generatedAt?: string;
}
