const INDIA_MOBILE_REGEX = /^[6-9]\d{9}$/;

export function isValidIndianMobileNumber(localNumber: string): boolean {
  return INDIA_MOBILE_REGEX.test(localNumber.trim());
}

export function toE164(localNumber: string, countryCode = '+91'): string {
  return `${countryCode}${localNumber.trim()}`;
}
