import type { HoldStatus } from '../../types/api';

const styles: Record<HoldStatus, { label: string; className: string }> = {
  HELD: { label: 'Seat held', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  CONFIRMED: {
    label: 'Confirmed',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  EXPIRED: { label: 'Expired', className: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  CANCELLED: { label: 'Cancelled', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
};

export function HoldStatusBadge({ status }: { status: HoldStatus }) {
  const { label, className } = styles[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}
