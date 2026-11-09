import type { Hold, HoldConfirmed, HoldCreated, StudentHold } from '../types/api';
import { apiRequest } from './client';

export function createHold(classId: number, studentId: string): Promise<HoldCreated> {
  return apiRequest<HoldCreated>(`/classes/${classId}/holds`, {
    method: 'POST',
    studentId,
  });
}

export function getHold(holdId: string, signal?: AbortSignal): Promise<Hold> {
  return apiRequest<Hold>(`/holds/${encodeURIComponent(holdId)}`, signal ? { signal } : {});
}

export function confirmHold(holdId: string, studentId: string): Promise<HoldConfirmed> {
  return apiRequest<HoldConfirmed>(`/holds/${encodeURIComponent(holdId)}/confirm`, {
    method: 'POST',
    studentId,
  });
}

export function cancelHold(holdId: string, studentId: string): Promise<void> {
  return apiRequest<void>(`/holds/${encodeURIComponent(holdId)}`, {
    method: 'DELETE',
    studentId,
  });
}

export function listMyHolds(studentId: string, signal?: AbortSignal): Promise<StudentHold[]> {
  return apiRequest<StudentHold[]>('/me/holds', signal ? { studentId, signal } : { studentId });
}
