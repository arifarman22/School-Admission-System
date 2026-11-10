import { useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '../../api/client';
import { useClasses, useCreateClass } from '../../hooks/useClasses';
import type { AdmissionClass, ClassCreated } from '../../types/api';
import {
  CLASS_NAME_MAX_LENGTH,
  mapServerFieldErrors,
  normalizeClassName,
  normalizeSection,
  SECTION_MAX_LENGTH,
  sectionsOf,
  suggestNextSection,
  TOTAL_SEATS_MAX,
  TOTAL_SEATS_MIN,
  validateClassForm,
  validateClassName,
  validateSection,
  validateTotalSeats,
  type ClassFormErrors,
  type ClassFormValues,
} from '../../utils/classValidation';
import { getErrorMessage } from '../../utils/errors';
import { routes } from '../../utils/routes';
import { Alert } from '../common/Alert';
import { Button, ButtonLink } from '../common/Button';
import { Card } from '../common/Card';
import { TextField } from '../common/TextField';

const EMPTY: ClassFormValues = { name: '', section: '', totalSeats: '' };
const QUICK_SECTIONS = ['A', 'B', 'C', 'D', 'E', 'F'];

function FormRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 px-5 py-5 sm:grid-cols-3 sm:gap-6 sm:px-6">
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
      <div className="space-y-3 sm:col-span-2">{children}</div>
    </div>
  );
}

