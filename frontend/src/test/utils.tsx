import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { vi } from 'vitest';
import { StudentIdProvider } from '../hooks/StudentIdProvider';
import { apiBaseUrl } from '../utils/config';

export interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

export type Responder = (call: RecordedCall) => Response | Promise<Response>;

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

export function problem(
  status: number,
  code: string,
  detail = code,
  errors?: Record<string, string[]>,
) {
  return json(status, {
    title: code,
    status,
    detail,
    code,
    traceId: 'trace',
    ...(errors ? { errors } : {}),
  });
}

export function mockApi(handlers: Record<string, Responder | Responder[]>) {
  const calls: RecordedCall[] = [];
  const queues = new Map<string, Responder[]>(
    Object.entries(handlers).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (!url.href.startsWith(apiBaseUrl)) {
      throw new Error(`Request to unexpected origin: ${url.href}`);
    }
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const call: RecordedCall = { method: init?.method ?? 'GET', path: url.pathname, headers, body };
    calls.push(call);

    const queue = queues.get(`${call.method} ${call.path}`);
    if (!queue || queue.length === 0) {
      throw new Error(`Unhandled request ${call.method} ${call.path}`);
    }
    const responder = queue.length > 1 ? queue.shift()! : queue[0]!;
    return responder(call);
  });

  return { calls, fetchMock };
}

export function renderRoutes(
  routes: RouteObject[],
  {
    initialPath = routes[0]!.path ?? '/',
    studentId,
  }: { initialPath?: string; studentId?: string } = {},
) {
  if (studentId) {
    window.localStorage.setItem('school-admission.studentId', studentId);
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <StudentIdProvider>
        <RouterProvider router={router} />
      </StudentIdProvider>
    </QueryClientProvider>,
  );
  return { ...utils, router, queryClient };
}
