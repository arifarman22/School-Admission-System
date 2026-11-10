import 'dotenv/config';
import { createPrismaClient } from '../src/db/prisma.js';

const CLASSES = [
  { name: 'Class 1', section: 'A', totalSeats: 30 },
  { name: 'Class 1', section: 'B', totalSeats: 30 },
  { name: 'Class 2', section: 'A', totalSeats: 25 },
] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }

  const prisma = createPrismaClient(url);
  try {
    for (const admissionClass of CLASSES) {
      const existing = await prisma.admissionClass.findFirst({
        where: {
          name: { equals: admissionClass.name, mode: 'insensitive' },
          section: { equals: admissionClass.section, mode: 'insensitive' },
        },
      });
      const row = existing ?? (await prisma.admissionClass.create({ data: admissionClass }));
      console.log(
        `Seeded class "${row.name}" section ${row.section} (${row.totalSeats} seats) id=${row.id}`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
