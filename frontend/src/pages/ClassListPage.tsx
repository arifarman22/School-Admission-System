import { ClassCard } from '../components/admission/ClassCard';
import { LiveStatus } from '../components/admission/LiveStatus';
import { Alert } from '../components/common/Alert';
import { Button, ButtonLink } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { PageHeader } from '../components/common/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { useClasses } from '../hooks/useClasses';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/format';
import { routes } from '../utils/routes';

export function ClassListPage() {
  const query = useClasses({ live: true });
  const { data, error, isPending, isError, isFetching, dataUpdatedAt, refetch } = query;
  const stale = isError && data !== undefined;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title="Classes"
        description="Seat availability updates automatically every few seconds."
        actions={
          data !== undefined || isError ? (
            <LiveStatus updatedAt={dataUpdatedAt} isFetching={isFetching} isError={isError} />
          ) : undefined
        }
      />

      {stale && (
        <Alert
          tone="warning"
          title="Showing last known availability"
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refetch()}
              loading={isFetching}
            >
              Retry now
            </Button>
          }
        >
          {getErrorMessage(error)} Seat counts below were last updated{' '}
          {formatDateTime(new Date(dataUpdatedAt).toISOString())} and may be out of date. Retrying
          automatically.
        </Alert>
      )}

      {isPending ? (
        <Card>
          <LoadingState label="Loading classes…" />
        </Card>
      ) : data === undefined ? (
        <Card>
          <ErrorState
            error={error}
            title="Could not load classes"
            onRetry={() => void refetch()}
            retrying={isFetching}
          />
        </Card>
      ) : data.length === 0 ? (
        <Card>
          <EmptyState
            title="No classes yet"
            description="Classes will appear here as soon as an administrator creates them."
            action={
              <ButtonLink to={routes.createClass} variant="secondary" size="sm">
                Create a class
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Classes">
          {data.map((admissionClass) => (
            <li key={admissionClass.id}>
              <ClassCard admissionClass={admissionClass} stale={stale} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
