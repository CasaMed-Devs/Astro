/**
 * A user's uid IS their phone number (E.164, e.g. "+919876543210") — kept as
 * a named helper (rather than using phoneNumber directly at call sites) so
 * every place that derives a user's Firestore doc ID from their phone
 * number goes through one spot, in case this ever needs to change again.
 */
export function uidForPhoneNumber(phoneNumber: string): string {
  return phoneNumber.trim();
}
