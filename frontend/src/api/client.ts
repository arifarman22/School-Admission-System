import type { ApiErrorCode, ProblemDetails } from '../types/api';
import { apiBaseUrl } from '../utils/config';

export const STUDENT_ID_HEADER = 'X-Student-Id';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly problem: ProblemDetails | null;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    problem: ProblemDetails | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.problem = problem;
  }

  get fieldErrors(): Record<string, string[]> {
    return this.problem?.errors ?? {};
  }

  get isRetryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  studentId?: string;
  signal?: AbortSignal;
}

function isProblem(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && ('title' in value || 'status' in value);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.studentId !== undefined) headers[STUDENT_ID_HEADER] = options.studentId;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? null : JSON.stringify(options.body),
      signal: options.signal ?? null,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the admission service. Check your connection.',
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text.length > 0 ? parseJson(text) : null;

  if (!response.ok) {
    const problem = isProblem(data) ? data : null;
    throw new ApiError(
      response.status,
      problem?.code ?? `HTTP_${response.status}`,
      problem?.detail ?? problem?.title ?? `Request failed with status ${response.status}`,
      problem,
    );
  }

  if (data === undefined) {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'The server returned an unreadable response.',
    );
  }

  return data as T;
}
