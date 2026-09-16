import { apiClient } from '@/services/apiClient';
import type { ChatMessageDoc, ChatDoc, ChatReplyMeta, ChatSessionStatus } from '@/types/firestore';
import { pollFor } from '@/utils/poll';
import { toAppError } from '@/utils/errors';
import {
  getCachedChat,
  setCachedChat,
  updateCachedMessages,
  prependCachedMessages,
  appendCachedMessage,
  getAllCachedChats,
} from '@/services/chatCache';

const MESSAGES_POLL_INTERVAL_MS = 3000;
const SEND_TIMEOUT_MS = 60_000;

interface ChatMessageResponse {
  id: string;
  sender: 'user' | 'astrologer';
  text: string;
  createdAt: string | null;
}

interface ListMessagesResponse {
  messages: ChatMessageResponse[];
  hasMore: boolean;
  nextCursor: number | null;
  sessionStatus: ChatSessionStatus;
}

interface ChatCreateResponse {
  chatId: string;
  chat?: ChatDoc;
}

function toDoc(message: ChatMessageResponse): ChatMessageDoc {
  return { ...message, status: 'delivered' };
}

export async function getOrCreateChat(personaId: string): Promise<string> {
  try {
    const cached = getAllCachedChats().find((c) => c.personaId === personaId);
    if (cached?.id) {
      return cached.id;
    }

    const response = await apiClient.post<ChatCreateResponse>('/chats', { personaId });
    if (response.chat) {
      setCachedChat(response.chatId, response.chat, []);
    }
    return response.chatId;
  } catch (error) {
    throw toAppError(error);
  }
}

export interface MessagesUpdate {
  messages: ChatMessageDoc[];
  sessionStatus: ChatSessionStatus | null;
}

export function subscribeToMessages(
  chatId: string,
  callback: (update: MessagesUpdate) => void,
): () => void {
  const cached = getCachedChat(chatId);
  if (cached) {
    callback({ messages: cached.messages, sessionStatus: cached.sessionStatus ?? null });
  }

  return pollFor(
    async () => {
      const result = await apiClient.get<ListMessagesResponse>(`/chats/${chatId}/messages`);
      const messages = result.messages.map(toDoc);
      updateCachedMessages(chatId, messages, result.sessionStatus);
      return { messages, sessionStatus: result.sessionStatus };
    },
    callback,
    MESSAGES_POLL_INTERVAL_MS,
  );
}

export async function fetchOlderMessages(
  chatId: string,
  beforeSeq: number,
): Promise<{ messages: ChatMessageDoc[]; hasMore: boolean }> {
  try {
    const cached = getCachedChat(chatId);
    if (cached && cached.messages.length > 0) {
      const oldestCached = Number(cached.messages[0].id);
      if (beforeSeq >= oldestCached) {
        const older = cached.messages.filter((m) => Number(m.id) < beforeSeq);
        if (older.length > 0) {
          return { messages: older.slice(-30), hasMore: older.length > 30 };
        }
      }
    }

    const result = await apiClient.get<ListMessagesResponse>(
      `/chats/${chatId}/messages?before=${beforeSeq}&limit=30`,
    );
    const messages = result.messages.map(toDoc);
    prependCachedMessages(chatId, messages);
    return { messages, hasMore: result.hasMore };
  } catch (error) {
    throw toAppError(error);
  }
}

export interface SendMessageResult {
  reply: string;
  paragraphs: string[];
  meta?: ChatReplyMeta;
  remainingCredits: number | null;
  sessionExpiresAt: string | null;
  isNewSession: boolean;
}

export async function sendUserMessage(
  chatId: string,
  personaId: string,
  text: string,
  context?: Record<string, string>,
): Promise<SendMessageResult> {
  try {
    const userMessage: ChatMessageDoc = {
      id: `local-${Date.now()}`,
      sender: 'user',
      text,
      createdAt: new Date().toISOString(),
      status: 'sent',
    };
    appendCachedMessage(chatId, userMessage);

    const result = await apiClient.post<SendMessageResult>(
      `/chats/${chatId}/messages`,
      { personaId, text, context },
      { timeoutMs: SEND_TIMEOUT_MS },
    );

    return result;
  } catch (error) {
    throw toAppError(error);
  }
}
