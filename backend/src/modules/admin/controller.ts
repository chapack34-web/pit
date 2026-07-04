// Sistema "Panel Admin": métricas reales de la plataforma (no inventadas).
// Protegido con una clave simple de admin (ADMIN_SECRET en .env) — suficiente
// para un panel interno, no reemplaza un sistema de roles completo.
import { Router } from 'express';
import { prisma } from '../../core/database/client';

export const adminRouter = Router();

function requireAdminSecret(req: any, res: any, next: any) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'No autorizado' });
  }
  next();
}

adminRouter.use(requireAdminSecret);

adminRouter.get('/stats', async (_req, res) => {
  const [userCount, messageCount, chatCount, activeToday] = await Promise.all([
    prisma.user.count(),
    prisma.message.count(),
    prisma.chat.count(),
    prisma.user.count({ where: { lastSeen: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
  ]);

  return res.json({
    userCount,
    messageCount,
    chatCount,
    activeToday,
    timestamp: new Date().toISOString()
  });
});

adminRouter.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, phone: true, tier: true, isOnline: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 100
  });
  return res.json(users);
});

// Suspende una cuenta cambiando su tier a BANNED (se puede chequear en el middleware de auth).
adminRouter.post('/users/:id/ban', async (req, res) => {
  const user = await prisma.user.update({ where: { id: req.params.id }, data: { tier: 'BANNED' } });
  return res.json({ banned: true, user: { id: user.id, name: user.name } });
});
