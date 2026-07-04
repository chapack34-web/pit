import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';
import { io } from '../../index';
import { queueRetry } from './tornado';
import { rateLimiter } from './rateLimiter';
import { registerActivity } from '../social/achievements';

export const chatRouter = Router();
chatRouter.use(authMiddleware);

// Sistema "Menciones": detecta @nombre en el texto y devuelve los userIds mencionados
// (se resuelve contra los miembros reales del chat, no es un parseo cosmético).
async function extractMentions(chatId: string, content: string): Promise<string[]> {
  const handles = Array.from(content.matchAll(/@(\w+)/g)).map((m) => m[1].toLowerCase());
  if (handles.length === 0) return [];
  const members = await prisma.chatUser.findMany({ where: { chatId }, include: { user: true } });
  return members
    .filter((m: any) => handles.includes(m.user.name.toLowerCase()))
    .map((m: any) => m.userId);
}

// Enviar mensaje (fallback REST del sistema Tornado si el socket falla en el cliente)
chatRouter.post('/send', rateLimiter, async (req: AuthRequest, res) => {
  const { chatId, content, contentType, metadata, replyToId } = req.body;
  if (!chatId || !content) return res.status(400).json({ error: 'chatId y content requeridos' });

  const member = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!member) return res.status(403).json({ error: 'No pertenecés a este chat' });

  // Sistema "Bloqueo": si en un chat 1 a 1 el otro usuario te bloqueó, no se entrega.
  const otherMembers = await prisma.chatUser.findMany({ where: { chatId, NOT: { userId: req.userId! } } });
  if (otherMembers.length === 1) {
    const blocked = await prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId: otherMembers[0].userId, blockedId: req.userId! } }
    });
    if (blocked) return res.status(403).json({ error: 'No podés enviar mensajes a este usuario' });
  }

  try {
    const mentions = await extractMentions(chatId, content);
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: req.userId!,
        content,
        contentType: contentType || 'TEXT',
        metadata: metadata || undefined,
        replyToId: replyToId || undefined,
        mentions: mentions.length ? mentions : undefined
      }
    });
    io.to(chatId).emit('new_message', message);
    if (mentions.length) io.to(chatId).emit('mentioned', { messageId: message.id, mentions });
    registerActivity(req.userId!).catch((e) => console.error('Error registrando actividad:', e));
    return res.json(message);
  } catch (err) {
    // Sistema Tornado: si falla la escritura, se encola para reintento
    await queueRetry({ chatId, senderId: req.userId!, content, contentType, metadata, replyToId });
    return res.status(202).json({ queued: true });
  }
});

chatRouter.get('/:chatId/history', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const limit = Number(req.query.limit) || 50;
  const member = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!member) return res.status(403).json({ error: 'No pertenecés a este chat' });

  const messages = await prisma.message.findMany({
    where: { chatId, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    take: limit
  });
  return res.json(messages.reverse());
});

chatRouter.delete('/message/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message || message.senderId !== req.userId) {
    return res.status(403).json({ error: 'No podés borrar este mensaje' });
  }
  await prisma.message.update({ where: { id }, data: { isDeleted: true } });
  io.to(message.chatId).emit('message_deleted', { id });
  return res.json({ deleted: true });
});

chatRouter.post('/pin/:chatId/:messageId', async (req: AuthRequest, res) => {
  const { chatId, messageId } = req.params;
  const admin = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!admin || admin.role !== 'ADMIN') return res.status(403).json({ error: 'Solo admins pueden fijar mensajes' });
  await prisma.chat.update({ where: { id: chatId }, data: { pinnedMsgId: messageId } });
  io.to(chatId).emit('message_pinned', { messageId });
  return res.json({ pinned: true });
});

// Sistema "Editar mensaje": edición real con historial marcado (isEdited)
chatRouter.put('/message/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'content requerido' });

  const message = await prisma.message.findUnique({ where: { id } });
  if (!message || message.senderId !== req.userId) {
    return res.status(403).json({ error: 'No podés editar este mensaje' });
  }
  const updated = await prisma.message.update({
    where: { id },
    data: { content, isEdited: true }
  });
  io.to(message.chatId).emit('message_edited', updated);
  return res.json(updated);
});

