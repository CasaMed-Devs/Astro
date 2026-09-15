import type { ChatMessageRecord } from '../types';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

interface OpenAiChatCompletionResponse {
  choices: { message: { content: string } }[];
}

export async function generateOpenAiReply(
  apiKey: string,
  systemPrompt: string,
  history: ChatMessageRecord[],
  userMessage: string,
): Promise<string> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((message) => ({
      role: message.sender === 'user' ? ('user' as const) : ('assistant' as const),
      content: message.text,
    })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.7 }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as OpenAiChatCompletionResponse;
  const reply = data.choices[0]?.message?.content?.trim();
  if (!reply) throw new Error('OpenAI returned an empty reply.');
  return reply;
}
