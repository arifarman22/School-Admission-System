import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../services/errors.js';

export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key';

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function internalAuth(expectedKey: string): RequestHandler {
  return (req, _res, next) => {
    const provided = req.header(INTERNAL_API_KEY_HEADER);
    if (!provided || !safeEqual(provided, expectedKey)) {
      next(new AppError(401, 'UNAUTHORIZED', 'Missing or invalid internal API key'));
      return;
    }
    next();
  };
}
