import { env } from '../config/env';
import { AiProviderNotConfiguredError } from '../utils/errors';
import type { ChatMessageRecord } from '../types';
import { generateOpenAiReply } from './ai.openai.adapter';
import { generateAnthropicReply } from './ai.anthropic.adapter';

export interface AiChatProvider {
  generateReply(
    systemPrompt: string,
    history: ChatMessageRecord[],
    userMessage: string,
  ): Promise<string>;
}

/**
 * Provider-agnostic entry point. Which vendor SDK actually runs is chosen
 * by the `AI_PROVIDER` env var — set it (plus the matching API key) once a
 * provider is decided, no other code needs to change.
 */
export async function generateAstrologerReply(
  systemPrompt: string,
  history: ChatMessageRecord[],
  userMessage: string,
): Promise<string> {
  switch (env.ai.provider) {
    case 'openai':
      if (!env.ai.openaiApiKey) throw new AiProviderNotConfiguredError();
      return generateOpenAiReply(env.ai.openaiApiKey, systemPrompt, history, userMessage);
    case 'anthropic':
      if (!env.ai.anthropicApiKey) throw new AiProviderNotConfiguredError();
      return generateAnthropicReply(env.ai.anthropicApiKey, systemPrompt, history, userMessage);
    default:
      throw new AiProviderNotConfiguredError();
  }
}
