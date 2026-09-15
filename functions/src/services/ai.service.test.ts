import { AiProviderNotConfiguredError } from '../utils/errors';
import { env } from '../config/env';
import { generateAstrologerReply } from './ai.service';
import { generateOpenAiReply } from './ai.openai.adapter';
import { generateAnthropicReply } from './ai.anthropic.adapter';

jest.mock('../config/env', () => ({
  env: { ai: { provider: undefined, openaiApiKey: undefined, anthropicApiKey: undefined } },
}));
jest.mock('./ai.openai.adapter', () => ({
  generateOpenAiReply: jest.fn().mockResolvedValue('openai reply'),
}));
jest.mock('./ai.anthropic.adapter', () => ({
  generateAnthropicReply: jest.fn().mockResolvedValue('anthropic reply'),
}));

describe('generateAstrologerReply', () => {
  beforeEach(() => {
    env.ai.provider = undefined;
    env.ai.openaiApiKey = undefined;
    env.ai.anthropicApiKey = undefined;
  });

  it('throws AiProviderNotConfiguredError when no provider is set', async () => {
    await expect(generateAstrologerReply('system', [], 'hello')).rejects.toBeInstanceOf(
      AiProviderNotConfiguredError,
    );
  });

  it('throws AiProviderNotConfiguredError for openai when the API key is missing', async () => {
    env.ai.provider = 'openai';

    await expect(generateAstrologerReply('system', [], 'hello')).rejects.toBeInstanceOf(
      AiProviderNotConfiguredError,
    );
  });

  it('delegates to the OpenAI adapter when configured', async () => {
    env.ai.provider = 'openai';
    env.ai.openaiApiKey = 'sk-test';

    const reply = await generateAstrologerReply('system', [], 'hello');

    expect(reply).toBe('openai reply');
    expect(generateOpenAiReply).toHaveBeenCalledWith('sk-test', 'system', [], 'hello');
  });

  it('delegates to the Anthropic adapter when configured', async () => {
    env.ai.provider = 'anthropic';
    env.ai.anthropicApiKey = 'sk-ant-test';

    const reply = await generateAstrologerReply('system', [], 'hello');

    expect(reply).toBe('anthropic reply');
    expect(generateAnthropicReply).toHaveBeenCalledWith('sk-ant-test', 'system', [], 'hello');
  });
});
