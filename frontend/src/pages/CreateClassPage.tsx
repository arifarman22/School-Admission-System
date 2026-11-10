import { Link } from 'react-router';
import { CreateClassForm } from '../components/admission/CreateClassForm';
import { ButtonLink } from '../components/common/Button';
import { routes } from '../utils/routes';

export function CreateClassPage() {
  return (
    <section className="space-y-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex items-center gap-2 text-sm text-slate-500">
          <li>Admin</li>
          <li aria-hidden="true">/</li>
          <li>
            <Link to={routes.classes} className="hover:text-slate-700 hover:underline">
              Classes
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-medium text-slate-700">
            New class
          </li>
        </ol>
      </nav>

      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create class</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Add a class section and set how many seats it has. Students can apply as soon as it is
            created.
          </p>
        </div>
        <ButtonLink to={routes.classes} variant="secondary" className="shrink-0">
          Back to classes
        </ButtonLink>
      </div>

      <CreateClassForm />
    </section>
  );
}
