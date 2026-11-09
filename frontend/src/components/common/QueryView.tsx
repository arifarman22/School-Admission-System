import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ErrorState, LoadingState } from './States';

interface QueryViewProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loadingLabel?: string;
  errorTitle?: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
}

export function QueryView<T>({
  query,
  children,
  loadingLabel,
  errorTitle,
  isEmpty,
  empty,
}: QueryViewProps<T>) {
  if (query.isPending) {
    return <LoadingState {...(loadingLabel ? { label: loadingLabel } : {})} />;
  }

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        {...(errorTitle ? { title: errorTitle } : {})}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }

  if (isEmpty?.(query.data) && empty) {
    return <>{empty}</>;
  }

  return <>{children(query.data)}</>;
}
