import { useParams } from 'react-router';
import { RequireStudentId } from '../components/admission/RequireStudentId';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/States';

export function AdmissionPage() {
  const { classId } = useParams<{ classId: string }>();

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title="Apply for a seat"
        description="Hold a seat in this class, then confirm your admission before the hold expires."
      />
      <RequireStudentId>
        <Card>
          <EmptyState
            title="Admission"
            description={`This page will let you hold and confirm a seat in class ${classId ?? ''}.`}
          />
        </Card>
      </RequireStudentId>
    </section>
  );
}
