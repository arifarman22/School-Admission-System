import { useNow } from '../../hooks/useNow';

interface LiveStatusProps {
  updatedAt: number;
  isFetching: boolean;
  isError: boolean;
}

function describeAge(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ago`;
}

export function LiveStatus({ updatedAt, isFetching, isError }: LiveStatusProps) {
  const now = useNow();
  const age = updatedAt > 0 ? describeAge(now - updatedAt) : 'never';

  const tone = isError
    ? { dot: 'bg-rose-500', label: 'Connection lost', text: 'text-rose-700' }
    : { dot: 'bg-emerald-500', label: 'Live', text: 'text-emerald-700' };

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex size-2">
        {!isError && isFetching && (
          <span
            className={`absolute inline-flex size-full animate-ping rounded-full opacity-60 ${tone.dot}`}
          />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${tone.dot}`} />
      </span>
      <span className={`font-medium ${tone.text}`}>{tone.label}</span>
      <span className="text-slate-500">· updated {age}</span>
    </div>
  );
}
