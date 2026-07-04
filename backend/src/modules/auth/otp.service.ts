import { redis } from '../../core/database/redis';

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function storeOtp(phone: string, otp: string) {
  await redis.set(`otp:${phone}`, otp, 'EX', 300);
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const stored = await redis.get(`otp:${phone}`);
  if (stored && stored === otp) {
    await redis.del(`otp:${phone}`);
    return true;
  }
  return false;
}
