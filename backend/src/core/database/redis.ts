import Redis from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export async function setPresence(userId: string, isOnline: boolean) {
  if (isOnline) {
    await redis.set(`presence:${userId}`, '1', 'EX', 60);
  } else {
    await redis.del(`presence:${userId}`);
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  const val = await redis.get(`presence:${userId}`);
  return val === '1';
}

export async function setTyping(chatId: string, userId: string) {
  await redis.set(`typing:${chatId}:${userId}`, '1', 'EX', 5);
}
