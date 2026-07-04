import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../core/database/client';

export interface AuthRequest extends Request {
  userId?: string;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token faltante' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev_secret') as { userId: string };

    // Sistema "Baneo real": si el admin te suspendió, el token deja de servir al instante.
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { tier: true } });
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
    if (user.tier === 'BANNED') return res.status(403).json({ error: 'Cuenta suspendida' });

    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

