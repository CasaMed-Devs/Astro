import { env } from '../config/env';
import { HttpError } from '../utils/errors';

class SmsNotConfiguredError extends HttpError {
  constructor() {
    super(503, 'OTP delivery is temporarily unavailable. Please try again later.');
  }
}

class SmsSendFailedError extends HttpError {
  constructor(reason: string) {
    super(502, `Could not send the OTP SMS. (${reason})`);
  }
}

const VOICENSMS_API_URL = 'https://api.voicensms.in/SMSAPI/webresources/CreateSMSCampaignGet';

/**
 * Must match the DLT-registered wording for template ID 78250 exactly
 * (case, spacing, punctuation) — voicenSMS silently drops a message whose
 * text doesn't match the registered template, even though the API call
 * itself reports success.
 */
const OTP_MESSAGE_TEMPLATE = (code: string) =>
  `your futureyogiai app login otp is ${code}, houseoftech`;

export async function sendOtpSms(phoneNumber: string, code: string): Promise<void> {
  if (!env.voicensms.apiKey || !env.voicensms.templateId || !env.voicensms.senderId) {
    throw new SmsNotConfiguredError();
  }

  // voicenSMS expects the bare 10-digit Indian mobile number, not E.164.
  const msisdn = phoneNumber.replace(/^\+91/, '');

  const params = new URLSearchParams({
    ukey: env.voicensms.apiKey,
    msisdn,
    credittype: '7',
    senderid: env.voicensms.senderId,
    templateid: env.voicensms.templateId,
    message: OTP_MESSAGE_TEMPLATE(code),
    filetype: '2',
  });

  let response: Response;
  try {
    response = await fetch(`${VOICENSMS_API_URL}?${params.toString()}`, { method: 'GET' });
  } catch (error) {
    throw new SmsSendFailedError(error instanceof Error ? error.message : String(error));
  }

  if (!response.ok) {
    throw new SmsSendFailedError(`HTTP ${response.status}`);
  }

  // voicenSMS returns a plain-text body (not JSON) and can report a
  // success-looking response even when the message was silently dropped
  // for a template mismatch, so we don't trust its content as a pass/fail
  // signal — just log it for diagnosis.
  const body = await response.text();
  console.log('[voicensms] send response', { phone: msisdn, response: body.slice(0, 200) });
}
