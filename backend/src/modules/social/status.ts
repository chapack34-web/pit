// Sistema "Estados / Historias": contenido visible solo 24hs, con marca real
// de quién lo vio. El worker de barrido (statusSweeper.ts) borra los vencidos.
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const statusRouter = Router();
statusRouter.use(authMiddleware);

statusRouter.post('/create', async (req: AuthRequest, res) => {
  const { content, mediaUrl } = req.body;
  if (!content && !mediaUrl) return res.status(400).json({ error: 'content o mediaUrl requerido' });

  const status = await prisma.status.create({
    data: {
      userId: req.userId!,
      content: content || '',
      mediaUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });
  return res.json(status);
});

// Feed real: estados de mis contactos que todavía no vencieron.
statusRouter.get('/feed', async (req: AuthRequest, res) => {
  const contacts = await prisma.contact.findMany({ where: { ownerId: req.userId! } });
  const contactIds = contacts.map((c: any) => c.contactId);

  const statuses = await prisma.status.findMany({
    where: { userId: { in: [...contactIds, req.userId!] }, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' }
  });
  return res.json(statuses);
});

statusRouter.post('/:id/view', async (req: AuthRequest, res) => {
  const status = await prisma.status.findUnique({ where: { id: req.params.id } });
  if (!status) return res.status(404).json({ error: 'No encontrado' });

  const viewedBy: string[] = Array.isArray(status.viewedBy) ? (status.viewedBy as string[]) : [];
  if (!viewedBy.includes(req.userId!)) viewedBy.push(req.userId!);

  await prisma.status.update({ where: { id: req.params.id }, data: { viewedBy } });
  return res.json({ viewedBy });
});
