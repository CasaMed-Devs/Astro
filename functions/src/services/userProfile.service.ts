import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import type { UserProfileDetailsRecord } from '../types';

/**
 * Creates an empty userProfiles/{id} doc for a brand-new user and returns its
 * id. Called once, at sign-in (auth.controller.ts), so every users/{uid} doc
 * is created with userProfileId already pointing at a real profile doc —
 * no lazy-creation/self-heal path needed elsewhere, unlike the subscription
 * cycle pointer (which legitimately has no value until a user first pays).
 */
export async function createUserProfile(uid: string): Promise<string> {
  const ref = adminFirestore().collection('userProfiles').doc();
  await ref.set({
    uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

export async function getUserProfile(
  userProfileId: string,
): Promise<UserProfileDetailsRecord | undefined> {
  const snapshot = await adminFirestore().collection('userProfiles').doc(userProfileId).get();
  return snapshot.exists ? (snapshot.data() as UserProfileDetailsRecord) : undefined;
}

export async function updateUserProfile(
  userProfileId: string,
  patch: Partial<Omit<UserProfileDetailsRecord, 'uid' | 'createdAt'>>,
): Promise<void> {
  await adminFirestore()
    .collection('userProfiles')
    .doc(userProfileId)
    .update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
}

export async function deleteUserProfile(userProfileId: string): Promise<void> {
  await adminFirestore().collection('userProfiles').doc(userProfileId).delete();
}
