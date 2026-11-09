import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState } from '../components/common/States';

export function CreateClassPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Create class"
        description="Add a class and set its total number of seats."
      />
      <Card>
        <EmptyState
          title="Create class"
          description="This page will contain the class creation form."
        />
      </Card>
    </section>
  );
}
