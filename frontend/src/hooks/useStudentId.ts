import { useContext } from 'react';
import { StudentIdContext, type StudentIdContextValue } from './StudentIdContext';

export function useStudentId(): StudentIdContextValue {
  const context = useContext(StudentIdContext);
  if (!context) {
    throw new Error('useStudentId must be used inside <StudentIdProvider>');
  }
  return context;
}
