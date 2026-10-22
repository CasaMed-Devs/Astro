import { apiClient } from '@/services/apiClient';
import type { ChatMessageDoc, ChatDoc, ChatReplyMeta } from '@/types/firestore';
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
  remainingCredits: number;
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

/** The user's most recently messaged chat, for the astrologers tab's "Continue chat" card. */
export interface RecentChat {
  chatId: string;
  personaId: string;
  lastMessage: string | null;
  lastMessageAt: string; // ISO
}

export async function fetchRecentChat(): Promise<RecentChat | null> {
  try {
    const { chat } = await apiClient.get<{ chat: RecentChat | null }>('/chats/recent');
    return chat;
  } catch (error) {
    throw toAppError(error);
  }
}

export interface MessagesUpdate {
  messages: ChatMessageDoc[];
  remainingCredits: number | null;
  /** Whether older messages exist before this window; null for a cache hit (unknown). */
  hasMore: boolean | null;
  /** True for the instant in-memory cache replay, before the server has answered. */
  fromCache: boolean;
}

export function subscribeToMessages(
  chatId: string,
  callback: (update: MessagesUpdate) => void,
  onError?: (error: unknown) => void,
): () => void {
  const cached = getCachedChat(chatId);
  if (cached) {
    callback({
      messages: cached.messages,
      remainingCredits: cached.remainingCredits ?? null,
      hasMore: null,
      fromCache: true,
    });
  }

  return pollFor(
    async () => {
      const result = await apiClient.get<ListMessagesResponse>(`/chats/${chatId}/messages`);
      const messages = result.messages.map(toDoc);
      updateCachedMessages(chatId, messages, result.remainingCredits);
      return { messages, remainingCredits: result.remainingCredits, hasMore: result.hasMore, fromCache: false };
    },
    callback,
    MESSAGES_POLL_INTERVAL_MS,
    onError,
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
  remainingCredits: number;
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
