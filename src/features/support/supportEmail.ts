import { Alert, Linking } from 'react-native';

import { APP_NAME, SUPPORT_EMAIL } from '@/constants/app';
import { toLocalPhoneNumber } from '@/features/invoices/invoiceFormat';

/** A mailto: link to support, pre-filled with the signed-in user's registered number. */
export function buildSupportMailto(phoneNumber: string | undefined): string {
  const subject = `Support Request – ${APP_NAME}`;
  const body = [
    'Hi Support Team,',
    '',
    `My number is ${phoneNumber ? toLocalPhoneNumber(phoneNumber) : ''}.`,
    '',
    'I am facing an issue with the application.',
    '',
    'Issue: ',
    '',
    'Please help me resolve this issue.',
    '',
    'Thank you.',
  ].join('\n');

  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Opens the device's email app on a pre-filled support request. */
export async function openSupportEmail(phoneNumber: string | undefined): Promise<void> {
  try {
    await Linking.openURL(buildSupportMailto(phoneNumber));
  } catch {
    // No email app is installed or set up — give them the address instead.
    Alert.alert('Contact support', `Please email us at ${SUPPORT_EMAIL}.`);
  }
}
