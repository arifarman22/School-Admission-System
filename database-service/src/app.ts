import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { internalAuth } from './middleware/internal-auth.js';
import { adoptCallerRequestId, requestContext } from './middleware/request-context.js';
import { classesRouter } from './routes/classes.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { holdsRouter, studentsRouter } from './routes/holds.routes.js';
import type { ClassService } from './services/class.service.js';
import { HealthService } from './services/health.service.js';
import type { HoldService } from './services/hold.service.js';
import type { DatabaseProbe } from './types/health.js';

export const JSON_BODY_LIMIT = '16kb';

export interface AppDependencies {
  internalApiKey: string;
  logger: Logger;
  databaseProbe: DatabaseProbe;
  classService: ClassService;
  holdService: HoldService;
  isShuttingDown?: () => boolean;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestContext(deps.logger));
  app.use(internalAuth(deps.internalApiKey));
  app.use(adoptCallerRequestId(deps.logger));
  app.use(express.json({ limit: JSON_BODY_LIMIT, strict: true }));

  app.use(
    '/health',
    healthRouter(new HealthService(deps.databaseProbe, deps.logger, deps.isShuttingDown)),
  );
  app.use('/classes', classesRouter(deps.classService));
  app.use('/holds', holdsRouter(deps.holdService));
  app.use('/students', studentsRouter(deps.holdService));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
