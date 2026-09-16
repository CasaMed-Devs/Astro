import type { Request, Response } from 'express';
import { z } from 'zod';

import { getOrCreateChat, handleUserMessage, listMessages } from '../services/chat.service';
import { listProfiles } from '../services/personaApi.service';
import {
  getAllPersonaConfigs,
  DEFAULT_CREDIT_COST_PER_SESSION,
} from '../services/personaConfig.service';
import { UnauthorizedError } from '../utils/errors';

const PERSONA_API_ORIGIN = 'https://personaapi.web.app';

const sendMessageSchema = z.object({
  personaId: z.string().min(1),
  text: z.string().min(1).max(2000),
  context: z.record(z.string()).optional(),
});

const createChatSchema = z.object({
  personaId: z.string().min(1),
});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.coerce.number().int().optional(),
});

export async function sendMessage(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { personaId, text, context } = sendMessageSchema.parse(req.body);
  const { chatId } = req.params;

  const result = await handleUserMessage(req.uid, chatId, personaId, text, context);
  res.json(result);
}

export async function createChat(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { personaId } = createChatSchema.parse(req.body);
  const chat = await getOrCreateChat(req.uid, personaId);
  res.json({ chatId: chat.id, chat });
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { chatId } = req.params;
  const { limit, before } = listMessagesQuerySchema.parse(req.query);
  const result = await listMessages(req.uid, chatId, { limit, before });
  res.json(result);
}

export async function listPersonas(_req: Request, res: Response): Promise<void> {
  const [{ profiles }, configs] = await Promise.all([listProfiles(), getAllPersonaConfigs()]);

  const merged = profiles.map((profile) => {
    const config = configs.get(profile.id);
    return {
      id: profile.id,
      category: profile.category,
      name: profile.name,
      tagline: profile.tagline,
      method: profile.method,
      city: profile.city,
      age: profile.age,
      photoUrl: `${PERSONA_API_ORIGIN}${profile.photo_url}`,
      greeting: profile.greeting,
      openers: profile.openers,
      requiredInputs: profile.required_inputs,
      creditCostPerSession: config?.creditCostPerSession ?? DEFAULT_CREDIT_COST_PER_SESSION,
      sortOrder: config?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    };
  });

  merged.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  res.json({ profiles: merged });
}
