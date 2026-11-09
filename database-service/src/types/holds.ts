import { z } from 'zod';
import type { AdmissionStatus } from '../generated/prisma/enums.js';

export const studentIdSchema = z
  .string({
    error: (issue) =>
      issue.input === undefined ? 'studentId is required' : 'studentId must be a string',
  })
  .regex(/^[0-9]{17}$/, 'studentId must be exactly 17 digits');

export const createHoldBodySchema = z.strictObject({
  classId: z.uuid('classId must be a UUID'),
  studentId: studentIdSchema,
});

export const holdIdParamsSchema = z.strictObject({
  holdId: z.uuid('holdId must be a UUID'),
});

export const studentIdParamsSchema = z.strictObject({
  studentId: studentIdSchema,
});

export const studentActionBodySchema = z.strictObject({
  studentId: studentIdSchema,
});

export type StudentActionRequest = z.input<typeof studentActionBodySchema>;
export type CreateHoldRequest = z.input<typeof createHoldBodySchema>;
export type CreateHoldInput = z.output<typeof createHoldBodySchema>;

export interface HoldDto {
  holdId: string;
  classId: string;
  studentId: string;
  status: AdmissionStatus;
  createdAt: string;
  expiresAt: string;
  confirmedAt: string | null;
}

export interface StudentHoldDto extends HoldDto {
  className: string;
}
