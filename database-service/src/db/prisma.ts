import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export interface PrismaClientOptions {
  poolMax?: number;
}

export function createPrismaClient(
  databaseUrl: string,
  { poolMax = 10 }: PrismaClientOptions = {},
): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    max: poolMax,
    connectionTimeoutMillis: 10_000,
    enableChannelBinding: true,
  });
  return new PrismaClient({ adapter });
}

export type { PrismaClient };
