import type { Request, Response } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { createUserProfile, getUserProfile, updateUserProfile } from '../services/userProfile.service';
import { generateAndStoreReport, isKundaliUnlocked, markReportPending } from '../services/report.service';
import { NotFoundError, UnauthorizedError } from '../utils/errors';
import type { Gender, UserProfileDetailsRecord, UserProfileRecord } from '../types';

const birthDetailsSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  dateOfBirth: z.string().min(1),
  timeOfBirth: z.string().min(1),
  placeOfBirth: z.string().min(1),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  timezoneOffset: z.number().optional(),
  gender: z.enum(['female', 'male', 'other']) as z.ZodType<Gender>,
});

const displayNameSchema = z.object({ name: z.string().min(1).max(80) });

function serializeTimestamp(value: Timestamp | undefined): string | undefined {
  return value?.toDate().toISOString();
}

/**
 * Merges users/{uid} and its userProfiles/{userProfileId} doc into the same
 * flat JSON shape the app has always received from /me — the split is an
 * internal Firestore/backend detail, not something the mobile app's API
 * contract needs to know about.
 */
function serializeProfile(
  uid: string,
  user: UserProfileRecord & { createdAt?: Timestamp; updatedAt?: Timestamp },
  profile: UserProfileDetailsRecord | undefined,
) {
  return {
    uid,
    phoneNumber: user.phoneNumber,
    name: profile?.name,
    dateOfBirth: profile?.dateOfBirth,
    timeOfBirth: profile?.timeOfBirth,
    placeOfBirth: profile?.placeOfBirth,
    latitude: profile?.latitude,
    longitude: profile?.longitude,
    timezoneOffset: profile?.timezoneOffset,
    gender: profile?.gender,
    credits: user.credits ?? 0,
    // Lets the app pick the right paywall (Rs.1 trial vs Rs.299 upgrade)
    // without a second request. Razorpay customer/token ids are deliberately
    // NOT serialized — they never leave the backend.
    trialCreditsClaimed: user.trialCreditsClaimed ?? false,
    mandateStatus: user.mandateStatus ?? 'none',
    createdAt: serializeTimestamp(user.createdAt),
    updatedAt: serializeTimestamp(user.updatedAt),
  };
}

/**
 * Every user created via auth.controller.ts's signInUser already has
 * userProfileId set — this only covers a user doc that predates the
 * userProfiles split, so a stale/missing pointer self-heals instead of
 * breaking reads/writes for that account.
 */
async function ensureUserProfileId(uid: string, user: UserProfileRecord): Promise<string> {
  if (user.userProfileId) return user.userProfileId;

  const userProfileId = await createUserProfile(uid);
  await adminFirestore().collection('users').doc(uid).update({ userProfileId });
  return userProfileId;
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const ref = adminFirestore().collection('users').doc(req.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new NotFoundError('User profile not found.');

  const user = snapshot.data() as UserProfileRecord;
  const userProfileId = await ensureUserProfileId(req.uid, user);
  const profile = await getUserProfile(userProfileId);

  res.json(serializeProfile(req.uid, user, profile));
}

export async function updateBirthDetails(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const details = birthDetailsSchema.parse(req.body);
  const userRef = adminFirestore().collection('users').doc(req.uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) throw new NotFoundError('User profile not found.');

  const user = userSnapshot.data() as UserProfileRecord;
  const userProfileId = await ensureUserProfileId(req.uid, user);
  await updateUserProfile(userProfileId, details);

  // Any kundali already generated was calculated from the old date/time/
  // place, so it's now stale — regenerate it in the background rather than
  // leaving the user looking at a chart that no longer matches their profile.
  if (await isKundaliUnlocked(req.uid)) {
    await markReportPending(req.uid);
    generateAndStoreReport(req.uid).catch(console.error);
  }

  const [freshUserSnapshot, profile] = await Promise.all([userRef.get(), getUserProfile(userProfileId)]);
  res.json(serializeProfile(req.uid, freshUserSnapshot.data() as UserProfileRecord, profile));
}

export async function updateDisplayName(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { name } = displayNameSchema.parse(req.body);
  const userRef = adminFirestore().collection('users').doc(req.uid);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) throw new NotFoundError('User profile not found.');

  const user = userSnapshot.data() as UserProfileRecord;
  const userProfileId = await ensureUserProfileId(req.uid, user);
  await updateUserProfile(userProfileId, { name });

  const profile = await getUserProfile(userProfileId);
  res.json(serializeProfile(req.uid, user, profile));
}
