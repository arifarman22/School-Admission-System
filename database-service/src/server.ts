import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createPrismaClient } from './db/prisma.js';
import { PrismaClassService } from './services/class.service.js';
import { PrismaHoldService } from './services/hold.service.js';
import { PrismaDatabaseProbe } from './services/prisma-probe.js';

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);
const prisma = createPrismaClient(config.DATABASE_URL, { poolMax: config.DATABASE_POOL_MAX });

let shuttingDown = false;

const app = createApp({
  internalApiKey: config.INTERNAL_API_KEY,
  logger,
  databaseProbe: new PrismaDatabaseProbe(prisma),
  classService: new PrismaClassService(prisma),
  holdService: new PrismaHoldService(prisma, {
    holdDurationSeconds: config.HOLD_DURATION_SECONDS,
    lockTimeoutMs: config.RESERVATION_LOCK_TIMEOUT_MS,
    transactionTimeoutMs: config.RESERVATION_TX_TIMEOUT_MS,
  }),
  isShuttingDown: () => shuttingDown,
});

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(
    {
      host: config.HOST,
      port: config.PORT,
      holdDurationSeconds: config.HOLD_DURATION_SECONDS,
      poolMax: config.DATABASE_POOL_MAX,
    },
    'Database service listening',
  );
});

server.on('error', (err) => {
  logger.fatal({ err }, 'HTTP server error');
  process.exit(1);
});

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ reason, timeoutMs: config.SHUTDOWN_TIMEOUT_MS }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, closing remaining connections');
    server.closeAllConnections();
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });

  try {
    await prisma.$disconnect();
  } catch (err) {
    logger.error({ err }, 'Failed to disconnect Prisma');
  }

  logger.info('Shutdown complete');
  process.exit(exitCode);
}

process.on('SIGINT', () => void shutdown('SIGINT', 0));
process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException', 1);
});
