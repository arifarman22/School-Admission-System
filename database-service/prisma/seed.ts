import 'dotenv/config';
import { createPrismaClient } from '../src/db/prisma.js';

const CLASSES = [
  { name: 'Class 1', totalSeats: 30 },
  { name: 'Class 2', totalSeats: 25 },
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = createPrismaClient(url);
  try {
    for (const admissionClass of CLASSES) {
      const row = await prisma.admissionClass.upsert({
        where: { name: admissionClass.name },
        create: admissionClass,
        update: {},
      });
      console.log(`Seeded class "${row.name}" (${row.totalSeats} seats) id=${row.id}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
