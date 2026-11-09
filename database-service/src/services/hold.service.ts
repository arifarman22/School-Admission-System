import { Prisma, type AdmissionHold, type PrismaClient } from '../generated/prisma/client.js';
import type { CreateHoldInput, HoldDto, StudentHoldDto } from '../types/holds.js';
import {
  AppError,
  DuplicateApplicationError,
  HoldAlreadyConfirmedError,
  HoldExpiredError,
  HoldNotActiveError,
  HoldNotOwnedError,
  NotFoundError,
  SeatsFullError,
  ServiceBusyError,
} from './errors.js';

export interface HoldService {
  createHold(input: CreateHoldInput): Promise<HoldDto>;
  getHold(holdId: string): Promise<HoldDto>;
  confirmHold(holdId: string, studentId: string): Promise<HoldDto>;
  cancelHold(holdId: string, studentId: string): Promise<HoldDto>;
  listStudentHolds(studentId: string): Promise<StudentHoldDto[]>;
}

export interface ReservationSettings {
  holdDurationSeconds: number;
  lockTimeoutMs: number;
  transactionTimeoutMs: number;
}

type Tx = Prisma.TransactionClient;

interface LockedClass {
  totalSeats: number;
}

interface Occupancy {
  heldSeats: number;
  confirmedSeats: number;
  studentHasActiveHold: boolean;
}

interface StudentHoldRow extends AdmissionHold {
  className: string;
}

export function toHoldDto(hold: AdmissionHold): HoldDto {
  return {
    holdId: hold.id,
    classId: hold.classId,
    studentId: hold.studentId,
    status: hold.status,
    createdAt: hold.createdAt.toISOString(),
    expiresAt: hold.expiresAt.toISOString(),
    confirmedAt: hold.confirmedAt ? hold.confirmedAt.toISOString() : null,
  };
}

function driverErrorCode(err: unknown): string | undefined {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  const meta = err.meta as
    { driverAdapterError?: { cause?: { originalCode?: string } } } | undefined;
  return meta?.driverAdapterError?.cause?.originalCode;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2002' || driverErrorCode(err) === '23505')
  );
}

function isContention(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return err.code === 'P2028' || err.code === 'P2034' || driverErrorCode(err) === '55P03';
}

export async function lockClassForSeatChange(
  tx: Tx,
  classId: string,
  lockTimeoutMs: number,
): Promise<{ lockedClass: LockedClass; dbNow: Date }> {
  await tx.$queryRaw`SELECT set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`;

  const locked = await tx.$queryRaw<LockedClass[]>`
    SELECT total_seats AS "totalSeats"
    FROM admission_classes
    WHERE id = ${classId}::uuid
    FOR UPDATE`;
  const lockedClass = locked[0];
  if (!lockedClass) {
    throw new NotFoundError(`Class ${classId} not found`);
  }

  const [clock] = await tx.$queryRaw<{ dbNow: Date }[]>`
    WITH now AS MATERIALIZED (SELECT clock_timestamp() AS ts),
         expired AS (
           UPDATE admission_holds h
           SET status = 'EXPIRED'
           FROM now
           WHERE h.class_id = ${classId}::uuid
             AND h.status = 'HELD'
             AND h.expires_at <= now.ts
           RETURNING h.id
         )
    SELECT now.ts AS "dbNow", (SELECT count(*) FROM expired)::int AS "expiredCount"
    FROM now`;

  return { lockedClass, dbNow: clock!.dbNow };
}

