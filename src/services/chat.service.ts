import { apiClient } from '@/services/apiClient';
import type { ChatMessageDoc } from '@/types/firestore';
import { pollFor } from '@/utils/poll';
import { toAppError } from '@/utils/errors';

const MESSAGES_POLL_INTERVAL_MS = 3000;

export async function getOrCreateChat(personaId: string): Promise<string> {
  try {
    const { chatId } = await apiClient.post<{ chatId: string }>('/chats', { personaId });
    return chatId;
  } catch (error) {
    throw toAppError(error);
  }
}

export function subscribeToMessages(
  chatId: string,
  callback: (messages: ChatMessageDoc[]) => void,
): () => void {
  return pollFor(
    async () => (await apiClient.get<{ messages: ChatMessageDoc[] }>(`/chats/${chatId}/messages`)).messages,
    callback,
    MESSAGES_POLL_INTERVAL_MS,
  );
}

export interface SendMessageResult {
  reply: string;
  remainingCredits: number | null;
}

/** The backend writes both the user's message and the AI reply via the Admin SDK. */
export async function sendUserMessage(
  chatId: string,
  personaId: string,
  text: string,
): Promise<SendMessageResult> {
  try {
    return await apiClient.post<SendMessageResult>(`/chats/${chatId}/messages`, {
      personaId,
      text,
    });
  } catch (error) {
    throw toAppError(error);
  }
}
