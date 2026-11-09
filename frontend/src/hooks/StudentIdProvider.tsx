import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  isValidStudentId,
  readStoredStudentId,
  STUDENT_ID_STORAGE_KEY,
  writeStoredStudentId,
} from '../utils/studentId';
import { StudentIdContext, type StudentIdContextValue } from './StudentIdContext';

export function StudentIdProvider({ children }: { children: ReactNode }) {
  const [studentId, setState] = useState<string | null>(readStoredStudentId);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STUDENT_ID_STORAGE_KEY || event.key === null) {
        setState(readStoredStudentId());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setStudentId = useCallback((value: string) => {
    if (!isValidStudentId(value)) {
      throw new Error('Student ID must be exactly 17 digits');
    }
    writeStoredStudentId(value);
    setState(value);
  }, []);

  const clearStudentId = useCallback(() => {
    writeStoredStudentId(null);
    setState(null);
  }, []);

  const value = useMemo<StudentIdContextValue>(
    () => ({ studentId, setStudentId, clearStudentId }),
    [studentId, setStudentId, clearStudentId],
  );

  return <StudentIdContext.Provider value={value}>{children}</StudentIdContext.Provider>;
}
