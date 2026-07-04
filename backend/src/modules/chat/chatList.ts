// Sistema "Lista de chats con no-leídos": el endpoint que arma la pantalla principal
// de cualquier app de mensajería — chats ordenados, con conteo real de no leídos.
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const chatListRouter = Router();
chatListRouter.use(authMiddleware);

chatListRouter.get('/', async (req: AuthRequest, res) => {
  const memberships = await prisma.chatUser.findMany({
    where: { userId: req.userId! },
    include: {
      chat: {
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 1 }
        }
      }
    }
  });

  const result = await Promise.all(
    memberships.map(async (m: any) => {
      // Contamos no-leídos comparando contra todos los mensajes del chat que no son míos
      // y filtrando en memoria los que ya tienen mi userId en readBy (JSON array).
      const candidates = await prisma.message.findMany({
        where: { chatId: m.chatId, isDeleted: false, senderId: { not: req.userId! } },
        select: { id: true, readBy: true }
      });
      const unreadCount = candidates.filter(
        (msg: any) => !Array.isArray(msg.readBy) || !msg.readBy.includes(req.userId!)
      ).length;

      return {
        chatId: m.chatId,
        name: m.chat.name,
        isGroup: m.chat.isGroup,
        isMuted: m.isMuted,
        isArchived: m.isArchived,
        isPinned: m.isPinned,
        lastMessage: m.chat.messages[0] || null,
        unreadCount
      };
    })
  );

  // Ordena: fijados primero, después por último mensaje más reciente
  result.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    const aTime = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
    const bTime = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
    return bTime - aTime;
  });

  return res.json(result);
});
