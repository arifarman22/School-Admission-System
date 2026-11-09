import { apiBaseUrl } from '../utils/config';

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  acceptStatuses?: number[];
}

export async function getJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    signal: options.signal ?? null,
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok && !options.acceptStatuses?.includes(response.status)) {
    throw new ApiError(response.status, body, `Request to ${path} failed with ${response.status}`);
  }

  return body as T;
}
