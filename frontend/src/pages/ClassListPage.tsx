import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ClassCard } from '../components/admission/ClassCard';
import { LiveStatus } from '../components/admission/LiveStatus';
import { Alert } from '../components/common/Alert';
import { Button, ButtonLink } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';
import { useClasses } from '../hooks/useClasses';
import { useMyHolds } from '../hooks/useHolds';
import type { AdmissionClass } from '../types/api';
import { getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/format';
import { routes } from '../utils/routes';

type Filter = 'all' | 'open' | 'full';
type Sort = 'name' | 'available' | 'number';

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'full', label: 'Full' },
];

const sorters: Record<Sort, (a: AdmissionClass, b: AdmissionClass) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  available: (a, b) => b.availableSeats - a.availableSeats || a.name.localeCompare(b.name),
  number: (a, b) => a.id - b.id,
};

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
    >
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 1 0 3.4 9.83l3.13 3.14a.75.75 0 1 0 1.06-1.06l-3.13-3.14A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ClassListPage() {
  const query = useClasses({ live: true });
  const myHolds = useMyHolds();
  const { data, error, isPending, isError, isFetching, dataUpdatedAt, refetch } = query;
  const stale = isError && data !== undefined;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');

  const admission = myHolds.data?.find((h) => h.status === 'CONFIRMED');
  const term = search.trim().toLowerCase();
  const visible = useMemo(() => {
    const matches = (data ?? []).filter((c) => {
      if (filter === 'open' && c.availableSeats <= 0) return false;
      if (filter === 'full' && c.availableSeats > 0) return false;
      return (
        !term || c.name.toLowerCase().includes(term) || String(c.id) === term.replace(/^#/, '')
      );
    });
    return [...matches].sort(sorters[sort]);
  }, [data, term, filter, sort]);

  const totals = useMemo(
    () => ({
      classes: data?.length ?? 0,
      open: data?.filter((c) => c.availableSeats > 0).length ?? 0,
      seats: data?.reduce((sum, c) => sum + Math.max(0, c.availableSeats), 0) ?? 0,
    }),
    [data],
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-indigo-600 uppercase">
            Student Portal
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Classes
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Choose a class and shift, then press Apply Now. Seats go to whoever applies first, and
            the numbers below update automatically.
          </p>
        </div>
        {(data !== undefined || isError) && (
          <LiveStatus updatedAt={dataUpdatedAt} isFetching={isFetching} isError={isError} />
        )}
      </div>

      {admission && (
        <Alert tone="success" title={`Admission confirmed: ${admission.className}`}>
          A student can be admitted to only one class, so applying to other classes is closed.{' '}
          <Link
            to={routes.application(admission.holdId)}
            className="font-medium underline underline-offset-2"
          >
            View admission
          </Link>
        </Alert>
      )}

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
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile label="Classes" value={totals.classes} />
            <SummaryTile label="Open" value={totals.open} />
            <SummaryTile label="Seats left" value={totals.seats} />
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <label htmlFor="class-search" className="sr-only">
                Search classes
              </label>
              <SearchIcon />
              <input
                id="class-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by class name or number"
                className="block w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                role="group"
                aria-label="Filter classes"
                className="inline-flex rounded-lg border border-slate-300 bg-slate-50 p-0.5"
              >
                {filters.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      filter === f.value
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Sort
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-lg border border-slate-300 bg-white py-1.5 pr-8 pl-3 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                >
                  <option value="name">Name</option>
                  <option value="available">Most seats left</option>
                  <option value="number">Class number</option>
                </select>
              </label>
            </div>
          </div>

          <p className="text-sm text-slate-500" aria-live="polite">
            Showing {visible.length} of {data.length} {data.length === 1 ? 'class' : 'classes'}
          </p>

          {visible.length === 0 ? (
            <Card>
              <EmptyState
                title="No matching classes"
                description={
                  term
                    ? `No class matches “${search.trim()}”. Try another name or number.`
                    : 'No classes match this filter.'
                }
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setFilter('all');
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            </Card>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Classes">
              {visible.map((admissionClass) => (
                <li key={admissionClass.id}>
                  <ClassCard admissionClass={admissionClass} stale={stale} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
