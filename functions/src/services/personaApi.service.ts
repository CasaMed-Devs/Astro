import https from 'node:https';

import { env } from '../config/env';
import {
  PersonaAccountDisabledError,
  PersonaApiNotConfiguredError,
  PersonaConversationBlockedError,
  PersonaConversationExistsError,
  PersonaConversationNotFoundError,
  PersonaInvalidKeyError,
  PersonaMissingContextError,
  PersonaNotEnabledError,
  PersonaUpstreamError,
} from '../utils/errors';

const BASE_URL = 'https://personaapi.web.app/v1';

export interface PersonaRequiredInput {
  key: string;
  label: string;
  example: string;
  required: boolean;
}

export interface PersonaProfile {
  id: string;
  category: string;
  name: string;
  tagline: string;
  method: string;
  city: string;
  age: number;
  photo_url: string;
  greeting: string;
  openers: string[];
  required_inputs: PersonaRequiredInput[];
}

export interface PersonaChatMeta {
  cards?: unknown;
  leaning?: unknown;
  timing?: unknown;
  remedy?: unknown;
}

export interface PersonaChatResult {
  session_id: string;
  reply: { seq: number; text: string; paragraphs: string[]; at: number };
  meta?: PersonaChatMeta;
}

export interface PersonaConversationMessage {
  seq: number;
  role: 'user' | 'assistant';
  text: string;
  at: number;
}

export interface PersonaMessagesPage {
  messages: PersonaConversationMessage[];
  next_cursor: number | null;
  has_more: boolean;
}

interface PersonaErrorBody {
  error?: {
    code?: string;
    message?: string;
  };
}

function errorForCode(code: string | undefined, message: string | undefined): Error {
  switch (code) {
    case 'missing_key':
    case 'invalid_key':
      return new PersonaInvalidKeyError();
    case 'profile_not_enabled':
    case 'unknown_profile':
      return new PersonaNotEnabledError();
    case 'missing_context':
      return new PersonaMissingContextError(message);
    case 'conversation_not_found':
      return new PersonaConversationNotFoundError();
    case 'conversation_exists':
      return new PersonaConversationExistsError();
    case 'conversation_blocked':
      return new PersonaConversationBlockedError();
    case 'account_disabled':
      return new PersonaAccountDisabledError();
    case 'upstream_error':
    default:
      return new PersonaUpstreamError();
  }
}

function requireApiKey(): string {
  if (!env.personaApi.apiKey) {
    throw new PersonaApiNotConfiguredError();
  }
  return env.personaApi.apiKey;
}

interface PersonaRequestInit {
  method?: 'GET' | 'POST';
  body?: string;
  timeoutMs?: number;
}

/**
 * Uses Node's `https` module instead of the global `fetch` (undici) — undici
 * auto-adds a `Sec-Fetch-Mode: cors` header that this vendor's
 * `/conversations/:id/messages` route mishandles, returning a false
 * `conversation_not_found` for an existing conversation. `https`/curl, which
 * don't send that header, work correctly.
 */
async function personaFetch<T>(path: string, init: PersonaRequestInit = {}): Promise<T> {
  const apiKey = requireApiKey();
  const { method = 'GET', body, timeoutMs = 10_000 } = init;

  const { status, text } = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const request = https.request(
      `${BASE_URL}${path}`,
      {
        method,
        timeout: timeoutMs,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
      },
      (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, text: data }));
      },
    );

    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  }).catch((error) => {
    throw error instanceof Error && error.message === 'timeout' ? new PersonaUpstreamError() : error;
  });

  if (status < 200 || status >= 300) {
    let errorBody: PersonaErrorBody = {};
    try {
      errorBody = JSON.parse(text) as PersonaErrorBody;
    } catch {
      // non-JSON error body, fall through with an empty one
    }

    const code = errorBody.error?.code;
    const message = errorBody.error?.message;

    // upstream_error is explicitly retry-worthy per the vendor's own guide.
    if (code === 'upstream_error') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return personaFetch<T>(path, init);
    }

    throw errorForCode(code, message);
  }

  return JSON.parse(text) as T;
}

export function listProfiles(): Promise<{ profiles: PersonaProfile[] }> {
  return personaFetch<{ profiles: PersonaProfile[] }>('/profiles');
}

export function sendChatMessage(args: {
  profileId: string;
  sessionId: string;
  userId: string;
  message: string;
  context?: Record<string, string>;
}): Promise<PersonaChatResult> {
  return personaFetch<PersonaChatResult>('/chat', {
    method: 'POST',
    timeoutMs: 60_000,
    body: JSON.stringify({
      profile_id: args.profileId,
      session_id: args.sessionId,
      user_id: args.userId,
      message: args.message,
      context: args.context,
    }),
  });
}

export function listConversationMessages(
  conversationId: string,
  opts: { limit?: number; before?: number },
): Promise<PersonaMessagesPage> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.before != null) params.set('before', String(opts.before));
  const query = params.toString();
  return personaFetch<PersonaMessagesPage>(
    `/conversations/${encodeURIComponent(conversationId)}/messages${query ? `?${query}` : ''}`,
  );
}
