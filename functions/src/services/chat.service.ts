import { FieldValue } from 'firebase-admin/firestore';

import { adminFirestore } from '../config/firebase-admin';
import { getCreditCostPerSession } from './personaConfig.service';
import { listConversationMessages, sendChatMessage } from './personaApi.service';
import type { PersonaChatMeta } from './personaApi.service';
import { assertActiveOrStartSession, getSessionStatus } from './credits.service';
import type { SessionStatus } from './credits.service';
import {
  NotFoundError,
  PersonaConversationNotFoundError,
  UnauthorizedError,
} from '../utils/errors';
import type { UserProfileRecord } from '../types';

interface PersonaChatRecord {
  userId: string;
  profileId: string;
}

/** Deterministic id so re-opening a persona always resumes the same conversation. */
function buildSessionId(uid: string, profileId: string): string {
  return `${uid}_${profileId}`;
}

export interface ChatMeta {
  id: string;
  userId: string;
  personaId: string;
  createdAt: string;
  updatedAt: string;
  lastMessage?: string;
}

/**
 * Only a thin ownership doc lives in Firestore now — the Persona API is the
 * source of truth for message history (see listMessages/handleUserMessage).
 */
export async function getOrCreateChat(uid: string, profileId: string): Promise<ChatMeta> {
  const sessionId = buildSessionId(uid, profileId);
  const ref = adminFirestore().collection('personaChats').doc(sessionId);
  const snapshot = await ref.get();

  const now = new Date().toISOString();

  if (!snapshot.exists) {
    await ref.set({ userId: uid, profileId, createdAt: FieldValue.serverTimestamp() });
    return { id: sessionId, userId: uid, personaId: profileId, createdAt: now, updatedAt: now };
  }

  const data = snapshot.data()!;
  return {
    id: sessionId,
    userId: data.userId,
    personaId: data.profileId,
    createdAt: data.createdAt?.toDate?.()?.toISOString() ?? now,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? now,
    lastMessage: data.lastMessage,
  };
}

async function requireOwnedChat(uid: string, chatId: string): Promise<PersonaChatRecord> {
  const ref = adminFirestore().collection('personaChats').doc(chatId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new NotFoundError('Chat not found.');
  }

  const chat = snapshot.data() as PersonaChatRecord;
  if (chat.userId !== uid) {
    throw new UnauthorizedError('This chat does not belong to you.');
  }

  return chat;
}

/** Auto-fills already-saved birth details; client-supplied context wins on overlap. */
async function buildContextForUser(
  uid: string,
  clientContext?: Record<string, string>,
): Promise<Record<string, string>> {
  const snapshot = await adminFirestore().collection('users').doc(uid).get();
  const profile = snapshot.data() as UserProfileRecord | undefined;

  const autoContext: Record<string, string> = {};
  if (profile?.dateOfBirth) autoContext.dob = profile.dateOfBirth;
  if (profile?.timeOfBirth) autoContext.tob = profile.timeOfBirth;
  if (profile?.placeOfBirth) autoContext.pob = profile.placeOfBirth;

  return { ...autoContext, ...clientContext };
}

export interface HandleUserMessageResult {
  reply: string;
  paragraphs: string[];
  meta?: PersonaChatMeta;
  remainingCredits: number | null;
  sessionExpiresAt: string | null;
  isNewSession: boolean;
}

export async function handleUserMessage(
  uid: string,
  chatId: string,
  profileId: string,
  userMessage: string,
  context?: Record<string, string>,
): Promise<HandleUserMessageResult> {
  await requireOwnedChat(uid, chatId);

  const creditCostPerSession = await getCreditCostPerSession(profileId);
  const session = await assertActiveOrStartSession(uid, chatId, creditCostPerSession);

  const mergedContext = await buildContextForUser(uid, context);
  const result = await sendChatMessage({
    profileId,
    sessionId: chatId,
    userId: uid,
    message: userMessage,
    context: mergedContext,
  });

  return {
    reply: result.reply.text,
    paragraphs: result.reply.paragraphs,
    meta: result.meta,
    remainingCredits: session.remainingCredits,
    sessionExpiresAt: session.sessionExpiresAt,
    isNewSession: session.isNewSession,
  };
}

export interface ChatMessageResponse {
  id: string;
  sender: 'user' | 'astrologer';
  text: string;
  createdAt: string | null;
}

export interface ListMessagesResult {
  messages: ChatMessageResponse[];
  hasMore: boolean;
  nextCursor: number | null;
  sessionStatus: SessionStatus;
}

export async function listMessages(
  uid: string,
  chatId: string,
  opts: { limit?: number; before?: number },
): Promise<ListMessagesResult> {
  await requireOwnedChat(uid, chatId);

  const sessionStatus = await getSessionStatus(uid, chatId);

  try {
    const page = await listConversationMessages(chatId, opts);
    return {
      messages: page.messages.map((message) => ({
        id: String(message.seq),
        sender: message.role === 'user' ? 'user' : 'astrologer',
        text: message.text,
        createdAt: new Date(message.at).toISOString(),
      })),
      hasMore: page.has_more,
      nextCursor: page.next_cursor,
      sessionStatus,
    };
  } catch (error) {
    // A brand-new chat has no vendor-side conversation until the first
    // message is sent — that's an empty history, not an error.
    if (error instanceof PersonaConversationNotFoundError) {
      return { messages: [], hasMore: false, nextCursor: null, sessionStatus };
    }
    throw error;
  }
}
