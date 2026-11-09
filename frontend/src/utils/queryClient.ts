import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && (!(error instanceof ApiError) || error.isRetryable),
      },
      mutations: {
        retry: false,
      },
    },
  });
}
