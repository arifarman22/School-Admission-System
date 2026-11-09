import { useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../../api/client';
import { useCreateClass } from '../../hooks/useClasses';
import type { ClassCreated } from '../../types/api';
import {
  CLASS_NAME_MAX_LENGTH,
  mapServerFieldErrors,
  TOTAL_SEATS_MAX,
  TOTAL_SEATS_MIN,
  validateClassForm,
  validateClassName,
  validateTotalSeats,
  type ClassFormErrors,
  type ClassFormValues,
} from '../../utils/classValidation';
import { getErrorMessage } from '../../utils/errors';
import { routes } from '../../utils/routes';
import { Alert } from '../common/Alert';
import { Button, ButtonLink } from '../common/Button';
import { TextField } from '../common/TextField';

const EMPTY: ClassFormValues = { name: '', totalSeats: '' };

export function CreateClassForm() {
  const createClass = useCreateClass();
  const nameInput = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<ClassFormValues>(EMPTY);
  const [errors, setErrors] = useState<ClassFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<ClassCreated | null>(null);

  const update = (field: keyof ClassFormValues, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validateField = (field: keyof ClassFormValues) => {
    if (values[field] === '') return;
    const message =
      field === 'name' ? validateClassName(values.name) : validateTotalSeats(values.totalSeats);
    setErrors((e) => ({ ...e, [field]: message }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createClass.isPending) return;
    setFormError(null);
    setCreated(null);

    const result = validateClassForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    createClass.mutate(result.request, {
      onSuccess: (data) => {
        setCreated(data);
        setValues(EMPTY);
        setErrors({});
        nameInput.current?.focus();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === 'CLASS_NAME_TAKEN') {
          setErrors({ name: 'A class with this name already exists.' });
          return;
        }
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
          const fieldErrors = mapServerFieldErrors(error.fieldErrors);
          if (fieldErrors.name || fieldErrors.totalSeats) {
            setErrors(fieldErrors);
            return;
          }
        }
        setFormError(getErrorMessage(error));
      },
    });
  };

  return (
    <div className="space-y-5">
      {created && (
        <Alert
          tone="success"
          title="Class created"
          action={
            <ButtonLink to={routes.classes} variant="secondary" size="sm">
              View classes
            </ButtonLink>
          }
        >
          “{created.name}” is open with {created.totalSeats.toLocaleString()} seats.
        </Alert>
      )}

      {formError && (
        <Alert tone="error" title="Could not create class">
          {formError}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate aria-busy={createClass.isPending} className="space-y-5">
        <TextField
          ref={nameInput}
          label="Class name"
          name="name"
          value={values.name}
          onChange={(e) => update('name', e.target.value)}
          onBlur={() => validateField('name')}
          error={errors.name ?? null}
          hint={`For example “Class 6 - Morning Shift”. Up to ${CLASS_NAME_MAX_LENGTH} characters.`}
          autoComplete="off"
          required
          disabled={createClass.isPending}
        />

        <TextField
          label="Total seats"
          name="totalSeats"
          type="number"
          inputMode="numeric"
          min={TOTAL_SEATS_MIN}
          max={TOTAL_SEATS_MAX}
          step={1}
          value={values.totalSeats}
          onChange={(e) => update('totalSeats', e.target.value)}
          onBlur={() => validateField('totalSeats')}
          error={errors.totalSeats ?? null}
          hint={`A whole number from ${TOTAL_SEATS_MIN} to ${TOTAL_SEATS_MAX.toLocaleString()}.`}
          required
          disabled={createClass.isPending}
          className="sm:max-w-xs"
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <Button type="submit" loading={createClass.isPending}>
            {createClass.isPending ? 'Creating…' : 'Create class'}
          </Button>
          <Button
            variant="ghost"
            disabled={createClass.isPending}
            onClick={() => {
              setValues(EMPTY);
              setErrors({});
              setFormError(null);
            }}
          >
            Reset
          </Button>
        </div>
      </form>
    </div>
  );
}
