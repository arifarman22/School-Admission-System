import type { ReactNode } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'error';

const tones: Record<Tone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
};

interface AlertProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function Alert({ tone = 'info', title, children, action }: AlertProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between ${tones[tone]}`}
    >
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-1' : undefined}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
