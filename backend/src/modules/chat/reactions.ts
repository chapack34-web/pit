// Sistema "Reacciones": like WhatsApp/Telegram pero con toggle real (tocar de nuevo la quita).
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';
import { io } from '../../index';

export const reactionRouter = Router();
reactionRouter.use(authMiddleware);

reactionRouter.post('/:messageId', async (req: AuthRequest, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: 'emoji requerido' });

  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) return res.status(404).json({ error: 'Mensaje no encontrado' });

  const existing = await prisma.reaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: req.userId!, emoji } }
  });

  let action: 'added' | 'removed';
  if (existing) {
    await prisma.reaction.delete({ where: { id: existing.id } });
    action = 'removed';
  } else {
    await prisma.reaction.create({ data: { messageId, userId: req.userId!, emoji } });
    action = 'added';
  }

  const allReactions = await prisma.reaction.findMany({ where: { messageId } });
  io.to(message.chatId).emit('reaction_update', { messageId, action, emoji, userId: req.userId, reactions: allReactions });
  return res.json({ action, reactions: allReactions });
});
