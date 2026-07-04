// Sistema "Cuenta Verificada": marca real en BD, solo un admin puede otorgarla.
import { Router } from 'express';
import { prisma } from '../../core/database/client';

export const verificationRouter = Router();

function requireAdmin(req: any, res: any, next: any) {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'No autorizado' });
  next();
}

verificationRouter.post('/:userId/verify', requireAdmin, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { isVerified: true }
  });
  return res.json({ id: user.id, name: user.name, isVerified: user.isVerified });
});

verificationRouter.post('/:userId/unverify', requireAdmin, async (req, res) => {
  const user = await prisma.user.update({
    where: { id: req.params.userId },
    data: { isVerified: false }
  });
  return res.json({ id: user.id, name: user.name, isVerified: user.isVerified });
});
