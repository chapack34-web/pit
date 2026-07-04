// Sistema "Canales" (idea original #93): un grupo grande se organiza en
// sub-canales (#general, #memes, #avisos), cada mensaje se etiqueta con su canal.
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const channelRouter = Router();
channelRouter.use(authMiddleware);

channelRouter.post('/:chatId/create', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name requerido' });

  const member = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!member) return res.status(403).json({ error: 'No pertenecés a este grupo' });

  const channel = await prisma.channel.create({
    data: { chatId, name: name.toLowerCase().replace(/\s+/g, '-'), createdBy: req.userId! }
  });
  return res.json(channel);
});

channelRouter.get('/:chatId', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const channels = await prisma.channel.findMany({ where: { chatId }, orderBy: { createdAt: 'asc' } });
  return res.json(channels);
});

channelRouter.delete('/:id', async (req: AuthRequest, res) => {
  const channel = await prisma.channel.findUnique({ where: { id: req.params.id } });
  if (!channel) return res.status(404).json({ error: 'No encontrado' });
  const admin = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId: channel.chatId } }
  });
  if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Solo admins pueden borrar canales' });
  await prisma.channel.delete({ where: { id: req.params.id } });
  return res.json({ deleted: true });
});
