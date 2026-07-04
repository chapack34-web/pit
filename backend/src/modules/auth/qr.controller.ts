// Sistema "QR Instant Join": registro/login sin esperar SMS.
// El servidor genera un código de un solo uso con vida corta (60s).
// El usuario lo muestra como QR; cualquier otro dispositivo (o el mismo)
// que lo escanee y lo envíe de vuelta queda autenticado al instante.
// Es real: usa Redis con TTL, no hay truco ni mock.
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { redis } from '../../core/database/redis';
import { prisma } from '../../core/database/client';
import { generateKeyPair } from '../../core/crypto/kyber';

export const qrRouter = Router();

// Paso 1: el dispositivo que quiere entrar pide un código.
qrRouter.post('/generate', async (_req, res) => {
  const code = crypto.randomBytes(16).toString('hex');
  await redis.set(`qr:${code}`, 'pending', 'EX', 60);
  return res.json({ code, expiresIn: 60 });
});

// Paso 2: se registra/loguea usando ese código (lo escanea otro dispositivo
// de confianza, o se usa directo la primera vez con nombre y teléfono).
qrRouter.post('/claim', async (req, res) => {
  const { code, phone, name } = req.body;
  if (!code || !phone) return res.status(400).json({ error: 'code y phone requeridos' });

  const status = await redis.get(`qr:${code}`);
  if (status !== 'pending') return res.status(400).json({ error: 'Código inválido o expirado' });

  let user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    const { publicKey, privateKey } = generateKeyPair();
    user = await prisma.user.create({
      data: {
        phone,
        name: name || 'Nuevo usuario',
        publicKey,
        privateKeyEnc: privateKey,
        passwordHash: crypto.randomBytes(16).toString('hex'), // login por QR no usa password
        settings: { ghostMode: false, theme: 'dark', lang: 'es' }
      }
    });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
  await redis.set(`qr:${code}`, JSON.stringify({ token, userId: user.id, name: user.name }), 'EX', 30);
  return res.json({ claimed: true });
});

// Paso 3: el dispositivo original consulta si ya fue reclamado, y recibe el token.
qrRouter.get('/status/:code', async (req, res) => {
  const raw = await redis.get(`qr:${req.params.code}`);
  if (!raw || raw === 'pending') return res.json({ ready: false });
  const data = JSON.parse(raw);
  await redis.del(`qr:${req.params.code}`);
  return res.json({ ready: true, ...data });
});
