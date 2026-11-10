import { useId, type InputHTMLAttributes, type Ref } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  hideLabel?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({
  label,
  hint,
  error,
  hideLabel = false,
  className = '',
  id,
  ref,
  ...rest
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        className={
          hideLabel
            ? 'sr-only'
            : `block text-sm font-medium text-slate-700 ${
                rest.required ? "after:ml-0.5 after:text-rose-500 after:content-['*']" : ''
              }`
        }
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`block w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:ring-2 focus:outline-none ${
          error
            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
        } ${hideLabel ? '' : 'mt-1'}`}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${inputId}-hint`} className="mt-1 text-xs text-slate-500">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
