import type { ChatMessageDoc, ChatDoc } from '@/types/firestore';

interface CachedChat {
  messages: ChatMessageDoc[];
  meta: ChatDoc;
  timestamp: number;
}

const CHAT_CACHE = new Map<string, CachedChat>();
const CACHE_TTL_MS = 10 * 60 * 1000;

function isExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_TTL_MS;
}

export function getCachedChat(chatId: string): CachedChat | null {
  const cached = CHAT_CACHE.get(chatId);
  if (!cached) return null;
  if (isExpired(cached.timestamp)) {
    CHAT_CACHE.delete(chatId);
    return null;
  }
  return cached;
}

export function setCachedChat(chatId: string, chat: ChatDoc, messages: ChatMessageDoc[]): void {
  CHAT_CACHE.set(chatId, {
    messages: [...messages].sort((a, b) => Number(a.id) - Number(b.id)),
    meta: chat,
    timestamp: Date.now(),
  });
}

export function updateCachedMessages(chatId: string, messages: ChatMessageDoc[]): void {
  const cached = CHAT_CACHE.get(chatId);
  if (cached) {
    cached.messages = [...messages].sort((a, b) => Number(a.id) - Number(b.id));
    cached.timestamp = Date.now();
  }
}

export function prependCachedMessages(chatId: string, newMessages: ChatMessageDoc[]): void {
  const cached = CHAT_CACHE.get(chatId);
  if (cached) {
    const existingIds = new Set(cached.messages.map((m) => m.id));
    const uniqueNew = newMessages.filter((m) => !existingIds.has(m.id));
    cached.messages = [...uniqueNew, ...cached.messages].sort((a, b) => Number(a.id) - Number(b.id));
    cached.timestamp = Date.now();
  }
}

export function appendCachedMessage(chatId: string, message: ChatMessageDoc): void {
  const cached = CHAT_CACHE.get(chatId);
  if (cached) {
    cached.messages = [...cached.messages, message].sort((a, b) => Number(a.id) - Number(b.id));
    cached.timestamp = Date.now();
  }
}

export function removeCachedChat(chatId: string): void {
  CHAT_CACHE.delete(chatId);
}

export function clearChatCache(): void {
  CHAT_CACHE.clear();
}

export function getAllCachedChats(): ChatDoc[] {
  const chats: ChatDoc[] = [];
  for (const [, value] of CHAT_CACHE) {
    if (!isExpired(value.timestamp)) {
      chats.push(value.meta);
    }
  }
  return chats.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
}