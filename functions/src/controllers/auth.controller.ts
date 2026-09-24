import type { Request, Response } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { env } from '../config/env';
import { pixyLogin, pixyVerifyOtp } from '../services/pixyAuth.service';
import { createSessionToken } from '../services/token.service';
import { createUserProfile } from '../services/userProfile.service';
import { uidForPhoneNumber } from '../utils/uid';

const phoneSchema = z
  .string()
  .regex(/^\+\d{10,15}$/, 'phoneNumber must be in E.164 format, e.g. +919876543210');

const sendOtpSchema = z.object({ phoneNumber: phoneSchema });

const verifyOtpSchema = z.object({
  phoneNumber: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'code must be a 6-digit number'),
  identificationToken: z.string().min(1),
});

export async function sendOtp(req: Request, res: Response): Promise<void> {
  const { phoneNumber } = sendOtpSchema.parse(req.body);
  const { identificationToken, otp } = await pixyLogin(phoneNumber);
  res.json({ sent: true, identificationToken, otp });
}

async function signInUser(phoneNumber: string): Promise<{ uid: string; token: string; isNewUser: boolean }> {
  const uid = uidForPhoneNumber(phoneNumber);
  const userRef = adminFirestore().collection('users').doc(uid);
  const snapshot = await userRef.get();
  const isNewUser = !snapshot.exists;

  if (isNewUser) {
    const userProfileId = await createUserProfile(uid);
    await userRef.set({
      uid,
      phoneNumber,
      credits: 0,
      userProfileId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  const token = createSessionToken({ uid, phoneNumber });
  return { uid, token, isNewUser };
}

export async function verifyOtpAndSignIn(req: Request, res: Response): Promise<void> {
  const { phoneNumber, code, identificationToken } = verifyOtpSchema.parse(req.body);
  await pixyVerifyOtp(phoneNumber, identificationToken, code);

  const { uid, token, isNewUser } = await signInUser(phoneNumber);
  res.json({ token, uid, isNewUser });
}

/**
 * Dev-only phone/OTP skip for manual testing — mints a real session for a
 * fixed test phone number without sending or checking any OTP. Only wired
 * up (see routes/index.ts) when ENABLE_DEV_LOGIN=true; never reachable
 * otherwise, regardless of deploy target.
 */
export async function devLogin(_req: Request, res: Response): Promise<void> {
  const phoneNumber = env.devLogin.testPhoneNumber;
  const { uid, token, isNewUser } = await signInUser(phoneNumber);
  res.json({ token, uid, phoneNumber, isNewUser });
}
