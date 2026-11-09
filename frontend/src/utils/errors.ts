import { ApiError } from '../api/client';

const FRIENDLY_MESSAGES: Record<string, string> = {
  SEATS_FULL: 'This class has no seats left.',
  DUPLICATE_APPLICATION: 'You already have an active application for this class.',
  ALREADY_ADMITTED:
    'This student already has a confirmed admission in another class. A student can be admitted to only one class.',
  HOLD_EXPIRED: 'Your seat hold has expired. Please apply again.',
  HOLD_NOT_ACTIVE: 'This application is no longer active.',
  HOLD_ALREADY_CONFIRMED: 'This admission is already confirmed.',
  HOLD_NOT_OWNED: 'This application belongs to a different student.',
  STUDENT_ID_REQUIRED: 'Enter your birth registration number first.',
  CLASS_NAME_TAKEN: 'A class with this name already exists.',
  NOT_FOUND: 'We could not find what you were looking for.',
  SERVICE_BUSY: 'The system is busy right now. Please try again in a moment.',
  SERVICE_UNAVAILABLE: 'The admission service is temporarily unavailable.',
  UPSTREAM_TIMEOUT: 'The admission service took too long to respond.',
  NETWORK_ERROR: 'Cannot reach the admission service. Check your connection.',
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY_MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
