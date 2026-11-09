import type { CreateClassRequest } from '../types/api';

export const CLASS_NAME_MAX_LENGTH = 100;
export const TOTAL_SEATS_MIN = 1;
export const TOTAL_SEATS_MAX = 10_000;

export interface ClassFormValues {
  name: string;
  totalSeats: string;
}

export type ClassFormErrors = Partial<Record<keyof ClassFormValues, string>>;

const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}]/u;

export function normalizeClassName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
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
): { ok: true; request: CreateClassRequest } | { ok: false; errors: ClassFormErrors } {
  const errors: ClassFormErrors = {};
  const nameError = validateClassName(values.name);
  const seatsError = validateTotalSeats(values.totalSeats);
  if (nameError) errors.name = nameError;
  if (seatsError) errors.totalSeats = seatsError;

  if (nameError || seatsError) return { ok: false, errors };
  return {
    ok: true,
    request: {
      name: normalizeClassName(values.name),
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
    else if (field === 'totalseats') mapped.totalSeats = message;
  }
  return mapped;
}
