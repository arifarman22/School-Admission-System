import { CreateClassForm } from '../components/admission/CreateClassForm';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';

export function CreateClassPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Create class"
        description="Add a class and set its total number of seats. Students can apply as soon as it is created."
      />
      <Card className="max-w-2xl p-5 sm:p-6">
        <CreateClassForm />
      </Card>
    </section>
  );
}
