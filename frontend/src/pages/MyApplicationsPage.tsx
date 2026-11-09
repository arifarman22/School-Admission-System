import { Link } from 'react-router';
import { HoldStatusBadge } from '../components/admission/HoldStatusBadge';
import { RequireStudentId } from '../components/admission/RequireStudentId';
import { Alert } from '../components/common/Alert';
import { ButtonLink } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { useMyHolds } from '../hooks/useHolds';
import type { StudentHold } from '../types/api';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/format';
import { routes } from '../utils/routes';

const isCurrent = (h: StudentHold) => h.status === 'HELD' || h.status === 'CONFIRMED';

function ApplicationList({ title, holds }: { title: string; holds: StudentHold[] }) {
  if (holds.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">{title}</h2>
      <Card>
        <ul className="divide-y divide-slate-100">
          {holds.map((hold) => (
            <li key={hold.holdId}>
              <Link
                to={routes.application(hold.holdId)}
                className="flex flex-col gap-2 px-5 py-4 hover:bg-slate-50 focus-visible:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                aria-label={`${hold.className}, ${hold.status}. View application details`}
              >
                <div className="min-w-0">
                  <p className="font-medium break-words text-slate-900">{hold.className}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {hold.status === 'HELD'
                      ? `Hold expires ${formatDateTime(hold.expiresAt)}`
                      : `Hold expiry ${formatDateTime(hold.expiresAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <HoldStatusBadge status={hold.status} />
                  <span className="text-sm font-medium text-indigo-600">View details →</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function Applications() {
  const query = useMyHolds();

  if (query.isPending) {
    return (
      <Card>
        <LoadingState label="Loading your applications…" />
      </Card>
    );
  }

  if (query.isError && !query.data) {
    return (
      <Card>
        <ErrorState
          error={query.error}
          title="Could not load your applications"
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </Card>
    );
  }

  const holds = query.data!;
  if (holds.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No applications yet"
          description="When you apply for a class, your seat holds and admissions appear here."
          action={
            <ButtonLink to={routes.classes} size="sm">
              Browse classes
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {query.isError && (
        <Alert tone="warning" title="Could not refresh">
          {getErrorMessage(query.error)} The list below may be out of date.
        </Alert>
      )}
      <ApplicationList title="Current" holds={holds.filter(isCurrent)} />
      <ApplicationList title="History" holds={holds.filter((h) => !isCurrent(h))} />
    </div>
  );
}

export function MyApplicationsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title="My applications"
        description="Your current seat holds and admissions, plus past applications."
      />
      <RequireStudentId>
        <Applications />
      </RequireStudentId>
    </section>
  );
}
