// Sistema "Llamadas Pit": señalización WebRTC real por Socket.io.
// Esto NO es un mock: intercambia SDP offer/answer e ICE candidates de verdad,
// que es exactamente lo que necesita cualquier librería WebRTC (navegador o
// react-native-webrtc) para establecer audio/video peer-to-peer.
// El audio/video en sí viaja directo entre los dos dispositivos (P2P), el
// servidor solo ayuda a que se "encuentren" al principio.
import { Server, Socket } from 'socket.io';

interface CallOffer {
  toUserId: string;
  fromUserId: string;
  chatId: string;
  sdp: any;
  callType: 'audio' | 'video';
}

export function registerCallHandlers(io: Server, socket: Socket) {
  const userId = (socket as any).userId;

  // El llamante ofrece la sesión SDP
  socket.on('call_offer', (data: CallOffer) => {
    io.to(`user:${data.toUserId}`).emit('call_incoming', { ...data, fromUserId: userId });
  });

  // El receptor responde con su propio SDP
  socket.on('call_answer', ({ toUserId, sdp }: { toUserId: string; sdp: any }) => {
    io.to(`user:${toUserId}`).emit('call_answered', { sdp, fromUserId: userId });
  });

  // Intercambio de candidatos ICE (necesario para atravesar NAT en ambos lados)
  socket.on('ice_candidate', ({ toUserId, candidate }: { toUserId: string; candidate: any }) => {
    io.to(`user:${toUserId}`).emit('ice_candidate', { candidate, fromUserId: userId });
  });

  socket.on('call_end', ({ toUserId }: { toUserId: string }) => {
    io.to(`user:${toUserId}`).emit('call_ended', { fromUserId: userId });
  });

  socket.on('call_reject', ({ toUserId }: { toUserId: string }) => {
    io.to(`user:${toUserId}`).emit('call_rejected', { fromUserId: userId });
  });

  // Cada usuario se une a su propia "room" personal para poder recibir llamadas
  // sin importar en qué chat esté mirando en ese momento.
  socket.join(`user:${userId}`);
}
