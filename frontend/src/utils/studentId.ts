export const STUDENT_ID_LENGTH = 17;
export const STUDENT_ID_STORAGE_KEY = 'school-admission.studentId';

const STUDENT_ID_PATTERN = /^[0-9]{17}$/;

export function normalizeStudentId(input: string): string {
  return input.replace(/[\s-]/g, '');
}

export function countStudentIdDigits(input: string): number {
  return normalizeStudentId(input).replace(/[^0-9]/g, '').length;
}

export function isValidStudentId(value: string | null | undefined): value is string {
  return typeof value === 'string' && STUDENT_ID_PATTERN.test(value);
}

export function studentIdError(input: string): string | null {
  const value = normalizeStudentId(input);
  if (value.length === 0) return 'Enter your birth registration number.';
  if (!/^[0-9]+$/.test(value)) return 'Use digits 0–9 only.';
  if (value.length !== STUDENT_ID_LENGTH) {
    return `Must be exactly ${STUDENT_ID_LENGTH} digits (you entered ${value.length}).`;
  }
  return null;
}

export function maskStudentId(value: string): string {
  return `${value.slice(0, 4)} •••• •••• ${value.slice(-4)}`;
}

export function readStoredStudentId(): string | null {
  try {
    const stored = window.localStorage.getItem(STUDENT_ID_STORAGE_KEY);
    return isValidStudentId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredStudentId(value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(STUDENT_ID_STORAGE_KEY);
    else window.localStorage.setItem(STUDENT_ID_STORAGE_KEY, value);
  } catch {
    return;
  }
}
