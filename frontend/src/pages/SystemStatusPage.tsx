import { StatusBadge } from '../components/StatusBadge';
import { useSystemHealth } from '../hooks/useSystemHealth';
import { apiBaseUrl } from '../utils/config';

export function SystemStatusPage() {
  const { state, refresh } = useSystemHealth();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">System status</h1>
        <p className="mt-1 text-sm text-slate-600">
          Connectivity from the browser through the API to the database service.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <p className="font-medium">Public API</p>
            <p className="text-xs text-slate-500">{apiBaseUrl}</p>
          </div>
          {state.kind === 'loading' && <StatusBadge tone="pending" label="Checking" />}
          {state.kind === 'unreachable' && <StatusBadge tone="error" label="Unreachable" />}
          {state.kind === 'loaded' && <StatusBadge tone="ok" label="Online" />}
        </div>

        {state.kind === 'loaded' &&
          Object.entries(state.data.checks).map(([name, check]) => (
            <div
              key={name}
              className="flex items-center justify-between border-b border-slate-100 px-5 py-4 last:border-b-0"
            >
              <div>
                <p className="font-medium">
                  {name === 'databaseService' ? 'Database service' : name}
                </p>
                {check.description && <p className="text-xs text-slate-500">{check.description}</p>}
              </div>
              <StatusBadge
                tone={check.status}
                label={check.status === 'ok' ? 'Ready' : 'Not ready'}
              />
            </div>
          ))}

        {state.kind === 'unreachable' && (
          <p className="px-5 py-4 text-sm text-rose-700">{state.message}</p>
        )}
      </div>

      <button
        type="button"
        onClick={refresh}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        Re-check
      </button>
    </section>
  );
}
