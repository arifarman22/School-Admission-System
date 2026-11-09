import type { ReactNode } from 'react';
import { useStudentId } from '../../hooks/useStudentId';
import { STUDENT_ID_LENGTH } from '../../utils/studentId';
import { Card } from '../common/Card';
import { EmptyState } from '../common/States';

export function RequireStudentId({ children }: { children: ReactNode }) {
  const { studentId } = useStudentId();

  if (!studentId) {
    return (
      <Card>
        <EmptyState
          title="Student identity required"
          description={`Enter your ${STUDENT_ID_LENGTH}-digit birth registration number in the bar at the top of the page to continue.`}
        />
      </Card>
    );
  }

  return <>{children}</>;
}
