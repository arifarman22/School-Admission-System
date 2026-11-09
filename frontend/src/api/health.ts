import type { ApiHealthResponse } from '../types/health';
import { getJson } from './http';

export function fetchReadiness(signal?: AbortSignal): Promise<ApiHealthResponse> {
  return getJson<ApiHealthResponse>('/health/ready', {
    acceptStatuses: [503],
    ...(signal ? { signal } : {}),
  });
}
