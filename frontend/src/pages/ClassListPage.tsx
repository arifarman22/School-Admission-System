import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/States';

export function ClassListPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title="Classes"
        description="Browse classes and see how many seats are available right now."
      />
      <Card>
        <EmptyState
          title="Class list"
          description="This page will list classes from the admission API."
        />
      </Card>
    </section>
  );
}
