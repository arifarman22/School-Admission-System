import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

function assignRequestId(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  logger: Logger,
  id: string,
): void {
  req.id = id;
  req.log = logger.child({ requestId: id });
  res.setHeader(REQUEST_ID_HEADER, id);
}

export function requestContext(logger: Logger): RequestHandler {
  return (req, res, next) => {
    assignRequestId(req, res, logger, randomUUID());
    const startedAt = performance.now();

    res.on('finish', () => {
      const entry = {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
      };
      if (res.statusCode >= 500) req.log.error(entry, 'request completed');
      else if (res.statusCode >= 400) req.log.warn(entry, 'request completed');
      else if (req.originalUrl.startsWith('/health')) req.log.debug(entry, 'request completed');
      else req.log.info(entry, 'request completed');
    });

    next();
  };
}

export function adoptCallerRequestId(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const incoming = req.header(REQUEST_ID_HEADER);
    if (incoming && REQUEST_ID_PATTERN.test(incoming)) {
      assignRequestId(req, res, logger, incoming);
    }
    next();
  };
}
