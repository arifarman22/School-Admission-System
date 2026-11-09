import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClass, getClass, listClasses } from '../api/classes';
import type { CreateClassRequest } from '../types/api';
import { queryKeys } from './queryKeys';

export const CLASS_LIST_REFRESH_MS = 3_000;

export function useClasses({ live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.classes.list(),
    queryFn: ({ signal }) => listClasses(signal),
    ...(live
      ? {
          refetchInterval: CLASS_LIST_REFRESH_MS,
          refetchIntervalInBackground: false,
          refetchOnWindowFocus: 'always' as const,
          refetchOnReconnect: 'always' as const,
          retry: false,
        }
      : {}),
  });
}

export function useClass(classId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.classes.detail(classId ?? 0),
    queryFn: ({ signal }) => getClass(classId as number, signal),
    enabled: Boolean(classId),
    refetchOnWindowFocus: 'always',
  });
}

export function useCreateClass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateClassRequest) => createClass(request),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.classes.all, refetchType: 'all' }),
  });
}
