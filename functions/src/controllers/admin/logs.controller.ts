import type { Request, Response } from 'express';
import type { Timestamp } from 'firebase-admin/firestore';

import { adminFirestore } from '../../config/firebase-admin';

const MAX_LOG_ROWS = 200;

/** The most recent admin actions, newest first — see adminSubscription.service.ts's writeAdminLog. */
export async function listLogs(_req: Request, res: Response): Promise<void> {
  const snapshot = await adminFirestore()
    .collection('adminLogs')
    .orderBy('createdAt', 'desc')
    .limit(MAX_LOG_ROWS)
    .get();

  res.json({
    logs: snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        action: data.action,
        adminName: data.adminName,
        phoneNumber: data.userId,
        outcome: data.outcome,
        details: data.details ?? {},
        error: data.error ?? null,
        createdAt: (data.createdAt as Timestamp | undefined)?.toDate().toISOString(),
      };
    }),
  });
}
