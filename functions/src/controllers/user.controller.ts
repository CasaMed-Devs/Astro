import type { Request, Response } from 'express';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { adminFirestore } from '../config/firebase-admin';
import { NotFoundError, UnauthorizedError } from '../utils/errors';
import type { Gender, UserProfileRecord } from '../types';

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

function serializeProfile(uid: string, data: UserProfileRecord & { createdAt?: Timestamp; updatedAt?: Timestamp }) {
  return {
    uid,
    phoneNumber: data.phoneNumber,
    name: data.name,
    dateOfBirth: data.dateOfBirth,
    timeOfBirth: data.timeOfBirth,
    placeOfBirth: data.placeOfBirth,
    latitude: data.latitude,
    longitude: data.longitude,
    timezoneOffset: data.timezoneOffset,
    gender: data.gender,
    credits: data.credits ?? 0,
    // Lets the app pick the right paywall (Rs.1 trial vs Rs.299 upgrade)
    // without a second request. Razorpay customer/token ids are deliberately
    // NOT serialized — they never leave the backend.
    trialCreditsClaimed: data.trialCreditsClaimed ?? false,
    mandateStatus: data.mandateStatus ?? 'none',
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function getMe(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const snapshot = await adminFirestore().collection('users').doc(req.uid).get();
  if (!snapshot.exists) throw new NotFoundError('User profile not found.');

  res.json(serializeProfile(req.uid, snapshot.data() as UserProfileRecord));
}

export async function updateBirthDetails(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const details = birthDetailsSchema.parse(req.body);
  const ref = adminFirestore().collection('users').doc(req.uid);

  await ref.update({ ...details, updatedAt: FieldValue.serverTimestamp() });

  const snapshot = await ref.get();
  res.json(serializeProfile(req.uid, snapshot.data() as UserProfileRecord));
}

export async function updateDisplayName(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { name } = displayNameSchema.parse(req.body);
  const ref = adminFirestore().collection('users').doc(req.uid);

  await ref.update({ name, updatedAt: FieldValue.serverTimestamp() });

  const snapshot = await ref.get();
  res.json(serializeProfile(req.uid, snapshot.data() as UserProfileRecord));
}
