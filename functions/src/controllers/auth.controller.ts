import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { env } from '../config/env';
import { requestOtp, verifyOtp } from '../services/otp.service';
import { createSessionToken } from '../services/token.service';
import { uidForPhoneNumber } from '../utils/uid';

const phoneSchema = z
  .string()
  .regex(/^\+\d{10,15}$/, 'phoneNumber must be in E.164 format, e.g. +919876543210');

const sendOtpSchema = z.object({ phoneNumber: phoneSchema });

const verifyOtpSchema = z.object({
  phoneNumber: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'code must be a 6-digit number'),
});

export async function sendOtp(req: Request, res: Response): Promise<void> {
  const { phoneNumber } = sendOtpSchema.parse(req.body);
  await requestOtp(phoneNumber);
  res.json({ sent: true });
}

async function signInUser(phoneNumber: string): Promise<{ uid: string; token: string }> {
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
  return { uid, token };
}

export async function verifyOtpAndSignIn(req: Request, res: Response): Promise<void> {
  const { phoneNumber, code } = verifyOtpSchema.parse(req.body);
  await verifyOtp(phoneNumber, code);

  const { uid, token } = await signInUser(phoneNumber);
  res.json({ token, uid });
}

/**
 * Dev-only phone/OTP skip for manual testing — mints a real session for a
 * fixed test phone number without sending or checking any OTP. Only wired
 * up (see routes/index.ts) when ENABLE_DEV_LOGIN=true; never reachable
 * otherwise, regardless of deploy target.
 */
export async function devLogin(_req: Request, res: Response): Promise<void> {
  const phoneNumber = env.devLogin.testPhoneNumber;
  const { uid, token } = await signInUser(phoneNumber);
  res.json({ token, uid, phoneNumber });
}
