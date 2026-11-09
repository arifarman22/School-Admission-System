import type { AdmissionClass } from '../../types/api';
import { Card } from '../common/Card';
import { ApplyButton } from './ApplyButton';
import { SeatAvailability } from './SeatAvailability';

interface ClassCardProps {
  admissionClass: AdmissionClass;
  stale?: boolean;
}

const stats = [
  { key: 'totalSeats', label: 'Total' },
  { key: 'heldSeats', label: 'Held' },
  { key: 'confirmedSeats', label: 'Confirmed' },
  { key: 'availableSeats', label: 'Available' },
] as const;

export function ClassCard({ admissionClass, stale = false }: ClassCardProps) {
  const full = admissionClass.availableSeats <= 0;
  const headingId = `class-${admissionClass.id}-name`;

  return (
    <Card className={`flex h-full flex-col ${stale ? 'opacity-75' : ''}`}>
      <article aria-labelledby={headingId} className="flex h-full flex-col gap-5 p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="text-base font-semibold break-words text-slate-900">
            {admissionClass.name}
          </h2>
          {full ? (
            <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-600/20 ring-inset">
              Full
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20 ring-inset">
              Open
            </span>
          )}
        </div>

        <dl className="grid grid-cols-4 gap-2 text-center">
          {stats.map(({ key, label }) => (
            <div key={key} className="rounded-lg bg-slate-50 px-2 py-2">
              <dt className="text-[11px] font-medium tracking-wide text-slate-500 uppercase">
                {label}
              </dt>
              <dd
                className={`mt-0.5 text-lg font-semibold tabular-nums ${
                  key === 'availableSeats' && full ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {admissionClass[key]}
              </dd>
            </div>
          ))}
        </dl>

        <SeatAvailability seats={admissionClass} />

        <div className="mt-auto">
          <ApplyButton classId={admissionClass.id} className={admissionClass.name} full={full} />
        </div>
      </article>
    </Card>
  );
}