export class PrismaHoldService implements HoldService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly settings: ReservationSettings,
  ) {}

  private runSeatTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      maxWait: this.settings.transactionTimeoutMs,
      timeout: this.settings.transactionTimeoutMs,
    });
  }

  private async runSeatChange<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const outcome = await this.runSeatTransaction(async (tx) => {
      try {
        return { ok: true as const, value: await fn(tx) };
      } catch (err) {
        if (err instanceof AppError) return { ok: false as const, rejection: err };
        throw err;
      }
    });
    if (!outcome.ok) throw outcome.rejection;
    return outcome.value;
  }

  private translate(err: unknown, onUniqueViolation?: () => AppError): never {
    if (err instanceof AppError) throw err;
    if (onUniqueViolation && isUniqueViolation(err)) throw onUniqueViolation();
    if (isContention(err)) throw new ServiceBusyError();
    throw err;
  }

  async createHold({ classId, studentId }: CreateHoldInput): Promise<HoldDto> {
    try {
      return await this.runSeatChange(async (tx) => {
        const { lockedClass, dbNow } = await lockClassForSeatChange(
          tx,
          classId,
          this.settings.lockTimeoutMs,
        );

        const [occupancy] = await tx.$queryRaw<Occupancy[]>`
          SELECT count(*) FILTER (WHERE status = 'HELD')::int        AS "heldSeats",
                 count(*) FILTER (WHERE status = 'CONFIRMED')::int   AS "confirmedSeats",
                 coalesce(bool_or(student_id = ${studentId}), false) AS "studentHasActiveHold"
          FROM admission_holds
          WHERE class_id = ${classId}::uuid
            AND (status = 'CONFIRMED' OR (status = 'HELD' AND expires_at > ${dbNow}::timestamptz))`;

        if (occupancy!.studentHasActiveHold) {
          throw new DuplicateApplicationError(classId);
        }
        if (occupancy!.heldSeats + occupancy!.confirmedSeats >= lockedClass.totalSeats) {
          throw new SeatsFullError(classId);
        }

        const hold = await tx.admissionHold.create({
          data: {
            classId,
            studentId,
            createdAt: dbNow,
            expiresAt: new Date(dbNow.getTime() + this.settings.holdDurationSeconds * 1000),
          },
        });
        return toHoldDto(hold);
      });
    } catch (err) {
      this.translate(err, () => new DuplicateApplicationError(classId));
    }
  }

  private async withOwnedHold(
    holdId: string,
    studentId: string,
    apply: (tx: Tx, hold: AdmissionHold, dbNow: Date) => Promise<AdmissionHold>,
  ): Promise<HoldDto> {
    try {
      return await this.runSeatChange(async (tx) => {
        const [owner] = await tx.$queryRaw<{ classId: string }[]>`
          SELECT class_id::text AS "classId" FROM admission_holds WHERE id = ${holdId}::uuid`;
        if (!owner) {
          throw new NotFoundError(`Hold ${holdId} not found`);
        }

        const { dbNow } = await lockClassForSeatChange(
          tx,
          owner.classId,
          this.settings.lockTimeoutMs,
        );

        const [hold] = await tx.$queryRaw<AdmissionHold[]>`
          SELECT id::text            AS "id",
                 class_id::text      AS "classId",
                 student_id          AS "studentId",
                 status::text        AS "status",
                 created_at          AS "createdAt",
                 expires_at          AS "expiresAt",
                 confirmed_at        AS "confirmedAt"
          FROM admission_holds
          WHERE id = ${holdId}::uuid
          FOR UPDATE`;
        if (hold!.studentId !== studentId) {
          throw new HoldNotOwnedError();
        }

        return toHoldDto(await apply(tx, hold!, dbNow));
      });
    } catch (err) {
      this.translate(err);
    }
  }

  confirmHold(holdId: string, studentId: string): Promise<HoldDto> {
    return this.withOwnedHold(holdId, studentId, async (tx, hold, dbNow) => {
      switch (hold.status) {
        case 'CONFIRMED':
          return hold;
        case 'CANCELLED':
          throw new HoldNotActiveError(holdId);
        case 'EXPIRED':
          throw new HoldExpiredError(holdId);
        case 'HELD':
          return tx.admissionHold.update({
            where: { id: holdId },
            data: { status: 'CONFIRMED', confirmedAt: dbNow },
          });
      }
    });
  }

  cancelHold(holdId: string, studentId: string): Promise<HoldDto> {
    return this.withOwnedHold(holdId, studentId, async (tx, hold) => {
      switch (hold.status) {
        case 'CANCELLED':
          return hold;
        case 'CONFIRMED':
          throw new HoldAlreadyConfirmedError(holdId);
        case 'EXPIRED':
          throw new HoldExpiredError(holdId);
        case 'HELD':
          return tx.admissionHold.update({
            where: { id: holdId },
            data: { status: 'CANCELLED' },
          });
      }
    });
  }

  async getHold(holdId: string): Promise<HoldDto> {
    const [hold] = await this.prisma.$queryRaw<AdmissionHold[]>`
      SELECT id::text            AS "id",
             class_id::text      AS "classId",
             student_id          AS "studentId",
             CASE WHEN status = 'HELD' AND expires_at <= now() THEN 'EXPIRED'
                  ELSE status::text END AS "status",
             created_at          AS "createdAt",
             expires_at          AS "expiresAt",
             confirmed_at        AS "confirmedAt"
      FROM admission_holds
      WHERE id = ${holdId}::uuid`;
    if (!hold) {
      throw new NotFoundError(`Hold ${holdId} not found`);
    }
    return toHoldDto(hold);
  }

  async listStudentHolds(studentId: string): Promise<StudentHoldDto[]> {
    const rows = await this.prisma.$queryRaw<StudentHoldRow[]>`
      SELECT h.id::text          AS "id",
             h.class_id::text    AS "classId",
             c.name              AS "className",
             h.student_id        AS "studentId",
             CASE WHEN h.status = 'HELD' AND h.expires_at <= now() THEN 'EXPIRED'
                  ELSE h.status::text END AS "status",
             h.created_at        AS "createdAt",
             h.expires_at        AS "expiresAt",
             h.confirmed_at      AS "confirmedAt"
      FROM admission_holds h
      JOIN admission_classes c ON c.id = h.class_id
      WHERE h.student_id = ${studentId}
      ORDER BY h.created_at DESC, h.id`;
    return rows.map((row) => ({ ...toHoldDto(row), className: row.className }));
  }
}
