import type { PrismaClient } from '../db/prisma.js';
import type { DatabaseProbe } from '../types/health.js';

export class PrismaDatabaseProbe implements DatabaseProbe {
  constructor(private readonly prisma: PrismaClient) {}

  async ping(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
