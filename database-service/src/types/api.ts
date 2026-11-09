export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'MALFORMED_JSON'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'CLASS_NAME_TAKEN'
  | 'SEATS_FULL'
  | 'DUPLICATE_APPLICATION'
  | 'HOLD_NOT_OWNED'
  | 'HOLD_EXPIRED'
  | 'HOLD_NOT_ACTIVE'
  | 'HOLD_ALREADY_CONFIRMED'
  | 'NOT_IMPLEMENTED'
  | 'SERVICE_BUSY'
  | 'DATABASE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ValidationIssue[];
  };
  requestId: string;
}

export interface DataResponse<T> {
  data: T;
}
