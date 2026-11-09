import type { AdmissionClass, ClassCreated, CreateClassRequest } from '../types/api';
import { apiRequest } from './client';

export function listClasses(signal?: AbortSignal): Promise<AdmissionClass[]> {
  return apiRequest<AdmissionClass[]>('/classes', signal ? { signal } : {});
}

export function getClass(classId: number, signal?: AbortSignal): Promise<AdmissionClass> {
  return apiRequest<AdmissionClass>(`/classes/${classId}`, signal ? { signal } : {});
}

export function createClass(request: CreateClassRequest): Promise<ClassCreated> {
  return apiRequest<ClassCreated>('/classes', { method: 'POST', body: request });
}
