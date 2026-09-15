export type Gender = 'female' | 'male' | 'other';

export interface UserProfile {
  uid: string;
  phoneNumber: string;
  name?: string;
  dateOfBirth?: string;
  timeOfBirth?: string;
  placeOfBirth?: string;
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

export interface ChatMessageDoc {
  id: string;
  sender: MessageSender;
  text: string;
  createdAt: string | null;
  status: MessageStatus;
}

export type SubscriptionStatus = 'active' | 'pending' | 'cancelled' | 'expired' | 'failed';

export interface SubscriptionDoc {
  planId: string;
  status: SubscriptionStatus;
  razorpayCustomerId?: string;
  razorpaySubscriptionId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
}

export type PaymentPurpose = 'subscription' | 'report';
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

export interface ReportDoc {
  status: ReportStatus;
  content?: string;
  generatedAt?: string;
}
