export type HealthStatus = 'ok' | 'error';

export interface HealthCheckEntry {
  status: HealthStatus;
  description?: string | null;
  durationMs: number;
}

export interface ApiHealthResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
  durationMs: number;
  checks: Record<string, HealthCheckEntry>;
}
