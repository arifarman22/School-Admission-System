import { Router } from 'express';
import type { HealthService } from '../services/health.service.js';

export function healthRouter(health: HealthService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(200).json(health.liveness());
  });

  router.get('/ready', async (_req, res) => {
    const result = await health.readiness();
    res.status(result.status === 'ok' ? 200 : 503).json(result);
  });

  return router;
}
