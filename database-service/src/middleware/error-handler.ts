import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, NotFoundError } from '../services/errors.js';
import type { ApiErrorBody } from '../types/api.js';

const DATABASE_UNAVAILABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const DATABASE_UNAVAILABLE_ADAPTER_KINDS = new Set([
  'DatabaseNotReachable',
  'ConnectionClosed',
  'SocketTimeout',
  'TooManyConnections',
  'TlsConnectionError',
]);

interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as BodyParserError).type === 'string' &&
    typeof (err as BodyParserError).status === 'number'
  );
}

function isDatabaseUnavailable(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as {
    name?: string;
    code?: string;
    meta?: { driverAdapterError?: { cause?: { kind?: string } } };
  };
  if (candidate.name === 'PrismaClientInitializationError') return true;
  if (candidate.code && DATABASE_UNAVAILABLE_PRISMA_CODES.has(candidate.code)) return true;
  const kind = candidate.meta?.driverAdapterError?.cause?.kind;
  return kind !== undefined && DATABASE_UNAVAILABLE_ADAPTER_KINDS.has(kind);
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new AppError(400, 'MALFORMED_JSON', 'Request body is not valid JSON');
    }
    if (err.type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
    if (err.status >= 400 && err.status < 500) {
      return new AppError(400, 'VALIDATION_ERROR', 'Request body could not be read');
    }
  }
  if (isDatabaseUnavailable(err)) {
    return new AppError(503, 'DATABASE_UNAVAILABLE', 'Database is temporarily unavailable');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const appError = toAppError(err);

  if (appError.status >= 500) {
    req.log.error({ err, code: appError.code }, 'Request failed');
  } else {
    req.log.info({ code: appError.code, details: appError.details }, 'Request rejected');
  }

  if (res.headersSent) return;

  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
    requestId: req.id,
  };
  res.status(appError.status).json(body);
};
