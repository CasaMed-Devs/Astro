import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';

export interface PersonaConfig {
  sortOrder: number;
}

interface PersonaConfigDoc {
  sortOrder?: number;
}

function personaConfigCollection() {
  return adminFirestore().collection('personaConfig');
}

/** Batch read for merging into the astrologer list — one query instead of N doc reads. */
export async function getAllPersonaConfigs(): Promise<Map<string, PersonaConfig>> {
  const snapshot = await personaConfigCollection().get();
  const map = new Map<string, PersonaConfig>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data() as PersonaConfigDoc;
    map.set(doc.id, {
      sortOrder: data.sortOrder ?? Number.MAX_SAFE_INTEGER,
    });
  });

  return map;
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
