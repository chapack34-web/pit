// Worker real: revisa cada 15s si hay mensajes programados cuya hora ya llegó, y los envía.
import { prisma } from '../database/client';
import { io } from '../../index';

export async function processScheduledMessages() {
  const now = new Date();
  const due = await prisma.scheduledMessage.findMany({ where: { sent: false, sendAt: { lte: now } } });
  for (const item of due) {
    const message = await prisma.message.create({
      data: { chatId: item.chatId, senderId: item.senderId, content: item.content, contentType: 'TEXT' }
    });
    await prisma.scheduledMessage.update({ where: { id: item.id }, data: { sent: true } });
    io.to(item.chatId).emit('new_message', message);
  }
}
