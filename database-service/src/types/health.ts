export type HealthStatus = 'ok' | 'error';

export interface DatabaseCheck {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthResponse {
  status: HealthStatus;
  service: 'database-service';
  timestamp: string;
  uptimeSeconds: number;
  shuttingDown?: boolean;
  checks?: {
    database: DatabaseCheck;
  };
}

export interface DatabaseProbe {
  ping(): Promise<void>;
}
