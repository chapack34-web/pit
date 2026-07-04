// Sistema "Reportes/Denuncias": real, con cola de revisión para admins.
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const reportRouter = Router();
reportRouter.use(authMiddleware);

reportRouter.post('/', async (req: AuthRequest, res) => {
  const { reportedId, messageId, reason } = req.body;
  if (!reportedId || !reason) return res.status(400).json({ error: 'reportedId y reason requeridos' });

  const report = await prisma.report.create({
    data: { reporterId: req.userId!, reportedId, messageId, reason }
  });
  return res.json(report);
});

// Cola de revisión para admins (protegida con ADMIN_SECRET, igual que el panel admin).
reportRouter.get('/queue', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'No autorizado' });

  const reports = await prisma.report.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(reports);
});

reportRouter.post('/:id/resolve', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (!secret || secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'No autorizado' });

  const { action } = req.body; // 'REVIEWED' | 'DISMISSED'
  const report = await prisma.report.update({
    where: { id: req.params.id },
    data: { status: action === 'REVIEWED' ? 'REVIEWED' : 'DISMISSED' }
  });
  return res.json(report);
});
