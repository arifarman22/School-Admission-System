import { createContext } from 'react';

export interface StudentIdContextValue {
  studentId: string | null;
  setStudentId: (studentId: string) => void;
  clearStudentId: () => void;
}

export const StudentIdContext = createContext<StudentIdContextValue | null>(null);
