import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';

export const DEFAULT_CREDIT_COST_PER_SESSION = 1;

export interface PersonaConfig {
  creditCostPerSession: number;
  sortOrder: number;
}

interface PersonaConfigDoc {
  creditCostPerSession?: number;
  sortOrder?: number;
}

function personaConfigCollection() {
  return adminFirestore().collection('personaConfig');
}

export async function getCreditCostPerSession(profileId: string): Promise<number> {
  const snapshot = await personaConfigCollection().doc(profileId).get();
  const data = snapshot.data() as PersonaConfigDoc | undefined;
  return data?.creditCostPerSession ?? DEFAULT_CREDIT_COST_PER_SESSION;
}

/** Batch read for merging into the astrologer list — one query instead of N doc reads. */
export async function getAllPersonaConfigs(): Promise<Map<string, PersonaConfig>> {
  const snapshot = await personaConfigCollection().get();
  const map = new Map<string, PersonaConfig>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data() as PersonaConfigDoc;
    map.set(doc.id, {
      creditCostPerSession: data.creditCostPerSession ?? DEFAULT_CREDIT_COST_PER_SESSION,
      sortOrder: data.sortOrder ?? Number.MAX_SAFE_INTEGER,
    });
  });

  return map;
}

export async function setCreditCostPerSession(
  profileId: string,
  creditCostPerSession: number,
): Promise<void> {
  await personaConfigCollection()
    .doc(profileId)
    .set({ creditCostPerSession, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Bulk-rewrites sortOrder for every id in `order`, in array order, as one batch write. */
export async function setPersonaOrder(order: string[]): Promise<void> {
  const db = adminFirestore();
  const batch = db.batch();

  order.forEach((profileId, index) => {
    batch.set(
      db.collection('personaConfig').doc(profileId),
      { sortOrder: index, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });

  await batch.commit();
}
