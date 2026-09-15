import { createHash } from 'crypto';

import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { requestOtp, verifyOtp } from '../services/otp.service';
import { createSessionToken } from '../services/token.service';

const phoneSchema = z
  .string()
  .regex(/^\+\d{10,15}$/, 'phoneNumber must be in E.164 format, e.g. +919876543210');

const sendOtpSchema = z.object({ phoneNumber: phoneSchema });

const verifyOtpSchema = z.object({
  phoneNumber: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'code must be a 6-digit number'),
});

/** Stable, non-guessable uid derived from the phone number (replaces the Firebase Auth uid). */
function uidForPhoneNumber(phoneNumber: string): string {
  return createHash('sha256').update(phoneNumber).digest('hex').slice(0, 32);
}

export async function sendOtp(req: Request, res: Response): Promise<void> {
  const { phoneNumber } = sendOtpSchema.parse(req.body);
  await requestOtp(phoneNumber);
  res.json({ sent: true });
}

export async function verifyOtpAndSignIn(req: Request, res: Response): Promise<void> {
  const { phoneNumber, code } = verifyOtpSchema.parse(req.body);
  await verifyOtp(phoneNumber, code);

  const uid = uidForPhoneNumber(phoneNumber);
  const userRef = adminFirestore().collection('users').doc(uid);
  const snapshot = await userRef.get();

  if (!snapshot.exists) {
    await userRef.set({
      uid,
      phoneNumber,
      credits: 0,
      fcmTokens: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const token = createSessionToken({ uid, phoneNumber });
  res.json({ token, uid });
}
