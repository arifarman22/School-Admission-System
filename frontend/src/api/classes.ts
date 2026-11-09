import type { AdmissionClass, ClassCreated, CreateClassRequest } from '../types/api';
import { apiRequest } from './client';

export function listClasses(signal?: AbortSignal): Promise<AdmissionClass[]> {
  return apiRequest<AdmissionClass[]>('/classes', signal ? { signal } : {});
}

export function getClass(classId: string, signal?: AbortSignal): Promise<AdmissionClass> {
  return apiRequest<AdmissionClass>(
    `/classes/${encodeURIComponent(classId)}`,
    signal ? { signal } : {},
  );
}

export function createClass(request: CreateClassRequest): Promise<ClassCreated> {
  return apiRequest<ClassCreated>('/classes', { method: 'POST', body: request });
}
