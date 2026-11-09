import type { AdmissionClass } from '../../types/api';
import { pluralize } from '../../utils/format';

type Seats = Pick<AdmissionClass, 'totalSeats' | 'heldSeats' | 'confirmedSeats' | 'availableSeats'>;

function percent(part: number, total: number): string {
  return total > 0 ? `${Math.min(100, (part / total) * 100)}%` : '0%';
}

export function SeatAvailability({ seats }: { seats: Seats }) {
  const { totalSeats, heldSeats, confirmedSeats, availableSeats } = seats;
  const full = availableSeats <= 0;

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={full ? 'font-semibold text-rose-600' : 'font-semibold text-slate-900'}>
          {full ? 'Full' : `${pluralize(availableSeats, 'seat')} available`}
        </span>
        <span className="text-xs text-slate-500">of {totalSeats}</span>
      </div>
      <div
        className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`${confirmedSeats} confirmed, ${heldSeats} held, ${availableSeats} available of ${totalSeats} seats`}
      >
        <div className="bg-emerald-500" style={{ width: percent(confirmedSeats, totalSeats) }} />
        <div className="bg-amber-400" style={{ width: percent(heldSeats, totalSeats) }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />
          {confirmedSeats} confirmed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-400" aria-hidden="true" />
          {heldSeats} held
        </span>
      </div>
    </div>
  );
}
