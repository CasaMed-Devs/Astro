import type { ChatMessageRecord } from '../types';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
const MAX_TOKENS = 512;

interface AnthropicMessageResponse {
  content: { type: string; text?: string }[];
}

export async function generateAnthropicReply(
  apiKey: string,
  systemPrompt: string,
  history: ChatMessageRecord[],
  userMessage: string,
): Promise<string> {
  const messages = [
    ...history.map((message) => ({
      role: message.sender === 'user' ? ('user' as const) : ('assistant' as const),
      content: message.text,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: systemPrompt, messages }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as AnthropicMessageResponse;
  const reply = data.content.find((block) => block.type === 'text')?.text?.trim();
  if (!reply) throw new Error('Anthropic returned an empty reply.');
  return reply;
}
