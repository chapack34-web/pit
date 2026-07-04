import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../core/database/client';
import { hashPassword, comparePassword } from '../../core/crypto/hash';
import { generateKeyPair } from '../../core/crypto/kyber';
import { generateOtp, storeOtp, verifyOtp } from './otp.service';

export const authRouter = Router();

// Paso 1: solicitar OTP para registro o login
authRouter.post('/otp/request', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone requerido' });
  const otp = generateOtp();
  await storeOtp(phone, otp);
  // En producción esto se envía por un proveedor SMS real (Twilio, etc).
  // Aquí lo devolvemos en la respuesta solo si NODE_ENV=development para poder probar sin gastar SMS.
  console.log(`[OTP] ${phone} -> ${otp}`);
  return res.json({ sent: true, devOtp: process.env.NODE_ENV === 'development' ? otp : undefined });
});

// Paso 2: verificar OTP y registrar (si no existe) o loguear
authRouter.post('/otp/verify', async (req, res) => {
  const { phone, otp, name, password } = req.body;
  if (!phone || !otp || !password) return res.status(400).json({ error: 'phone, otp y password requeridos' });

  const valid = await verifyOtp(phone, otp);
  if (!valid) return res.status(401).json({ error: 'OTP inválido o expirado' });

  let user = await prisma.user.findUnique({ where: { phone } });

  if (!user) {
    if (!name) return res.status(400).json({ error: 'name requerido para registro' });
    const { publicKey, privateKey } = generateKeyPair();
    const passwordHash = await hashPassword(password);
    user = await prisma.user.create({
      data: {
        phone,
        name,
        publicKey,
        privateKeyEnc: privateKey, // en producción esto se cifra con una KDF derivada del password del usuario en el cliente
        passwordHash,
        settings: { ghostMode: false, theme: 'dark', lang: 'es' }
      }
    });
  } else {
    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
  const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '30d' });

  return res.json({
    token,
    refreshToken,
    user: { id: user.id, phone: user.phone, name: user.name, publicKey: user.publicKey }
  });
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken requerido' });
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev_secret') as { userId: string; type: string };
    if (payload.type !== 'refresh') throw new Error('invalid type');
    const token = jwt.sign({ userId: payload.userId }, process.env.JWT_SECRET || 'dev_secret', { expiresIn: '7d' });
    return res.json({ token });
  } catch {
    return res.status(401).json({ error: 'Refresh token inválido' });
  }
});
