import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { registerPresenceHandlers } from '../../modules/chat/presence';
import { registerCallHandlers } from '../../modules/calls/signaling';

export function registerSocketHandlers(io: Server) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth requerida'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') as { userId: string };
      (socket as any).userId = payload.userId;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = (socket as any).userId;
    console.log(`Usuario conectado: ${userId}`);

    socket.on('join_room', (chatId: string) => {
      socket.join(chatId);
    });

    socket.on('leave_room', (chatId: string) => {
      socket.leave(chatId);
    });

    registerPresenceHandlers(io, socket);
    registerCallHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${userId}`);
    });
  });
}
