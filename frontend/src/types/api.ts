export type HoldStatus = 'HELD' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';

export interface CreateClassRequest {
  name: string;
  totalSeats: number;
}

export interface ClassCreated {
  id: string;
  name: string;
  totalSeats: number;
}

export interface AdmissionClass {
  id: string;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
}

export interface HoldCreated {
  holdId: string;
  classId: string;
  studentId: string;
  status: HoldStatus;
  expiresAt: string;
}

export interface Hold {
  holdId: string;
  classId: string;
  status: HoldStatus;
  expiresAt: string;
}

export interface HoldConfirmed {
  holdId: string;
  status: HoldStatus;
}

export interface StudentHold {
  holdId: string;
  classId: string;
  className: string;
  status: HoldStatus;
  expiresAt: string;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'STUDENT_ID_REQUIRED'
  | 'NOT_FOUND'
  | 'CLASS_NAME_TAKEN'
  | 'SEATS_FULL'
  | 'DUPLICATE_APPLICATION'
  | 'HOLD_NOT_OWNED'
  | 'HOLD_EXPIRED'
  | 'HOLD_NOT_ACTIVE'
  | 'HOLD_ALREADY_CONFIRMED'
  | 'SERVICE_BUSY'
  | 'SERVICE_UNAVAILABLE'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | (string & {});

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: ApiErrorCode;
  traceId?: string;
  errors?: Record<string, string[]>;
}
