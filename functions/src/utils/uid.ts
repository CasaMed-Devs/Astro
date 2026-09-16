import { createHash } from 'crypto';

/** Stable, non-guessable uid derived from the phone number (replaces the Firebase Auth uid). */
export function uidForPhoneNumber(phoneNumber: string): string {
  return createHash('sha256').update(phoneNumber).digest('hex').slice(0, 32);
}
