// Sistema #1 "Tornado": entrega garantizada de mensajes.
// Orden de intento: Socket.io directo (lo maneja el cliente) -> REST (controller.ts)
// -> si la escritura en BD falla, se encola en Redis y un worker reintenta.
import { redis } from '../../core/database/redis';
import { prisma } from '../../core/database/client';

const QUEUE_KEY = 'retry_queue';

export interface PendingMessage {
  chatId: string;
  senderId: string;
  content: string;
  contentType?: string;
  metadata?: any;
  replyToId?: string;
}

export async function queueRetry(msg: PendingMessage) {
  await redis.lpush(QUEUE_KEY, JSON.stringify(msg));
}

export async function processRetryQueue() {
  const raw = await redis.rpop(QUEUE_KEY);
  if (!raw) return null;
  const msg: PendingMessage = JSON.parse(raw);
  try {
    return await prisma.message.create({
      data: {
        chatId: msg.chatId,
        senderId: msg.senderId,
        content: msg.content,
        contentType: msg.contentType || 'TEXT',
        metadata: msg.metadata,
        replyToId: msg.replyToId
      }
    });
  } catch {
    // Si sigue fallando, se re-encola al final para no bloquear el resto de la cola.
    await redis.lpush(QUEUE_KEY, raw);
    return null;
  }
}