// Sistema "Confirmación de lectura": marca el mensaje como leído por el usuario actual
chatRouter.post('/read/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const message = await prisma.message.findUnique({ where: { id } });
  if (!message) return res.status(404).json({ error: 'No encontrado' });

  const readBy: string[] = Array.isArray(message.readBy) ? (message.readBy as string[]) : [];
  if (!readBy.includes(req.userId!)) readBy.push(req.userId!);

  await prisma.message.update({ where: { id }, data: { readBy } });
  io.to(message.chatId).emit('message_read', { messageId: id, readBy });

  // Sistema "Fantasma Total": si el emisor lo activó para este chat, el mensaje
  // se borra apenas TODOS los demás miembros lo leyeron (real, no cosmético).
  const senderPrefs = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: message.senderId, chatId: message.chatId } }
  });
  if (senderPrefs?.autoDeleteAfterRead) {
    const allMembers = await prisma.chatUser.findMany({ where: { chatId: message.chatId } });
    const othersIds = allMembers.map((m: any) => m.userId).filter((uid: string) => uid !== message.senderId);
    const allRead = othersIds.every((uid: string) => readBy.includes(uid));
    if (allRead) {
      await prisma.message.update({ where: { id }, data: { isDeleted: true } });
      io.to(message.chatId).emit('message_deleted', { id });
    }
  }

  return res.json({ readBy });
});

// Sistema "Reenviar mensaje": copia el contenido a otro chat, guardando el origen
chatRouter.post('/forward/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { toChatId } = req.body;
  if (!toChatId) return res.status(400).json({ error: 'toChatId requerido' });

  const original = await prisma.message.findUnique({ where: { id } });
  if (!original) return res.status(404).json({ error: 'Mensaje original no encontrado' });

  const member = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId: toChatId } }
  });
  if (!member) return res.status(403).json({ error: 'No pertenecés a ese chat' });

  const forwarded = await prisma.message.create({
    data: {
      chatId: toChatId,
      senderId: req.userId!,
      content: original.content,
      contentType: original.contentType,
      metadata: original.metadata as any,
      forwardedFrom: original.senderId
    }
  });
  io.to(toChatId).emit('new_message', forwarded);
  return res.json(forwarded);
});

// Sistema "Mensajes efímeros": se autodestruyen pasado un tiempo (real, con cron de barrido)
chatRouter.post('/ephemeral', async (req: AuthRequest, res) => {
  const { chatId, content, ttlSeconds } = req.body;
  if (!chatId || !content || !ttlSeconds) {
    return res.status(400).json({ error: 'chatId, content y ttlSeconds requeridos' });
  }
  const member = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!member) return res.status(403).json({ error: 'No pertenecés a este chat' });

  const message = await prisma.message.create({
    data: {
      chatId,
      senderId: req.userId!,
      content,
      contentType: 'TEXT',
      isEphemeral: true,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000)
    }
  });
  io.to(chatId).emit('new_message', message);
  return res.json(message);
});

// Sistema "Búsqueda de mensajes": full-text simple sobre el contenido dentro de un chat
chatRouter.get('/:chatId/search', async (req: AuthRequest, res) => {
  const { chatId } = req.params;
  const q = String(req.query.q || '');
  if (!q) return res.status(400).json({ error: 'query ?q= requerido' });

  const member = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId } }
  });
  if (!member) return res.status(403).json({ error: 'No pertenecés a este chat' });

  const results = await prisma.message.findMany({
    where: { chatId, isDeleted: false, content: { contains: q, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    take: 50
  });
  return res.json(results);
});
chatRouter.post('/create', async (req: AuthRequest, res) => {
  const { userIds, isGroup, name } = req.body;
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds requerido' });
  }
  const allUserIds = Array.from(new Set([req.userId!, ...userIds]));
  const chat = await prisma.chat.create({
    data: {
      isGroup: !!isGroup,
      name: name || null,
      users: {
        create: allUserIds.map((id: string) => ({
          userId: id,
          role: id === req.userId ? 'ADMIN' : 'MEMBER'
        }))
      }
    },
    include: { users: true }
  });
  return res.json(chat);
});
