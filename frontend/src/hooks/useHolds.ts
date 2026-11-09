import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelHold, confirmHold, createHold, getHold, listMyHolds } from '../api/holds';
import { queryKeys } from './queryKeys';
import { useStudentId } from './useStudentId';

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
      queryClient.invalidateQueries({ queryKey: queryKeys.classes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.holds.all }),
    ]);
}

export function useHold(holdId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.holds.detail(holdId ?? ''),
    queryFn: ({ signal }) => getHold(holdId as string, signal),
    enabled: Boolean(holdId),
  });
}

export function useMyHolds() {
  const { studentId } = useStudentId();
  return useQuery({
    queryKey: queryKeys.holds.mine(studentId ?? ''),
    queryFn: ({ signal }) => listMyHolds(requireStudentId(studentId), signal),
    enabled: Boolean(studentId),
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
