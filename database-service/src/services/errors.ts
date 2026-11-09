import type { ErrorCode, ValidationIssue } from '../types/api.js';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ValidationIssue[],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(details: ValidationIssue[]) {
    super(400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, 'NOT_FOUND', message);
  }
}

export class ConflictError extends AppError {
  constructor(code: ErrorCode, message: string) {
    super(409, code, message);
  }
}

export class SeatsFullError extends ConflictError {
  constructor(classId: number) {
    super('SEATS_FULL', `Class ${classId} has no available seats`);
  }
}

export class DuplicateApplicationError extends ConflictError {
  constructor(classId: number) {
    super(
      'DUPLICATE_APPLICATION',
      `Student already has an active application for class ${classId}`,
    );
  }
}

export class AlreadyAdmittedError extends ConflictError {
  constructor() {
    super('ALREADY_ADMITTED', 'This student already has a confirmed admission in another class');
  }
}

export class HoldNotOwnedError extends AppError {
  constructor() {
    super(403, 'HOLD_NOT_OWNED', 'This hold belongs to a different student');
  }
}

export class HoldExpiredError extends ConflictError {
  constructor(holdId: string) {
    super('HOLD_EXPIRED', `Hold ${holdId} has expired`);
  }
}

export class HoldNotActiveError extends ConflictError {
  constructor(holdId: string) {
    super('HOLD_NOT_ACTIVE', `Hold ${holdId} has been cancelled`);
  }
}

export class HoldAlreadyConfirmedError extends ConflictError {
  constructor(holdId: string) {
    super('HOLD_ALREADY_CONFIRMED', `Hold ${holdId} is already confirmed and cannot be cancelled`);
  }
}

export class ServiceBusyError extends AppError {
  constructor() {
    super(503, 'SERVICE_BUSY', 'The class is busy, please retry');
  }
}

export class NotImplementedError extends AppError {
  constructor(operation: string) {
    super(501, 'NOT_IMPLEMENTED', `${operation} is not implemented yet`);
  }
}
