// Sistema "Links de invitación": generás un link real, con token único y expiración,
// para que cualquiera se una a un grupo sin que lo tengas que agregar manualmente.
import { Router } from 'express';
import crypto from 'crypto';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';
import { redis } from '../../core/database/redis';

export const inviteRouter = Router();
inviteRouter.use(authMiddleware);

inviteRouter.post('/create/:chatId', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const { expiresInSeconds } = req.body;

  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat || !chat.isGroup) return res.status(400).json({ error: 'Solo se pueden invitar a grupos' });

  const admin = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Solo admins pueden crear invitaciones' });

  const token = crypto.randomBytes(12).toString('hex');
  const ttl = expiresInSeconds || 86400; // 24hs por defecto
  await redis.set(`invite:${token}`, chatId, 'EX', ttl);

  return res.json({ token, expiresIn: ttl, link: `/join/${token}` });
});

inviteRouter.post('/accept/:token', async (req: AuthRequest, res) => {
  const { token } = req.params;
  const chatId = await redis.get(`invite:${token}`);
  if (!chatId) return res.status(400).json({ error: 'Invitación inválida o expirada' });

  const existing = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (existing) return res.json({ alreadyMember: true, chatId });

  await prisma.chatUser.create({ data: { userId: req.userId!, chatId, role: 'MEMBER' } });
  return res.json({ joined: true, chatId });
});
