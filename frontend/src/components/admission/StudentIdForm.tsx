import { useState, type FormEvent } from 'react';
import { useStudentId } from '../../hooks/useStudentId';
import { STUDENT_ID_INPUT_ID } from '../../utils/routes';
import {
  countStudentIdDigits,
  normalizeStudentId,
  STUDENT_ID_LENGTH,
  studentIdError,
} from '../../utils/studentId';
import { Button } from '../common/Button';

interface StudentIdFormProps {
  submitLabel: string;
  initialValue?: string;
  onSaved?: () => void;
  onCancel?: () => void;
  size?: 'lg' | 'md';
  autoFocus?: boolean;
}

export function StudentIdForm({
  submitLabel,
  initialValue = '',
  onSaved,
  onCancel,
  size = 'md',
  autoFocus = false,
}: StudentIdFormProps) {
  const { setStudentId } = useStudentId();
  const [draft, setDraft] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  const digits = countStudentIdDigits(draft);
  const complete = digits === STUDENT_ID_LENGTH && studentIdError(draft) === null;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = studentIdError(draft);
    if (validation) {
      setError(validation);
      return;
    }
    setStudentId(normalizeStudentId(draft));
    setDraft('');
    onSaved?.();
  };

  const large = size === 'lg';
  const hintId = `${STUDENT_ID_INPUT_ID}-hint`;
  const errorId = `${STUDENT_ID_INPUT_ID}-error`;

  return (
    <form onSubmit={onSubmit} noValidate className="w-full">
      <label
        htmlFor={STUDENT_ID_INPUT_ID}
        className={large ? 'block text-sm font-semibold text-slate-800' : 'sr-only'}
      >
        Birth registration number
      </label>
      <div className={`flex flex-col gap-2 sm:flex-row sm:items-start ${large ? 'mt-2' : ''}`}>
        <div className="flex-1">
          <input
            id={STUDENT_ID_INPUT_ID}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            placeholder="e.g. 2015 2691 2345 67890"
            maxLength={STUDENT_ID_LENGTH + 8}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : hintId}
            className={`block w-full rounded-xl border bg-white font-mono tracking-wider text-slate-900 shadow-sm placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:ring-2 focus:outline-none ${
              large ? 'px-4 py-3 text-lg' : 'px-3 py-2 text-sm'
            } ${
              error
                ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                : complete
                  ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200'
                  : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
            }`}
          />
          {error ? (
            <p id={errorId} role="alert" className="mt-1.5 text-sm text-rose-600">
              {error}
            </p>
          ) : (
            <p
              id={hintId}
              className={`mt-1.5 text-xs ${complete ? 'text-emerald-700' : 'text-slate-500'}`}
            >
              {complete
                ? 'All 17 digits entered.'
                : `${digits} of ${STUDENT_ID_LENGTH} digits. Spaces and dashes are fine.`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            type="submit"
            size={large ? 'lg' : 'md'}
            className={large ? 'w-full sm:w-auto' : ''}
          >
            {submitLabel}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
