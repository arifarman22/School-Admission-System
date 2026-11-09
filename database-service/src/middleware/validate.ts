import type { Request } from 'express';
import type { z } from 'zod';
import { AppError, ValidationError } from '../services/errors.js';

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function parseJsonBody<T extends z.ZodType>(req: Request, schema: T): z.output<T> {
  if (!req.is('application/json')) {
    throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
  }
  return parseInput(schema, req.body);
}
