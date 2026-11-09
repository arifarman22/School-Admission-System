import type { HoldStatus } from '../../types/api';

type StepState = 'done' | 'current' | 'failed' | 'todo';

function stepsFor(status: HoldStatus): { label: string; state: StepState }[] {
  switch (status) {
    case 'HELD':
      return [
        { label: 'Applied', state: 'done' },
        { label: 'Seat held', state: 'current' },
        { label: 'Admission confirmed', state: 'todo' },
      ];
    case 'CONFIRMED':
      return [
        { label: 'Applied', state: 'done' },
        { label: 'Seat held', state: 'done' },
        { label: 'Admission confirmed', state: 'done' },
      ];
    case 'EXPIRED':
      return [
        { label: 'Applied', state: 'done' },
        { label: 'Hold expired', state: 'failed' },
        { label: 'Admission confirmed', state: 'todo' },
      ];
    case 'CANCELLED':
      return [
        { label: 'Applied', state: 'done' },
        { label: 'Cancelled', state: 'failed' },
        { label: 'Admission confirmed', state: 'todo' },
      ];
  }
}

const circle: Record<StepState, string> = {
  done: 'bg-emerald-600 text-white',
  current: 'bg-indigo-600 text-white ring-4 ring-indigo-100',
  failed: 'bg-rose-600 text-white',
  todo: 'bg-slate-200 text-slate-500',
};

const stateText: Record<StepState, string> = {
  done: 'completed',
  current: 'in progress',
  failed: 'not completed',
  todo: 'not started',
};

export function ApplicationProgress({ status }: { status: HoldStatus }) {
  const steps = stepsFor(status);
  return (
    <ol aria-label="Application progress" className="flex items-start">
      {steps.map((step, index) => (
        <li key={step.label} className="flex flex-1 flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span
              className={`h-0.5 flex-1 ${index === 0 ? 'invisible' : step.state === 'todo' ? 'bg-slate-200' : 'bg-emerald-500'}`}
            />
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${circle[step.state]}`}
              aria-hidden="true"
            >
              {step.state === 'done' ? '✓' : step.state === 'failed' ? '✕' : index + 1}
            </span>
            <span
              className={`h-0.5 flex-1 ${index === steps.length - 1 ? 'invisible' : steps[index + 1]!.state === 'todo' ? 'bg-slate-200' : 'bg-emerald-500'}`}
            />
          </div>
          <span className="mt-2 text-xs font-medium text-slate-700 sm:text-sm">
            {step.label}
            <span className="sr-only">: {stateText[step.state]}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
