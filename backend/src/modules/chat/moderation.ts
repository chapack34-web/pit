import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const moderationRouter = Router();
moderationRouter.use(authMiddleware);

// Sistema "Bloqueo de usuarios": real, se aplica al enviar mensajes (ver tornado/controller).
moderationRouter.post('/block/:userId', async (req: AuthRequest, res) => {
  const { userId } = req.params;
  await prisma.block.upsert({
    where: { blockerId_blockedId: { blockerId: req.userId!, blockedId: userId } },
    update: {},
    create: { blockerId: req.userId!, blockedId: userId }
  });
  return res.json({ blocked: true });
});

moderationRouter.delete('/block/:userId', async (req: AuthRequest, res) => {
  const { userId } = req.params;
  await prisma.block.deleteMany({ where: { blockerId: req.userId!, blockedId: userId } });
  return res.json({ unblocked: true });
});

moderationRouter.get('/blocked', async (req: AuthRequest, res) => {
  const blocked = await prisma.block.findMany({
    where: { blockerId: req.userId! },
    include: { blocked: { select: { id: true, name: true, phone: true } } }
  });
  return res.json(blocked.map((b: any) => b.blocked));
});

// Sistema "Silenciar chat": deja de recibir notificaciones sin salir del chat.
moderationRouter.post('/mute/:chatId', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const { muted } = req.body;
  await prisma.chatUser.update({
    where: { userId_chatId: { userId: req.userId!, chatId } },
    data: { isMuted: !!muted }
  });
  return res.json({ muted: !!muted });
});

// Sistema "Archivar chat": lo saca de la lista principal sin borrar nada.
moderationRouter.post('/archive/:chatId', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const { archived } = req.body;
  await prisma.chatUser.update({
    where: { userId_chatId: { userId: req.userId!, chatId } },
    data: { isArchived: !!archived }
  });
  return res.json({ archived: !!archived });
});

// Sistema "Fijar chat": lo sube arriba de todo en la lista.
moderationRouter.post('/pin-chat/:chatId', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const { pinned } = req.body;
  await prisma.chatUser.update({
    where: { userId_chatId: { userId: req.userId!, chatId } },
    data: { isPinned: !!pinned }
  });
  return res.json({ pinned: !!pinned });
});

// Sistema "Fantasma Total": tus mensajes en este chat se autodestruyen apenas
// el otro los lee — no quedan ni en tu propio historial. Real, se aplica en
// el endpoint de confirmación de lectura (chat/controller.ts).
moderationRouter.post('/ghost-total/:chatId', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const { enabled } = req.body;
  await prisma.chatUser.update({
    where: { userId_chatId: { userId: req.userId!, chatId } },
    data: { autoDeleteAfterRead: !!enabled }
  });
  return res.json({ ghostTotal: !!enabled });
});
moderationRouter.delete('/group/:chatId/member/:userId', async (req: AuthRequest, res) => {
  const { chatId, userId } = req.params;
  const admin = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Solo admins pueden expulsar miembros' });
  await prisma.chatUser.delete({ where: { userId_chatId: { userId, chatId } } });
  return res.json({ removed: true });
});

// Sistema "Promover/degradar admin" dentro de un grupo.
moderationRouter.post('/group/:chatId/role/:userId', async (req: AuthRequest, res) => {
  const { chatId, userId } = req.params;
  const { role } = req.body; // 'ADMIN' | 'MOD' | 'MEMBER'
  const admin = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Solo admins pueden cambiar roles' });
  await prisma.chatUser.update({ where: { userId_chatId: { userId, chatId } }, data: { role } });
  return res.json({ role });
});
