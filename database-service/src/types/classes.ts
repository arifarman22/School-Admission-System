import { z } from 'zod';

export const CLASS_NAME_MAX_LENGTH = 100;
export const TOTAL_SEATS_MAX = 10_000;

export const classNameSchema = z
  .string({
    error: (issue) => (issue.input === undefined ? 'name is required' : 'name must be a string'),
  })
  .trim()
  .min(1, 'name must not be empty')
  .max(CLASS_NAME_MAX_LENGTH, `name must be at most ${CLASS_NAME_MAX_LENGTH} characters`)
  .regex(/^[^\p{Cc}\p{Cf}]*$/u, 'name must not contain control or invisible formatting characters')
  .transform((name) => name.replace(/\s+/g, ' '));

export const SECTION_MAX_LENGTH = 20;
export const DEFAULT_SECTION = 'A';

export const sectionSchema = z
  .string({ error: 'section must be a string' })
  .trim()
  .min(1, 'section must not be empty')
  .max(SECTION_MAX_LENGTH, `section must be at most ${SECTION_MAX_LENGTH} characters`)
  .regex(
    /^(?:[\p{L}\p{N}][\p{L}\p{N} -]*)?$/u,
    'section may only contain letters, numbers, spaces and hyphens',
  )
  .transform((section) => section.replace(/\s+/g, ' ').toUpperCase());

export const totalSeatsSchema = z
  .number({
    error: (issue) =>
      issue.input === undefined ? 'totalSeats is required' : 'totalSeats must be a number',
  })
  .int('totalSeats must be a whole number')
  .min(1, 'totalSeats must be greater than zero')
  .max(TOTAL_SEATS_MAX, `totalSeats must be at most ${TOTAL_SEATS_MAX}`);

export const createClassBodySchema = z.strictObject({
  name: classNameSchema,
  section: sectionSchema.default(DEFAULT_SECTION),
  totalSeats: totalSeatsSchema,
});

export const CLASS_ID_MAX = 2_147_483_647;

export const classIdSchema = z
  .number({
    error: (issue) =>
      issue.input === undefined ? 'classId is required' : 'classId must be a number',
  })
  .int('classId must be a whole number')
  .min(1, 'classId must be a positive number')
  .max(CLASS_ID_MAX, 'classId is too large');

export const classIdParamsSchema = z.strictObject({
  classId: z
    .string()
    .regex(/^[1-9][0-9]{0,9}$/, 'classId must be a positive whole number')
    .transform(Number)
    .pipe(classIdSchema),
});

export type CreateClassRequest = z.input<typeof createClassBodySchema>;
export type CreateClassInput = z.output<typeof createClassBodySchema>;
export type ClassIdParams = z.output<typeof classIdParamsSchema>;

export interface ClassDto {
  id: number;
  name: string;
  section: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
  createdAt: string;
}
