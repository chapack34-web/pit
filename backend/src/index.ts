import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { authRouter } from './modules/auth/controller';
import { qrRouter } from './modules/auth/qr.controller';
import { userRouter } from './modules/auth/user.controller';
import { deviceRouter } from './modules/auth/devices';
import { chatRouter } from './modules/chat/controller';
import { reactionRouter } from './modules/chat/reactions';
import { moderationRouter } from './modules/chat/moderation';
import { pollRouter } from './modules/chat/polls';
import { extrasRouter } from './modules/chat/extras';
import { inviteRouter } from './modules/chat/invites';
import { chatListRouter } from './modules/chat/chatList';
import { aiRouter } from './modules/ai/controller';
import { pushRouter } from './modules/notifications/push';
import { fileRouter } from './modules/files/controller';
import { adminRouter } from './modules/admin/controller';
import { contactRouter } from './modules/social/contacts';
import { statusRouter } from './modules/social/status';
import { channelRouter } from './modules/chat/channels';
import { walletRouter } from './modules/wallet/controller';
import { achievementRouter } from './modules/social/achievements';
import { focusRouter } from './modules/social/focus';
import { reportRouter } from './modules/moderation/reports';
import { verificationRouter } from './modules/moderation/verification';
import { gameRouter } from './modules/games/controller';
import { registerSocketHandlers } from './api/ws/handlers';
import { processRetryQueue } from './modules/chat/tornado';
import { sweepExpiredMessages } from './core/queue/ephemeralSweeper';
import { processScheduledMessages } from './core/queue/scheduledWorker';
import { sweepExpiredStatuses } from './core/queue/statusSweeper';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('web-client')); // sirve el cliente web en la raíz del dominio

const server = http.createServer(app);
export const io = new Server(server, { cors: { origin: '*' } });

app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRouter);
app.use('/api/auth/qr', qrRouter);
app.use('/api/user', userRouter);
app.use('/api/devices', deviceRouter);
app.use('/api/chat', chatRouter);
app.use('/api/reaction', reactionRouter);
app.use('/api/moderation', moderationRouter);
app.use('/api/poll', pollRouter);
app.use('/api/extras', extrasRouter);
app.use('/api/invite', inviteRouter);
app.use('/api/chats', chatListRouter);
app.use('/api/ai', aiRouter);
app.use('/api/push', pushRouter);
app.use('/api/files', fileRouter);
app.use('/api/admin', adminRouter);
app.use('/api/contacts', contactRouter);
app.use('/api/status', statusRouter);
app.use('/api/channels', channelRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/achievements', achievementRouter);
app.use('/api/focus', focusRouter);
app.use('/api/reports', reportRouter);
app.use('/api/verification', verificationRouter);
app.use('/api/game', gameRouter);

registerSocketHandlers(io);

// Worker del sistema Tornado: reintenta mensajes encolados cada 3 segundos.
setInterval(() => {
  processRetryQueue().catch((e) => console.error('Error procesando retry queue:', e));
}, 3000);

// Worker del sistema de Mensajes Efímeros: barre vencidos cada 10 segundos.
setInterval(() => {
  sweepExpiredMessages().catch((e) => console.error('Error en sweep de efímeros:', e));
}, 10000);

// Worker del sistema de Mensajes Programados: envía los que ya llegaron a su hora.
setInterval(() => {
  processScheduledMessages().catch((e) => console.error('Error en scheduled worker:', e));
}, 15000);

// Worker del sistema de Estados/Historias: borra los vencidos (24hs) cada 60 segundos.
setInterval(() => {
  sweepExpiredStatuses().catch((e) => console.error('Error en sweep de estados:', e));
}, 60000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Pit backend corriendo en el puerto ${PORT}`);
});
