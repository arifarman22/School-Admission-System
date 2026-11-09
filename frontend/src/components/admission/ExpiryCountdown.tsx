import { useEffect, useRef } from 'react';
import { useNow } from '../../hooks/useNow';
import { formatDateTime } from '../../utils/format';

interface ExpiryCountdownProps {
  expiresAt: string;
  onElapsed?: () => void;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ExpiryCountdown({ expiresAt, onElapsed }: ExpiryCountdownProps) {
  const now = useNow(1_000);
  const remaining = new Date(expiresAt).getTime() - now;
  const elapsed = remaining <= 0;
  const notified = useRef(false);

  useEffect(() => {
    if (elapsed && !notified.current) {
      notified.current = true;
      onElapsed?.();
    }
  }, [elapsed, onElapsed]);

  const urgent = !elapsed && remaining < 60_000;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        elapsed
          ? 'border-slate-200 bg-slate-50'
          : urgent
            ? 'border-rose-200 bg-rose-50'
            : 'border-amber-200 bg-amber-50'
      }`}
    >
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        {elapsed ? 'Hold time elapsed' : 'Time left to confirm'}
      </p>
      <p
        className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
          elapsed ? 'text-slate-500' : urgent ? 'text-rose-700' : 'text-amber-800'
        }`}
        aria-live={urgent ? 'assertive' : 'off'}
        role="timer"
      >
        {formatRemaining(remaining)}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {elapsed ? 'Checking status with the server…' : `Expires ${formatDateTime(expiresAt)}`}
      </p>
    </div>
  );
}
