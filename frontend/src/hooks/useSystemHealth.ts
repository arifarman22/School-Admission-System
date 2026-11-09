import { useCallback, useEffect, useState } from 'react';
import { fetchReadiness } from '../api/health';
import type { ApiHealthResponse } from '../types/health';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: ApiHealthResponse }
  | { kind: 'unreachable'; message: string };

export function useSystemHealth() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    fetchReadiness(controller.signal)
      .then((data) => setState({ kind: 'loaded', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : 'Unknown error';
        setState({ kind: 'unreachable', message });
      });

    return () => controller.abort();
  }, [attempt]);

  const refresh = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, refresh };
}
