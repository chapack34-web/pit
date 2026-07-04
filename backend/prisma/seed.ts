import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('pitbot123', 10);
  const bot = await prisma.user.upsert({
    where: { phone: '+1234567890' },
    update: {},
    create: {
      phone: '+1234567890',
      name: 'PitBot',
      publicKey: 'pitbot-public-key',
      privateKeyEnc: 'pitbot-private-key-enc',
      passwordHash,
      settings: { ghostMode: false, theme: 'dark', lang: 'es' }
    }
  });

  const chat = await prisma.chat.create({
    data: {
      isGroup: false,
      name: 'Bienvenido a Pit',
      users: { create: { userId: bot.id, role: 'ADMIN' } }
    }
  });

  await prisma.message.create({
    data: {
      chatId: chat.id,
      senderId: bot.id,
      content: 'Bienvenido a Pit 🚀',
      contentType: 'TEXT'
    }
  });

  console.log('Seed completo: usuario PitBot y chat de bienvenida creados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
