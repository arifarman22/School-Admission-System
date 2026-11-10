import { useCallback, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { ApplicationProgress } from '../components/admission/ApplicationProgress';
import { ExpiryCountdown } from '../components/admission/ExpiryCountdown';
import { HoldStatusBadge } from '../components/admission/HoldStatusBadge';
import { RequireStudentId } from '../components/admission/RequireStudentId';
import { Alert } from '../components/common/Alert';
import { Button, ButtonLink } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { PageHeader } from '../components/common/PageHeader';
import { ErrorState, LoadingState } from '../components/common/States';
import { useClass } from '../hooks/useClasses';
import { useCancelHold, useConfirmHold, useHold, useMyHolds } from '../hooks/useHolds';
import type { Hold } from '../types/api';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/format';
import { routes } from '../utils/routes';

type Outcome = { tone: 'success' | 'error' | 'warning'; title: string; message: string } | null;

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-sm break-all text-slate-900 sm:col-span-2">{children}</dd>
    </div>
  );
}

function statusExplanation(status: Hold['status']): string {
  switch (status) {
    case 'HELD':
      return 'A seat is reserved for you. Confirm your admission before the hold expires.';
    case 'CONFIRMED':
      return 'Your admission is confirmed. No further action is needed.';
    case 'EXPIRED':
      return 'The hold expired before it was confirmed, and the seat was released.';
    case 'CANCELLED':
      return 'You cancelled this application and the seat was released.';
  }
}

interface HoldDetailsProps {
  hold: Hold;
  isFetching: boolean;
  updatedAt: number;
  refetch: () => Promise<unknown>;
}

