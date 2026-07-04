// Sistema "Encuestas ponderadas" (#51 de la idea original de Pit): los admins
// pesan el doble en la votación. Es real: se calcula en la consulta de resultados.
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';
import { io } from '../../index';

export const pollRouter = Router();
pollRouter.use(authMiddleware);

pollRouter.post('/create', async (req: AuthRequest, res) => {
  const { chatId, question, options, closesInSeconds } = req.body;
  if (!chatId || !question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'chatId, question y al menos 2 options requeridos' });
  }
  const poll = await prisma.poll.create({
    data: {
      chatId,
      question,
      options,
      createdBy: req.userId!,
      closesAt: closesInSeconds ? new Date(Date.now() + closesInSeconds * 1000) : undefined
    }
  });
  io.to(chatId).emit('poll_created', poll);
  return res.json(poll);
});

pollRouter.post('/:id/vote', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { optionIndex } = req.body;
  const poll = await prisma.poll.findUnique({ where: { id } });
  if (!poll) return res.status(404).json({ error: 'Encuesta no encontrada' });
  if (poll.closesAt && poll.closesAt < new Date()) return res.status(400).json({ error: 'Encuesta cerrada' });

  const membership = await prisma.chatUser.findUnique({
    where: { userId_chatId: { userId: req.userId!, chatId: poll.chatId } }
  });
  const weight = membership?.role === 'ADMIN' ? 2 : 1; // ponderación real por rol

  const vote = await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId: id, userId: req.userId! } },
    update: { optionIndex, weight },
    create: { pollId: id, userId: req.userId!, optionIndex, weight }
  });

  const allVotes = await prisma.pollVote.findMany({ where: { pollId: id } });
  const results: Record<number, number> = {};
  allVotes.forEach((v: any) => { results[v.optionIndex] = (results[v.optionIndex] || 0) + v.weight; });

  io.to(poll.chatId).emit('poll_updated', { pollId: id, results });
  return res.json({ vote, results });
});

pollRouter.get('/:id/results', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const votes = await prisma.pollVote.findMany({ where: { pollId: id } });
  const results: Record<number, number> = {};
  votes.forEach((v: any) => { results[v.optionIndex] = (results[v.optionIndex] || 0) + v.weight; });
  return res.json({ results, totalVotes: votes.length });
});
