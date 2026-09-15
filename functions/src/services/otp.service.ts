import { createHash, randomInt } from 'crypto';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { sendOtpSms } from './voicensms.service';
import { HttpError } from '../utils/errors';

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

export class OtpExpiredError extends HttpError {
  constructor() {
    super(400, 'This code has expired. Request a new one.');
  }
}

export class OtpInvalidError extends HttpError {
  constructor() {
    super(400, 'That code is incorrect. Please check and try again.');
  }
}

export class OtpTooManyAttemptsError extends HttpError {
  constructor() {
    super(429, 'Too many attempts. Please request a new code.');
  }
}

export class OtpCooldownError extends HttpError {
  constructor() {
    super(429, 'Please wait a little before requesting another code.');
  }
}

interface OtpRecord {
  codeHash: string;
  expiresAt: Timestamp;
  attempts: number;
  createdAt: Timestamp;
}

function hashCode(phoneNumber: string, code: string): string {
  return createHash('sha256').update(`${phoneNumber}:${code}`).digest('hex');
}

function otpDoc(phoneNumber: string) {
  return adminFirestore().collection('otps').doc(phoneNumber);
}

export async function requestOtp(phoneNumber: string): Promise<void> {
  const ref = otpDoc(phoneNumber);
  const existing = await ref.get();

  if (existing.exists) {
    const record = existing.data() as OtpRecord;
    const createdAtMs = record.createdAt?.toMillis?.() ?? 0;
    if (Date.now() - createdAtMs < RESEND_COOLDOWN_MS) {
      throw new OtpCooldownError();
    }
  }

  const code = randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');

  await sendOtpSms(phoneNumber, code);

  await ref.set({
    codeHash: hashCode(phoneNumber, code),
    expiresAt: Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function verifyOtp(phoneNumber: string, code: string): Promise<void> {
  const ref = otpDoc(phoneNumber);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new OtpExpiredError();
  }

  const record = snapshot.data() as OtpRecord;

  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    await ref.delete();
    throw new OtpTooManyAttemptsError();
  }

  if (record.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new OtpExpiredError();
  }

  if (record.codeHash !== hashCode(phoneNumber, code)) {
    await ref.update({ attempts: FieldValue.increment(1) });
    throw new OtpInvalidError();
  }

  await ref.delete();
}
