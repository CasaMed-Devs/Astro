import type { Request, Response } from 'express';

import { adminFirestore } from '../config/firebase-admin';
import { UnauthorizedError } from '../utils/errors';
import type { UserProfileRecord } from '../types';

async function deleteCollection(path: string): Promise<void> {
  const db = adminFirestore();
  const snapshot = await db.collection(path).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();
  const { uid } = req;

  const db = adminFirestore();

  const chatsSnapshot = await db.collection('chats').where('userId', '==', uid).get();
  await Promise.all(
    chatsSnapshot.docs.map(async (chatDoc) => {
      await deleteCollection(`chats/${chatDoc.id}/messages`);
      await chatDoc.ref.delete();
    }),
  );

  const userSnapshot = await db.collection('users').doc(uid).get();
  const userProfileId = (userSnapshot.data() as UserProfileRecord | undefined)?.userProfileId;

  // Mandate state lives on the user doc itself, so deleting it also drops
  // the saved Razorpay token reference — no separate subscription doc.
  await Promise.all([
    db.collection('users').doc(uid).delete(),
    db.collection('reports').doc(uid).delete(),
    userProfileId ? db.collection('userProfiles').doc(userProfileId).delete() : Promise.resolve(),
  ]);

  res.status(204).send();
}
