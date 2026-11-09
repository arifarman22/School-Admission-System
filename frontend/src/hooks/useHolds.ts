import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { cancelHold, confirmHold, createHold, getHold, listMyHolds } from '../api/holds';
import type { HoldStatus } from '../types/api';
import { queryKeys } from './queryKeys';
import { useStudentId } from './useStudentId';

export const HELD_REFRESH_MS = 5_000;
export const EXPIRY_RECHECK_MS = 2_000;
export const MY_HOLDS_REFRESH_MS = 15_000;

interface Expiring {
  status: HoldStatus;
  expiresAt: string;
}

export function holdRefreshInterval(holds: Expiring[] | undefined, idleMs: number | false) {
  const held = holds?.filter((h) => h.status === 'HELD') ?? [];
  if (held.length === 0) return idleMs;
  const now = Date.now();
  return held.some((h) => new Date(h.expiresAt).getTime() <= now)
    ? EXPIRY_RECHECK_MS
    : HELD_REFRESH_MS;
}

function requireStudentId(studentId: string | null): string {
  if (!studentId) {
    throw new Error('Enter your birth registration number first.');
  }
  return studentId;
}

function useInvalidateAdmissionData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.classes.all, refetchType: 'all' }),
      queryClient.invalidateQueries({ queryKey: queryKeys.holds.all, refetchType: 'all' }),
    ]);
}

function useRefreshSeatsWhenHoldEnds(status: HoldStatus | undefined) {
  const queryClient = useQueryClient();
  const previous = useRef(status);

  useEffect(() => {
    const before = previous.current;
    previous.current = status;
    if (before === 'HELD' && status !== undefined && status !== 'HELD') {
      void queryClient.invalidateQueries({ queryKey: queryKeys.classes.all, refetchType: 'all' });
    }
  }, [status, queryClient]);
}

export function useHold(holdId: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.holds.detail(holdId ?? ''),
    queryFn: ({ signal }) => getHold(holdId as string, signal),
    enabled: Boolean(holdId),
    refetchInterval: (q) => holdRefreshInterval(q.state.data ? [q.state.data] : undefined, false),
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
  useRefreshSeatsWhenHoldEnds(query.data?.status);
  return query;
}

export function useMyHolds() {
  const { studentId } = useStudentId();
  return useQuery({
    queryKey: queryKeys.holds.mine(studentId ?? ''),
    queryFn: ({ signal }) => listMyHolds(requireStudentId(studentId), signal),
    enabled: Boolean(studentId),
    refetchInterval: (q) => holdRefreshInterval(q.state.data, MY_HOLDS_REFRESH_MS),
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
}

export function useCreateHold() {
  const { studentId } = useStudentId();
  const invalidate = useInvalidateAdmissionData();
  return useMutation({
    mutationFn: (classId: number) => createHold(classId, requireStudentId(studentId)),
    onSettled: invalidate,
  });
}

export function useConfirmHold() {
  const { studentId } = useStudentId();
  const invalidate = useInvalidateAdmissionData();
  return useMutation({
    mutationFn: (holdId: string) => confirmHold(holdId, requireStudentId(studentId)),
    onSettled: invalidate,
  });
}

export function useCancelHold() {
  const { studentId } = useStudentId();
  const invalidate = useInvalidateAdmissionData();
  return useMutation({
    mutationFn: (holdId: string) => cancelHold(holdId, requireStudentId(studentId)),
    onSettled: invalidate,
  });
}
