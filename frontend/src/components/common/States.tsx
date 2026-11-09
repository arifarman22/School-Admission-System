import type { ReactNode } from 'react';
import { getErrorMessage } from '../../utils/errors';
import { Button } from './Button';
import { Spinner } from './Spinner';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500"
    >
      <Spinner className="size-5 text-indigo-600" />
      {label}
    </div>
  );
}

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
  retrying = false,
}: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-rose-100 text-lg font-bold text-rose-600">
        !
      </div>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1 max-w-md text-sm text-slate-600">{getErrorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <svg
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 7h16M4 12h16M4 17h10" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="font-semibold text-slate-900">{title}</p>
        {description && <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
