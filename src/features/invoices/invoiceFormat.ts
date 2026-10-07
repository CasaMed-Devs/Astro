const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * "01 Oct 2026", always in Indian time — an invoice must read the same on
 * every device, whatever its timezone or locale settings.
 */
export function formatInvoiceDate(iso: string): string {
  const ist = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** "Rs 49.00" — plain "Rs" rather than the ₹ glyph, which not every PDF font carries. */
export function formatInvoiceAmount(amountRupees: number): string {
  return `Rs ${amountRupees.toFixed(2)}`;
}

/** "+919876543210" -> "+91 9876543210". Anything that isn't an Indian E.164 number is returned as-is. */
export function formatPhoneNumber(phoneNumber: string): string {
  const match = /^\+91(\d{10})$/.exec(phoneNumber.trim());
  return match ? `+91 ${match[1]}` : phoneNumber;
}

/** "+919876543210" -> "9876543210", the way a user would say their own number. */
export function toLocalPhoneNumber(phoneNumber: string): string {
  const match = /^\+91(\d{10})$/.exec(phoneNumber.trim());
  return match ? match[1] : phoneNumber;
}