function ExistingSections({
  name,
  classes,
  loading,
  failed,
}: {
  name: string;
  classes: AdmissionClass[];
  loading: boolean;
  failed: boolean;
}) {
  const normalized = normalizeClassName(name);
  const rows = classes
    .filter((c) => normalizeClassName(c.name).toLowerCase() === normalized.toLowerCase())
    .sort((a, b) => a.section.localeCompare(b.section, undefined, { numeric: true }));

  let body: ReactNode;
  if (loading) {
    body = <p className="px-5 py-4 text-sm text-slate-500">Loading existing classes…</p>;
  } else if (failed) {
    body = (
      <p className="px-5 py-4 text-sm text-slate-500">
        Existing classes could not be loaded. Duplicate sections are still rejected when you save.
      </p>
    );
  } else if (!normalized) {
    body = (
      <p className="px-5 py-4 text-sm text-slate-500">
        Enter a class name to see the sections it already has.
      </p>
    );
  } else if (rows.length === 0) {
    body = (
      <p className="px-5 py-4 text-sm text-slate-500">
        <span className="font-medium text-slate-700">{normalized}</span> has no sections yet. This
        will be its first section.
      </p>
    );
  } else {
    body = (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
            <th scope="col" className="px-5 py-2">
              Section
            </th>
            <th scope="col" className="px-5 py-2 text-right">
              Seats
            </th>
            <th scope="col" className="px-5 py-2 text-right">
              Available
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((c) => (
            <tr key={c.id}>
              <td className="px-5 py-2 font-medium text-slate-900">{c.section}</td>
              <td className="px-5 py-2 text-right text-slate-700 tabular-nums">{c.totalSeats}</td>
              <td className="px-5 py-2 text-right text-slate-700 tabular-nums">
                {c.availableSeats}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <Card>
      <section aria-labelledby="existing-sections-title">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 id="existing-sections-title" className="text-sm font-semibold text-slate-900">
            Existing sections
          </h2>
        </div>
        {body}
      </section>
    </Card>
  );
}

export function CreateClassForm() {
  const createClass = useCreateClass();
  const classesQuery = useClasses();
  const sectionInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const datalistId = useId();
  const [values, setValues] = useState<ClassFormValues>(EMPTY);
  const [errors, setErrors] = useState<ClassFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<ClassCreated | null>(null);

  const existing = useMemo(() => classesQuery.data ?? [], [classesQuery.data]);
  const classNames = useMemo(
    () => [...new Set(existing.map((c) => c.name))].sort((a, b) => a.localeCompare(b)),
    [existing],
  );
  const takenSections = sectionsOf(existing, values.name);
  const nextSection = suggestNextSection(takenSections);
  const typedSection = normalizeSection(values.section);
  const duplicateSection =
    typedSection !== '' && takenSections.includes(typedSection)
      ? `Section ${typedSection} already exists for ${normalizeClassName(values.name)}.`
      : null;
  const sectionError = errors.section ?? duplicateSection;
  const busy = createClass.isPending;

  const update = (field: keyof ClassFormValues, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    if (field === 'name' && errors.section) setErrors((e) => ({ ...e, section: undefined }));
  };

  const validateField = (field: keyof ClassFormValues) => {
    if (values[field] === '') return;
    const message =
      field === 'name'
        ? validateClassName(values.name)
        : field === 'section'
          ? validateSection(values.section, values.name, existing)
          : validateTotalSeats(values.totalSeats);
    setErrors((e) => ({ ...e, [field]: message }));
  };

  const reset = () => {
    setValues(EMPTY);
    setErrors({});
    setFormError(null);
  };

  const addAnotherSection = (from: ClassCreated) => {
    const taken = [...sectionsOf(existing, from.name), normalizeSection(from.section)];
    setValues({ name: from.name, section: suggestNextSection(taken), totalSeats: '' });
    setErrors({});
    setCreated(null);
    sectionInput.current?.focus();
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    setCreated(null);

    const result = validateClassForm(values, existing);
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
        if (error instanceof ApiError && error.code === 'CLASS_SECTION_TAKEN') {
          setErrors({
            section: `Section ${result.request.section} already exists for ${result.request.name}.`,
          });
          return;
        }
        if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
          const fieldErrors = mapServerFieldErrors(error.fieldErrors);
          if (fieldErrors.name || fieldErrors.section || fieldErrors.totalSeats) {
            setErrors(fieldErrors);
            return;
          }
        }
        setFormError(getErrorMessage(error));
      },
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {created && (
          <Alert
            tone="success"
            title="Class created"
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => addAnotherSection(created)}>
                  Add another section
                </Button>
                <ButtonLink to={routes.classes} variant="ghost" size="sm">
                  View classes
                </ButtonLink>
              </div>
            }
          >
            “{created.name}” section {created.section} is open with{' '}
            {created.totalSeats.toLocaleString()} seats.
          </Alert>
        )}

        {formError && (
          <Alert tone="error" title="Could not create class">
            {formError}
          </Alert>
        )}

        <Card>
          <form onSubmit={onSubmit} noValidate aria-busy={busy}>
            <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
              <h2 className="text-base font-semibold text-slate-900">Class details</h2>
              <p className="mt-1 text-xs text-slate-500">
                Fields marked <span className="text-rose-500">*</span> are required.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              <FormRow
                title="Class"
                description="Pick an existing class to add a section to it, or type a new one."
              >
                <TextField
                  ref={nameInput}
                  label="Class name"
                  name="name"
                  list={datalistId}
                  value={values.name}
                  onChange={(e) => update('name', e.target.value)}
                  onBlur={() => validateField('name')}
                  error={errors.name ?? null}
                  hint={`For example “Class 1”. Up to ${CLASS_NAME_MAX_LENGTH} characters.`}
                  autoComplete="off"
                  required
                  disabled={busy}
                />
                <datalist id={datalistId}>
                  {classNames.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </FormRow>

              <FormRow
                title="Section"
                description="Each section of a class is unique. Class 1 can have A, B and C, but only one A."
              >
                <TextField
                  ref={sectionInput}
                  label="Section"
                  name="section"
                  value={values.section}
                  onChange={(e) => update('section', e.target.value)}
                  onBlur={() => validateField('section')}
                  error={sectionError}
                  hint={`Letters, numbers, spaces or hyphens. Up to ${SECTION_MAX_LENGTH} characters.`}
                  autoComplete="off"
                  maxLength={SECTION_MAX_LENGTH + 10}
                  required
                  disabled={busy}
                  className="sm:max-w-xs"
                  style={{ textTransform: 'uppercase' }}
                />
                <div>
                  <p id="quick-sections-label" className="text-xs font-medium text-slate-600">
                    Quick pick
                    {nextSection && takenSections.length > 0 && (
                      <span className="font-normal text-slate-500">
                        {' '}
                        · next free section is {nextSection}
                      </span>
                    )}
                  </p>
                  <div
                    role="group"
                    aria-labelledby="quick-sections-label"
                    className="mt-1.5 flex flex-wrap gap-1.5"
                  >
                    {QUICK_SECTIONS.map((s) => {
                      const taken = takenSections.includes(s);
                      const selected = normalizeSection(values.section) === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={busy || taken}
                          aria-pressed={selected}
                          aria-label={taken ? `Section ${s} (already exists)` : `Section ${s}`}
                          title={taken ? 'Already exists' : undefined}
                          onClick={() => update('section', s)}
                          className={`size-9 rounded-md border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                            taken
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through'
                              : selected
                                ? 'border-indigo-600 bg-indigo-600 text-white'
                                : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50'
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </FormRow>

              <FormRow
                title="Capacity"
                description="Seats are counted separately for each section."
              >
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
                  disabled={busy}
                  className="sm:max-w-xs"
                />
              </FormRow>
            </div>

            <div className="flex flex-col-reverse gap-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
              <Button variant="ghost" disabled={busy} onClick={reset}>
                Reset
              </Button>
              <ButtonLink to={routes.classes} variant="secondary">
                Cancel
              </ButtonLink>
              <Button type="submit" loading={busy}>
                {busy ? 'Creating…' : 'Create class'}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <aside className="space-y-6">
        <ExistingSections
          name={values.name}
          classes={existing}
          loading={classesQuery.isPending}
          failed={classesQuery.isError && !classesQuery.data}
        />
        <Card>
          <section aria-labelledby="how-it-works-title" className="px-5 py-4">
            <h2 id="how-it-works-title" className="text-sm font-semibold text-slate-900">
              How it works
            </h2>
            <ol className="mt-3 space-y-3 text-sm text-slate-600">
              {[
                ['Name the class', 'Use the same name to group sections, for example “Class 1”.'],
                ['Choose a section', 'A, B, C… Each class and section pair can exist only once.'],
                ['Set the seats', 'Students apply to a specific section and its seats.'],
              ].map(([title, text], i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                    {i + 1}
                  </span>
                  <span>
                    <span className="block font-medium text-slate-800">{title}</span>
                    {text}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </Card>
      </aside>
    </div>
  );
}
