import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { getPersonaById } from '../config/personas';
import { generateAstrologerReply } from './ai.service';
import { assertAndConsumeEntitlement, getRemainingCredits } from './credits.service';
import { NotFoundError, UnauthorizedError } from '../utils/errors';
import type { ChatMessageRecord } from '../types';

const HISTORY_LIMIT = 20;

interface ChatRecord {
  userId: string;
  personaId: string;
}

export interface HandleUserMessageResult {
  reply: string;
  remainingCredits: number | null;
}

export async function handleUserMessage(
  uid: string,
  chatId: string,
  personaId: string,
  userMessage: string,
): Promise<HandleUserMessageResult> {
  const db = adminFirestore();
  const chatRef = db.collection('chats').doc(chatId);
  const chatSnapshot = await chatRef.get();

  if (!chatSnapshot.exists) {
    throw new NotFoundError('Chat not found.');
  }

  const chat = chatSnapshot.data() as ChatRecord;
  if (chat.userId !== uid) {
    throw new UnauthorizedError('This chat does not belong to you.');
  }

  const persona = getPersonaById(personaId);
  if (!persona) {
    throw new NotFoundError('Astrologer persona not found.');
  }

  await assertAndConsumeEntitlement(uid, persona.creditCostPerMessage);

  await chatRef.collection('messages').add({
    sender: 'user',
    text: userMessage,
    createdAt: FieldValue.serverTimestamp(),
    status: 'sent',
  });

  const historySnapshot = await chatRef
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(HISTORY_LIMIT)
    .get();

  const history: ChatMessageRecord[] = historySnapshot.docs
    .map((doc) => doc.data() as ChatMessageRecord)
    .reverse();

  const reply = await generateAstrologerReply(persona.systemPrompt, history, userMessage);

  await chatRef.collection('messages').add({
    sender: 'astrologer',
    text: reply,
    createdAt: FieldValue.serverTimestamp(),
    status: 'delivered',
  });

  await chatRef.update({
    lastMessage: reply,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const remainingCredits = await getRemainingCredits(uid);
  return { reply, remainingCredits };
}

function buildChatId(userId: string, personaId: string): string {
  return `${userId}_${personaId}`;
}

/** Deterministic id so re-opening a persona always resumes the same conversation. */
export async function getOrCreateChat(uid: string, personaId: string): Promise<string> {
  if (!getPersonaById(personaId)) {
    throw new NotFoundError('Astrologer persona not found.');
  }

  const chatId = buildChatId(uid, personaId);
  const chatRef = adminFirestore().collection('chats').doc(chatId);
  const snapshot = await chatRef.get();

  if (!snapshot.exists) {
    await chatRef.set({
      userId: uid,
      personaId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return chatId;
}

export interface ChatMessageResponse {
  id: string;
  sender: ChatMessageRecord['sender'];
  text: string;
  status: string;
  createdAt: string | null;
}

export async function listMessages(uid: string, chatId: string): Promise<ChatMessageResponse[]> {
  const chatRef = adminFirestore().collection('chats').doc(chatId);
  const chatSnapshot = await chatRef.get();

  if (!chatSnapshot.exists) {
    throw new NotFoundError('Chat not found.');
  }

  const chat = chatSnapshot.data() as ChatRecord;
  if (chat.userId !== uid) {
    throw new UnauthorizedError('This chat does not belong to you.');
  }

  const messagesSnapshot = await chatRef.collection('messages').orderBy('createdAt', 'asc').get();

  return messagesSnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      sender: data.sender,
      text: data.text,
      status: data.status,
      createdAt: data.createdAt?.toDate?.().toISOString() ?? null,
    };
  });
}
