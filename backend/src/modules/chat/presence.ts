import { Server, Socket } from 'socket.io';
import { setTyping } from '../../core/database/redis';
import { prisma } from '../../core/database/client';

export function registerPresenceHandlers(io: Server, socket: Socket) {
  socket.on('typing', async ({ chatId, userId }) => {
    await setTyping(chatId, userId);
    socket.to(chatId).emit('user_typing', { chatId, userId });
  });

  socket.on('presence_update', async ({ userId, isOnline }) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const ghostMode = (user?.settings as any)?.ghostMode;
    if (ghostMode) return; // Sistema #13: modo fantasma, no se emite ni actualiza lastSeen
    await prisma.user.update({
      where: { id: userId },
      data: { isOnline, lastSeen: new Date() }
    });
    socket.broadcast.emit('presence_changed', { userId, isOnline });
  });
}
