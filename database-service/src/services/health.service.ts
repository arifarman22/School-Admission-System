import type { Logger } from 'pino';
import type { DatabaseProbe, HealthResponse } from '../types/health.js';

export class HealthService {
  constructor(
    private readonly db: DatabaseProbe,
    private readonly logger: Logger,
    private readonly isShuttingDown: () => boolean = () => false,
  ) {}

  liveness(): HealthResponse {
    return {
      status: 'ok',
      service: 'database-service',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async readiness(): Promise<HealthResponse> {
    if (this.isShuttingDown()) {
      return { ...this.liveness(), status: 'error', shuttingDown: true };
    }

    const started = performance.now();
    try {
      await this.db.ping();
      return {
        ...this.liveness(),
        checks: {
          database: { status: 'ok', latencyMs: Math.round(performance.now() - started) },
        },
      };
    } catch (err) {
      this.logger.warn({ err }, 'Database readiness check failed');
      return {
        ...this.liveness(),
        status: 'error',
        checks: { database: { status: 'error', error: 'Database unreachable' } },
      };
    }
  }
}
