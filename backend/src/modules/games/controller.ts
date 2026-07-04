import { Router } from 'express';
import { AuthRequest, authMiddleware } from '../auth/middleware';
import { createChessGame, makeMove } from './chess';
import { io } from '../../index';

export const gameRouter = Router();
gameRouter.use(authMiddleware);

gameRouter.post('/chess/create', async (req: AuthRequest, res) => {
  const { chatId, opponentId } = req.body;
  if (!chatId || !opponentId) return res.status(400).json({ error: 'chatId y opponentId requeridos' });
  const game = await createChessGame(chatId, req.userId!, opponentId);
  io.to(chatId).emit('game_created', game);
  return res.json(game);
});

gameRouter.post('/chess/:id/move', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { from, to, promotion } = req.body;
  try {
    const game = await makeMove(id, req.userId!, from, to, promotion);
    io.to(game.chatId).emit('game_move', game);
    return res.json(game);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

gameRouter.get('/replay/:id', async (req: AuthRequest, res) => {
  const { prisma } = await import('../../core/database/client');
  const game = await prisma.game.findUnique({ where: { id: req.params.id } });
  if (!game) return res.status(404).json({ error: 'No encontrado' });
  return res.json({ moves: game.moves });
});
