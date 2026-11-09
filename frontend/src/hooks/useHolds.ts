import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelHold, confirmHold, createHold, getHold, listMyHolds } from '../api/holds';
import { queryKeys } from './queryKeys';
import { useStudentId } from './useStudentId';

export const HELD_REFRESH_MS = 10_000;
export const MY_HOLDS_REFRESH_MS = 15_000;

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

export function useHold(holdId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.holds.detail(holdId ?? ''),
    queryFn: ({ signal }) => getHold(holdId as string, signal),
    enabled: Boolean(holdId),
    refetchInterval: (query) => (query.state.data?.status === 'HELD' ? HELD_REFRESH_MS : false),
  });
}

export function useMyHolds() {
  const { studentId } = useStudentId();
  return useQuery({
    queryKey: queryKeys.holds.mine(studentId ?? ''),
    queryFn: ({ signal }) => listMyHolds(requireStudentId(studentId), signal),
    enabled: Boolean(studentId),
    refetchInterval: MY_HOLDS_REFRESH_MS,
  });
}

export function useCreateHold() {
  const { studentId } = useStudentId();
  const invalidate = useInvalidateAdmissionData();
  return useMutation({
    mutationFn: (classId: string) => createHold(classId, requireStudentId(studentId)),
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
