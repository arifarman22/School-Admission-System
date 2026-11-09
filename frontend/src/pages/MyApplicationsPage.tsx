import { RequireStudentId } from '../components/admission/RequireStudentId';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/States';

export function MyApplicationsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title="My applications"
        description="Track your seat holds and confirmed admissions."
      />
      <RequireStudentId>
        <Card>
          <EmptyState
            title="Applications"
            description="This page will list your holds and admissions from the admission API."
          />
        </Card>
      </RequireStudentId>
    </section>
  );
}
