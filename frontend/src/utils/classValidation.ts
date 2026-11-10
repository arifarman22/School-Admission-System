import type { CreateClassRequest } from '../types/api';

export const CLASS_NAME_MAX_LENGTH = 100;
export const SECTION_MAX_LENGTH = 20;
export const TOTAL_SEATS_MIN = 1;
export const TOTAL_SEATS_MAX = 10_000;

export interface ClassFormValues {
  name: string;
  section: string;
  totalSeats: string;
}

export type ClassFormErrors = Partial<Record<keyof ClassFormValues, string>>;

export interface ExistingSection {
  name: string;
  section: string;
}

const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}]/u;
const SECTION_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;

export function normalizeClassName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeSection(section: string): string {
  return section.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function sameClassName(a: string, b: string): boolean {
  return normalizeClassName(a).toLowerCase() === normalizeClassName(b).toLowerCase();
}

export function sectionsOf(classes: readonly ExistingSection[], name: string): string[] {
  if (normalizeClassName(name) === '') return [];
  return classes
    .filter((c) => sameClassName(c.name, name))
    .map((c) => normalizeSection(c.section))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function suggestNextSection(taken: readonly string[]): string {
  const used = new Set(taken.map(normalizeSection));
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    if (!used.has(letter)) return letter;
  }
  return '';
}

export function validateClassName(raw: string): string | undefined {
  const name = normalizeClassName(raw);
  if (name.length === 0) return 'Enter a class name.';
  if (name.length > CLASS_NAME_MAX_LENGTH) {
    return `Use at most ${CLASS_NAME_MAX_LENGTH} characters (currently ${name.length}).`;
  }
  if (INVISIBLE_OR_CONTROL.test(name)) return 'Remove control or invisible characters.';
  return undefined;
}

export function validateSection(
  raw: string,
  name = '',
  existing: readonly ExistingSection[] = [],
): string | undefined {
  const section = normalizeSection(raw);
  if (section.length === 0) return 'Enter a section, for example A.';
  if (section.length > SECTION_MAX_LENGTH) {
    return `Use at most ${SECTION_MAX_LENGTH} characters (currently ${section.length}).`;
  }
  if (!SECTION_PATTERN.test(section)) return 'Use only letters, numbers, spaces and hyphens.';
  if (sectionsOf(existing, name).includes(section)) {
    return `Section ${section} already exists for ${normalizeClassName(name)}.`;
  }
  return undefined;
}

export function validateTotalSeats(raw: string): string | undefined {
  const value = raw.trim();
  if (value.length === 0) return 'Enter the total number of seats.';
  if (!/^[0-9]+$/.test(value)) return 'Use a whole number, for example 40.';
  const seats = Number(value);
  if (seats < TOTAL_SEATS_MIN) return 'A class needs at least 1 seat.';
  if (seats > TOTAL_SEATS_MAX) return `Use at most ${TOTAL_SEATS_MAX.toLocaleString()} seats.`;
  return undefined;
}

export function validateClassForm(
  values: ClassFormValues,
  existing: readonly ExistingSection[] = [],
): { ok: true; request: CreateClassRequest } | { ok: false; errors: ClassFormErrors } {
  const errors: ClassFormErrors = {};
  const nameError = validateClassName(values.name);
  const sectionError = validateSection(values.section, values.name, existing);
  const seatsError = validateTotalSeats(values.totalSeats);
  if (nameError) errors.name = nameError;
  if (sectionError) errors.section = sectionError;
  if (seatsError) errors.totalSeats = seatsError;

  if (nameError || sectionError || seatsError) return { ok: false, errors };
  return {
    ok: true,
    request: {
      name: normalizeClassName(values.name),
      section: normalizeSection(values.section),
      totalSeats: Number(values.totalSeats.trim()),
    },
  };
}

export function mapServerFieldErrors(errors: Record<string, string[]>): ClassFormErrors {
  const mapped: ClassFormErrors = {};
  for (const [key, messages] of Object.entries(errors)) {
    const field = key.replace(/^\$\.?/, '').toLowerCase();
    const message = messages[0];
    if (!message) continue;
    if (field === 'name') mapped.name = message;
    else if (field === 'section') mapped.section = message;
    else if (field === 'totalseats') mapped.totalSeats = message;
  }
  return mapped;
}
