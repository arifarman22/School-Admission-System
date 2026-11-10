import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type PrismaClient } from '../../src/db/prisma.js';

const url = process.env.TEST_DATABASE_URL;

const STUDENT_A = '20240000000000001';
const STUDENT_B = '20240000000000002';

class Rollback extends Error {}

describe.skipIf(!url)('database schema (PostgreSQL)', () => {
  let pool: pg.Pool;
  let prisma: PrismaClient;

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: url, max: 2 });
    prisma = createPrismaClient(url as string);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await pool?.end();
  });

  async function inTx(fn: (db: pg.PoolClient) => Promise<void>): Promise<void> {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await fn(db);
    } finally {
      await db.query('ROLLBACK');
      db.release();
    }
  }

  async function expectPgError(
    db: pg.PoolClient,
    code: string | string[],
    sql: string,
    params: unknown[] = [],
    constraint?: string,
  ): Promise<void> {
    await db.query('SAVEPOINT expect_error');
    try {
      await db.query(sql, params);
      throw new Error(`Expected SQLSTATE ${code} but the statement succeeded: ${sql}`);
    } catch (error) {
      const err = error as pg.DatabaseError;
      expect([code].flat(), err.message).toContain(err.code);
      if (constraint) expect(err.constraint).toBe(constraint);
    } finally {
      await db.query('ROLLBACK TO SAVEPOINT expect_error');
    }
  }

  async function createClass(db: pg.PoolClient, name: string, seats = 10): Promise<number> {
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO admission_classes (name, total_seats) VALUES ($1, $2) RETURNING id',
      [name, seats],
    );
    return rows[0]!.id;
  }

  const INSERT_HOLD = `INSERT INTO admission_holds (class_id, student_id, status, expires_at, confirmed_at)
                       VALUES ($1, $2, $3, now() + interval '15 minutes', $4) RETURNING id`;

  async function createHold(
    db: pg.PoolClient,
    classId: number,
    studentId: string,
    status = 'HELD',
  ): Promise<string> {
    const confirmedAt = status === 'CONFIRMED' ? new Date(Date.now() + 1000) : null;
    const { rows } = await db.query<{ id: string }>(INSERT_HOLD, [
      classId,
      studentId,
      status,
      confirmedAt,
    ]);
    return rows[0]!.id;
  }

  it('has all migrations applied', async () => {
    const { rows } = await pool.query<{ migration_name: string }>(
      `SELECT migration_name FROM _prisma_migrations
       WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
    );
    expect(rows.map((r) => r.migration_name)).toEqual([
      expect.stringMatching(/_init_admission_schema$/),
      expect.stringMatching(/_admission_constraints$/),
      expect.stringMatching(/_numeric_class_ids$/),
      expect.stringMatching(/_one_admission_per_student$/),
      expect.stringMatching(/_class_sections$/),
    ]);
  });

  it('defines the admission_status enum', async () => {
    const { rows } = await pool.query<{ v: string }>(
      `SELECT unnest(enum_range(NULL::admission_status))::text AS v`,
    );
    expect(rows.map((r) => r.v)).toEqual(['HELD', 'CONFIRMED', 'EXPIRED', 'CANCELLED']);
  });

  it('creates the expected indexes', async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'admission_holds'`,
    );
    const byName = new Map(rows.map((r) => [r.indexname, r.indexdef]));

    expect(byName.get('admission_holds_class_id_status_expires_at_idx')).toContain(
      '(class_id, status, expires_at)',
    );
    expect(byName.get('admission_holds_student_id_idx')).toContain('(student_id)');
    expect(byName.get('admission_holds_status_expires_at_idx')).toContain('(status, expires_at)');

    const partial = byName.get('admission_holds_active_class_student_key');
    expect(partial).toContain('CREATE UNIQUE INDEX');
    expect(partial).toContain('(class_id, student_id)');
    expect(partial).toMatch(/WHERE \(status = ANY \(ARRAY\['HELD'.*'CONFIRMED'/);
  });

  it('rejects non-positive total_seats', () =>
    inTx(async (db) => {
      for (const seats of [0, -1]) {
        await expectPgError(
          db,
          '23514',
          'INSERT INTO admission_classes (name, total_seats) VALUES ($1, $2)',
          [`Seats ${seats}`, seats],
          'admission_classes_total_seats_positive_chk',
        );
      }
    }));

  it('rejects duplicate and blank class names', () =>
    inTx(async (db) => {
      await createClass(db, 'Test Unique Class');
      await expectPgError(
        db,
        '23505',
        'INSERT INTO admission_classes (name, total_seats) VALUES ($1, 5)',
        ['Test Unique Class'],
        'admission_classes_name_section_key',
      );
      await expectPgError(
        db,
        '23514',
        'INSERT INTO admission_classes (name, total_seats) VALUES ($1, 5)',
        ['   '],
        'admission_classes_name_not_blank_chk',
      );
    }));

  it('fills id and created_at from the database', () =>
    inTx(async (db) => {
      const { rows } = await db.query<{ id: number; created_at: Date; db_now: Date }>(
        `INSERT INTO admission_classes (name, total_seats) VALUES ('Defaults', 5)
         RETURNING id, created_at, now() AS db_now`,
      );
      expect(Number.isInteger(rows[0]!.id)).toBe(true);
      expect(rows[0]!.id).toBeGreaterThan(0);
      expect(
        Math.abs(rows[0]!.created_at.getTime() - rows[0]!.db_now.getTime()),
      ).toBeLessThanOrEqual(1);
    }));

  it('accepts exactly 17 digits and rejects anything else', () =>
    inTx(async (db) => {
      const classId = await createClass(db, 'Student Id Class');
      await createHold(db, classId, '12345678901234567');

      for (const bad of [
        '1234567890123456',
        '123456789012345678',
        '1234567890123456a',
        ' 1234567890123456',
        '１２３４５６７８９０１２３４５６７',
      ]) {
        await expectPgError(db, bad.length > 17 ? '22001' : '23514', INSERT_HOLD, [
          classId,
          bad,
          'HELD',
          null,
        ]);
      }
    }));

  it('enforces referential integrity', () =>
    inTx(async (db) => {
      await expectPgError(
        db,
        '23503',
        INSERT_HOLD,
        [2_000_000_000, STUDENT_A, 'HELD', null],
        'admission_holds_class_id_fkey',
      );

      const classId = await createClass(db, 'Restrict Class');
      await createHold(db, classId, STUDENT_A);
      await expectPgError(
        db,
        ['23503', '23001'],
        'DELETE FROM admission_classes WHERE id = $1',
        [classId],
        'admission_holds_class_id_fkey',
      );
    }));

  it('allows only one HELD/CONFIRMED record per student per class', () =>
    inTx(async (db) => {
      const classId = await createClass(db, 'Active Class');
      const otherClassId = await createClass(db, 'Other Class');
      const holdId = await createHold(db, classId, STUDENT_A);

      for (const status of ['HELD', 'CONFIRMED']) {
        await expectPgError(
          db,
          '23505',
          INSERT_HOLD,
          [classId, STUDENT_A, status, status === 'CONFIRMED' ? new Date(Date.now() + 1000) : null],
          'admission_holds_active_class_student_key',
        );
      }

      await createHold(db, otherClassId, STUDENT_A);
      await createHold(db, classId, STUDENT_B);

      await db.query(`UPDATE admission_holds SET status = 'EXPIRED' WHERE id = $1`, [holdId]);
      const secondId = await createHold(db, classId, STUDENT_A);
      await db.query(`UPDATE admission_holds SET status = 'CANCELLED' WHERE id = $1`, [secondId]);
      await createHold(db, classId, STUDENT_A, 'CONFIRMED');

      const { rows } = await db.query<{ status: string }>(
        `SELECT status FROM admission_holds WHERE class_id = $1 AND student_id = $2 ORDER BY created_at, status`,
        [classId, STUDENT_A],
      );
      expect(rows.map((r) => r.status).sort()).toEqual(['CANCELLED', 'CONFIRMED', 'EXPIRED']);
    }));

  it('validates timestamps and confirmation consistency', () =>
    inTx(async (db) => {
      const classId = await createClass(db, 'Timestamp Class');
      await expectPgError(
        db,
        '23514',
        `INSERT INTO admission_holds (class_id, student_id, expires_at) VALUES ($1, $2, now())`,
        [classId, STUDENT_A],
        'admission_holds_expires_after_created_chk',
      );
      await expectPgError(
        db,
        '23514',
        INSERT_HOLD,
        [classId, STUDENT_A, 'CONFIRMED', null],
        'admission_holds_confirmed_at_required_chk',
      );
      await expectPgError(
        db,
        '23514',
        INSERT_HOLD,
        [classId, STUDENT_A, 'HELD', new Date(Date.now() - 86_400_000)],
        'admission_holds_confirmed_at_after_created_chk',
      );
    }));

  it('keeps history: holds cannot be deleted and identity columns are immutable', () =>
    inTx(async (db) => {
      const classId = await createClass(db, 'History Class');
      const otherClassId = await createClass(db, 'History Other');
      const holdId = await createHold(db, classId, STUDENT_A);

      await expectPgError(db, '23001', 'DELETE FROM admission_holds WHERE id = $1', [holdId]);
      await expectPgError(db, '23001', `UPDATE admission_holds SET student_id = $2 WHERE id = $1`, [
        holdId,
        STUDENT_B,
      ]);
      await expectPgError(db, '23001', `UPDATE admission_holds SET class_id = $2 WHERE id = $1`, [
        holdId,
        otherClassId,
      ]);

      await db.query(`UPDATE admission_holds SET status = 'CANCELLED' WHERE id = $1`, [holdId]);
    }));

  it('derives availability from database time', () =>
    inTx(async (db) => {
      const classId = await createClass(db, 'Capacity Class', 5);
      const students = [
        '30000000000000001',
        '30000000000000002',
        '30000000000000003',
        '30000000000000004',
        '30000000000000005',
      ];

      await createHold(db, classId, students[0]!);
      await createHold(db, classId, students[1]!, 'CONFIRMED');
      await db.query(
        `INSERT INTO admission_holds (class_id, student_id, created_at, expires_at)
         VALUES ($1, $2, now() - interval '2 hours', now() - interval '1 hour')`,
        [classId, students[2]],
      );
      await createHold(db, classId, students[3]!, 'CANCELLED');
      await createHold(db, classId, students[4]!, 'EXPIRED');

      const { rows } = await db.query(
        `SELECT total_seats, held_seats, confirmed_seats, available_seats
         FROM admission_class_availability WHERE class_id = $1`,
        [classId],
      );
      expect(rows[0]).toEqual({
        total_seats: 5,
        held_seats: 1,
        confirmed_seats: 1,
        available_seats: 3,
      });
    }));

  it('works through Prisma Client with the relation and maps unique violations to P2002', async () => {
    const outcome = await prisma
      .$transaction(async (tx) => {
        const admissionClass = await tx.admissionClass.create({
          data: { name: 'Prisma Client Class', totalSeats: 3 },
        });
        const hold = await tx.admissionHold.create({
          data: {
            classId: admissionClass.id,
            studentId: STUDENT_A,
            expiresAt: new Date(Date.now() + 15 * 60_000),
          },
          include: { class: true },
        });
        expect(hold.status).toBe('HELD');
        expect(hold.class.name).toBe('Prisma Client Class');

        const withHolds = await tx.admissionClass.findUniqueOrThrow({
          where: { id: admissionClass.id },
          include: { holds: true },
        });
        expect(withHolds.holds).toHaveLength(1);

        await expect(
          tx.admissionClass.create({ data: { name: 'Prisma Client Class', totalSeats: 1 } }),
        ).rejects.toMatchObject({ code: 'P2002' });

        throw new Rollback();
      })
      .catch((error: unknown) =>
        error instanceof Rollback ? 'rolled back' : Promise.reject(error),
      );

    expect(outcome).toBe('rolled back');
  });
});
