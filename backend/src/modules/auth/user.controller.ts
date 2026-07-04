// Sistema "Perfil": editar nombre, bio, avatar y ajustes (incluye ghostMode, tema, idioma).
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const userRouter = Router();
userRouter.use(authMiddleware);

userRouter.get('/me', async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  const { passwordHash, privateKeyEnc, ...safe } = user;
  return res.json(safe);
});

userRouter.put('/me', async (req: AuthRequest, res) => {
  const { name, bio, avatarUrl, settings } = req.body;
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: {
      ...(name && { name }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(settings && { settings })
    }
  });
  const { passwordHash, privateKeyEnc, ...safe } = user;
  return res.json(safe);
});

// Búsqueda de usuarios por teléfono, para armar chats nuevos
userRouter.get('/search', async (req: AuthRequest, res) => {
  const q = String(req.query.phone || '');
  if (!q) return res.status(400).json({ error: 'phone requerido' });
  const users = await prisma.user.findMany({
    where: { phone: { contains: q } },
    select: { id: true, name: true, phone: true, avatarUrl: true, isOnline: true },
    take: 10
  });
  return res.json(users);
});
