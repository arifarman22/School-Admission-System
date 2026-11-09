import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { ClassDto, CreateClassInput } from '../types/classes.js';
import { ConflictError, NotFoundError } from './errors.js';

export interface ClassService {
  createClass(input: CreateClassInput): Promise<ClassDto>;
  listClasses(): Promise<ClassDto[]>;
  getClass(classId: number): Promise<ClassDto>;
}

interface ClassAvailabilityRow {
  id: number;
  name: string;
  totalSeats: number;
  heldSeats: number;
  confirmedSeats: number;
  availableSeats: number;
  createdAt: Date;
}

function toClassDto(row: ClassAvailabilityRow): ClassDto {
  return {
    id: row.id,
    name: row.name,
    totalSeats: row.totalSeats,
    heldSeats: row.heldSeats,
    confirmedSeats: row.confirmedSeats,
    availableSeats: row.availableSeats,
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export class PrismaClassService implements ClassService {
  constructor(private readonly prisma: PrismaClient) {}

  async createClass(input: CreateClassInput): Promise<ClassDto> {
    try {
      const created = await this.prisma.admissionClass.create({
        data: { name: input.name, totalSeats: input.totalSeats },
      });
      return toClassDto({
        ...created,
        heldSeats: 0,
        confirmedSeats: 0,
        availableSeats: created.totalSeats,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('CLASS_NAME_TAKEN', `A class named "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async listClasses(): Promise<ClassDto[]> {
    const rows = await this.prisma.$queryRaw<ClassAvailabilityRow[]>`
      SELECT c.id                  AS "id",
             c.name                AS "name",
             c.total_seats         AS "totalSeats",
             v.held_seats          AS "heldSeats",
             v.confirmed_seats     AS "confirmedSeats",
             v.available_seats     AS "availableSeats",
             c.created_at          AS "createdAt"
      FROM admission_classes c
      JOIN admission_class_availability v ON v.class_id = c.id
      ORDER BY c.name, c.id`;
    return rows.map(toClassDto);
  }

  async getClass(classId: number): Promise<ClassDto> {
    const [row] = await this.prisma.$queryRaw<ClassAvailabilityRow[]>`
      SELECT c.id                  AS "id",
             c.name                AS "name",
             c.total_seats         AS "totalSeats",
             v.held_seats          AS "heldSeats",
             v.confirmed_seats     AS "confirmedSeats",
             v.available_seats     AS "availableSeats",
             c.created_at          AS "createdAt"
      FROM admission_classes c
      JOIN admission_class_availability v ON v.class_id = c.id
      WHERE c.id = ${classId}::int`;
    if (!row) {
      throw new NotFoundError(`Class ${classId} not found`);
    }
    return toClassDto(row);
  }
}