function HoldDetails({ hold, isFetching, updatedAt, refetch }: HoldDetailsProps) {
  const classQuery = useClass(hold.classId);
  const myHolds = useMyHolds();
  const confirm = useConfirmHold();
  const cancel = useCancelHold();
  const [askCancel, setAskCancel] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [elapsedFor, setElapsedFor] = useState<string | null>(null);

  const ownsHold = myHolds.data ? myHolds.data.some((h) => h.holdId === hold.holdId) : null;
  const busy = confirm.isPending || cancel.isPending;
  const actionable = hold.status === 'HELD' && ownsHold !== false;
  const admittedElsewhere = myHolds.data?.find(
    (h) => h.status === 'CONFIRMED' && h.holdId !== hold.holdId,
  );
  const confirmBlocked = hold.status === 'HELD' && admittedElsewhere !== undefined;
  const awaitingExpiry = hold.status === 'HELD' && elapsedFor === hold.expiresAt;

  const onElapsed = useCallback(() => {
    setElapsedFor(hold.expiresAt);
    void refetch();
  }, [hold.expiresAt, refetch]);

  const reportError = (title: string, error: unknown) => {
    const expired = error instanceof ApiError && error.code === 'HOLD_EXPIRED';
    setOutcome({ tone: expired ? 'warning' : 'error', title, message: getErrorMessage(error) });
  };

  const onConfirm = () => {
    if (!actionable || awaitingExpiry || confirmBlocked || busy) return;
    setOutcome(null);
    confirm.mutate(hold.holdId, {
      onSuccess: (result) =>
        setOutcome({
          tone: 'success',
          title: `Admission ${result.status}`,
          message: 'Your seat is secured. You can view this admission in My applications.',
        }),
      onError: (error) => reportError('Could not confirm admission', error),
    });
  };

  const onCancel = () => {
    if (!actionable || busy) return;
    setOutcome(null);
    cancel.mutate(hold.holdId, {
      onSuccess: () => {
        setAskCancel(false);
        setOutcome({
          tone: 'success',
          title: 'Application CANCELLED',
          message: 'Your seat was released so another student can take it.',
        });
      },
      onError: (error) => {
        setAskCancel(false);
        reportError('Could not cancel application', error);
      },
    });
  };

  const className = classQuery.data?.name;

  return (
    <div className="space-y-6">
      {outcome && (
        <Alert tone={outcome.tone} title={outcome.title}>
          {outcome.message}
        </Alert>
      )}

      {confirmBlocked && (
        <Alert tone="warning" title={`Already admitted to ${admittedElsewhere!.className}`}>
          A student can be admitted to only one class, so this application cannot be confirmed.
          Cancel it to give the seat to another student.
        </Alert>
      )}

      {ownsHold === false && (
        <Alert tone="warning" title="Not your application">
          This application is not linked to the student ID entered above, so it cannot be confirmed
          or cancelled from here.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-5 sm:p-6 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {className ?? (classQuery.isError ? 'Class unavailable' : 'Loading class…')}
            </h2>
            <HoldStatusBadge status={hold.status} />
          </div>
          <p className="mt-2 text-sm text-slate-600">{statusExplanation(hold.status)}</p>

          <div className="mt-5">
            <ApplicationProgress status={hold.status} />
          </div>

          <dl className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            <DetailRow label="Status">
              <span className="font-semibold">{hold.status}</span>
            </DetailRow>
            <DetailRow label="Class">{className ?? `Class #${hold.classId}`}</DetailRow>
            <DetailRow label="Section">{classQuery.data?.section ?? '—'}</DetailRow>
            <DetailRow label="Class number">#{hold.classId}</DetailRow>
            <DetailRow label="Seats available">
              {classQuery.data
                ? `${classQuery.data.availableSeats} of ${classQuery.data.totalSeats}`
                : '—'}
            </DetailRow>
            <DetailRow label="Hold ID">
              <span className="font-mono text-xs">{hold.holdId}</span>
            </DetailRow>
            <DetailRow label={hold.status === 'HELD' ? 'Expires' : 'Hold expiry'}>
              {formatDateTime(hold.expiresAt)}
            </DetailRow>
          </dl>
        </Card>

        <Card className="flex flex-col gap-4 p-5 sm:p-6">
          {hold.status === 'HELD' ? (
            <ExpiryCountdown
              key={hold.expiresAt}
              expiresAt={hold.expiresAt}
              onElapsed={onElapsed}
            />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                Final status
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{hold.status}</p>
            </div>
          )}

          {hold.status === 'HELD' && ownsHold !== false && !confirmBlocked && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
              <span className="font-semibold">Next step:</span> pay the admission fee, then press
              Confirm Admission before the timer reaches zero.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={onConfirm}
              disabled={!actionable || awaitingExpiry || confirmBlocked || busy}
              loading={confirm.isPending}
            >
              {hold.status === 'CONFIRMED'
                ? 'Admission confirmed'
                : awaitingExpiry
                  ? 'Checking hold status…'
                  : 'Confirm Admission'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setAskCancel(true)}
              disabled={!actionable || awaitingExpiry || busy}
            >
              Cancel Application
            </Button>
          </div>

          <p className="text-xs text-slate-500">
            Status is checked with the server{' '}
            {isFetching ? 'now…' : `at ${formatDateTime(new Date(updatedAt).toISOString())}`}.
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <ButtonLink to={routes.myApplications} variant="secondary" size="sm">
          My applications
        </ButtonLink>
        <ButtonLink to={routes.classes} variant="ghost" size="sm">
          Browse classes
        </ButtonLink>
      </div>

      <ConfirmDialog
        open={askCancel}
        title="Cancel this application?"
        confirmLabel="Yes, cancel application"
        tone="danger"
        busy={cancel.isPending}
        onConfirm={onCancel}
        onClose={() => setAskCancel(false)}
      >
        Your held seat in {className ?? 'this class'} will be released immediately and offered to
        other students. This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

export function AdmissionPage() {
  const { holdId } = useParams<{ holdId: string }>();
  const holdQuery = useHold(holdId);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Student Portal"
        title="Admission details"
        description="Follow your application here. The status always comes straight from the school’s admission system."
      />
      <RequireStudentId>
        {holdQuery.isPending ? (
          <Card>
            <LoadingState label="Loading application…" />
          </Card>
        ) : holdQuery.isError && !holdQuery.data ? (
          <Card>
            <ErrorState
              error={holdQuery.error}
              title={
                holdQuery.error instanceof ApiError && holdQuery.error.status === 404
                  ? 'Application not found'
                  : 'Could not load application'
              }
              onRetry={() => void holdQuery.refetch()}
              retrying={holdQuery.isFetching}
            />
            <p className="pb-8 text-center text-sm">
              <Link to={routes.myApplications} className="text-indigo-600 underline">
                Go to my applications
              </Link>
            </p>
          </Card>
        ) : (
          <>
            {holdQuery.isError && (
              <Alert
                tone="warning"
                title={holdQuery.isFetching ? 'Reconnecting…' : 'Could not refresh status'}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void holdQuery.refetch()}
                    loading={holdQuery.isFetching}
                  >
                    Retry now
                  </Button>
                }
              >
                {getErrorMessage(holdQuery.error)} The status below may be out of date. Do not rely
                on the timer alone: your hold is valid only while the server reports HELD.
              </Alert>
            )}
            <HoldDetails
              hold={holdQuery.data!}
              isFetching={holdQuery.isFetching}
              updatedAt={holdQuery.dataUpdatedAt}
              refetch={holdQuery.refetch}
            />
          </>
        )}
      </RequireStudentId>
    </section>
  );
}
