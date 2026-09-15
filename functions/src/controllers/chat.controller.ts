import type { Request, Response } from 'express';
import { z } from 'zod';

import { getOrCreateChat, handleUserMessage, listMessages } from '../services/chat.service';
import { UnauthorizedError } from '../utils/errors';

const sendMessageSchema = z.object({
  personaId: z.string().min(1),
  text: z.string().min(1).max(2000),
});

const createChatSchema = z.object({
  personaId: z.string().min(1),
});

export async function sendMessage(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { personaId, text } = sendMessageSchema.parse(req.body);
  const { chatId } = req.params;

  const result = await handleUserMessage(req.uid, chatId, personaId, text);
  res.json(result);
}

export async function createChat(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { personaId } = createChatSchema.parse(req.body);
  const chatId = await getOrCreateChat(req.uid, personaId);
  res.json({ chatId });
}

export async function getMessages(req: Request, res: Response): Promise<void> {
  if (!req.uid) throw new UnauthorizedError();

  const { chatId } = req.params;
  const messages = await listMessages(req.uid, chatId);
  res.json({ messages });
}
