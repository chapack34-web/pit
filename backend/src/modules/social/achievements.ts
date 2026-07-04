// Sistema "Logros y Rachas": calcula de verdad si el usuario mandó mensajes hoy
// y ayer para mantener la racha, y desbloquea insignias reales según hitos.
import { Router } from 'express';
import { prisma } from '../../core/database/client';
import { AuthRequest, authMiddleware } from '../auth/middleware';

export const achievementRouter = Router();
achievementRouter.use(authMiddleware);

const BADGES: Record<string, { label: string; check: (streak: number, totalMessages: number) => boolean }> = {
  STREAK_3: { label: '🔥 3 días seguidos', check: (s) => s >= 3 },
  STREAK_7: { label: '🔥🔥 Una semana seguida', check: (s) => s >= 7 },
  STREAK_30: { label: '🏆 Un mes seguido', check: (s) => s >= 30 },
  CHATTY_100: { label: '💬 100 mensajes enviados', check: (_s, t) => t >= 100 },
  CHATTY_1000: { label: '💬💬 1000 mensajes enviados', check: (_s, t) => t >= 1000 }
};

// Se llama internamente (o desde un endpoint) cada vez que el usuario manda un mensaje.
export async function registerActivity(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = await prisma.userStreak.findUnique({ where: { userId } });
  if (!streak) {
    streak = await prisma.userStreak.create({
      data: { userId, currentStreak: 1, longestStreak: 1, lastActiveDay: today }
    });
  } else {
    const lastDay = streak.lastActiveDay ? new Date(streak.lastActiveDay) : null;
    const diffDays = lastDay ? Math.floor((today.getTime() - lastDay.getTime()) / 86400000) : null;

    if (diffDays === 0) {
      // ya contó hoy, no hace nada
    } else if (diffDays === 1) {
      const newStreak = streak.currentStreak + 1;
      streak = await prisma.userStreak.update({
        where: { userId },
        data: { currentStreak: newStreak, longestStreak: Math.max(newStreak, streak.longestStreak), lastActiveDay: today }
      });
    } else {
      streak = await prisma.userStreak.update({
        where: { userId },
        data: { currentStreak: 1, lastActiveDay: today }
      });
    }
  }

  const totalMessages = await prisma.message.count({ where: { senderId: userId } });

  const unlocked: string[] = [];
  for (const [code, badge] of Object.entries(BADGES)) {
    if (badge.check(streak.currentStreak, totalMessages)) {
      const result = await prisma.achievement.upsert({
        where: { userId_code: { userId, code } },
        update: {},
        create: { userId, code }
      }).catch(() => null);
      if (result) unlocked.push(code);
    }
  }
  return { streak: streak.currentStreak, unlocked };
}

achievementRouter.get('/me', async (req: AuthRequest, res) => {
  const streak = await prisma.userStreak.findUnique({ where: { userId: req.userId! } });
  const achievements = await prisma.achievement.findMany({ where: { userId: req.userId! } });
  return res.json({
    currentStreak: streak?.currentStreak || 0,
    longestStreak: streak?.longestStreak || 0,
    achievements: achievements.map((a: any) => ({ code: a.code, label: BADGES[a.code]?.label, unlockedAt: a.unlockedAt }))
  });
});
