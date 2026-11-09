type Tone = 'ok' | 'error' | 'pending';

const styles: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  error: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  pending: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

const dots: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  error: 'bg-rose-500',
  pending: 'bg-slate-400 animate-pulse',
};

interface StatusBadgeProps {
  tone: Tone;
  label: string;
}

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${styles[tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dots[tone]}`} aria-hidden="true" />
      {label}
    </span>
  );
}
