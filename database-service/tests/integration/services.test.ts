import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createPrismaClient, type PrismaClient } from '../../src/db/prisma.js';
import { INTERNAL_API_KEY_HEADER } from '../../src/middleware/internal-auth.js';
import { PrismaClassService } from '../../src/services/class.service.js';
import {
  AlreadyAdmittedError,
  ConflictError,
  DuplicateApplicationError,
  HoldExpiredError,
  HoldNotOwnedError,
} from '../../src/services/errors.js';
import { PrismaHoldService } from '../../src/services/hold.service.js';
import { PrismaDatabaseProbe } from '../../src/services/prisma-probe.js';

const url = process.env.TEST_DATABASE_URL;
const dedicated = process.env.TEST_DATABASE_DEDICATED === 'true';
const API_KEY = 'service-internal-key-1234567890';

describe.skipIf(!url || !dedicated)('Prisma services against PostgreSQL', () => {
  const tag = `svc-${randomUUID().slice(0, 8)}`;
  const studentPrefix = String(randomInt(1000, 9999));
  let counter = 0;
  const nextStudent = () => `${studentPrefix}${String(++counter).padStart(13, '0')}`;

  let prisma: PrismaClient;
  let pool: pg.Pool;
  let classes: PrismaClassService;
  let holds: PrismaHoldService;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    pool = new pg.Pool({ connectionString: url, max: 2 });
    classes = new PrismaClassService(prisma);
    holds = new PrismaHoldService(prisma, {
      holdDurationSeconds: 600,
      lockTimeoutMs: 10_000,
      transactionTimeoutMs: 20_000,
    });
    app = createApp({
      internalApiKey: API_KEY,
      logger: pino({ level: 'silent' }),
      databaseProbe: new PrismaDatabaseProbe(prisma),
      classService: classes,
      holdService: holds,
    });
  });

  afterAll(async () => {
    await pool?.end();
    await prisma?.$disconnect();
  });

  const newClass = (label: string, totalSeats: number) =>
    classes.createClass({ name: `${tag} ${label}`, section: 'A', totalSeats });

  const statusOf = async (holdId: string) =>
    (await pool.query('SELECT status FROM admission_holds WHERE id = $1', [holdId])).rows[0]
      .status as string;

  const expiredHold = async (classId: number, studentId: string) =>
    (
      await pool.query<{ id: string }>(
        `INSERT INTO admission_holds (class_id, student_id, created_at, expires_at)
         VALUES ($1, $2, now() - interval '20 minutes', now() - interval '10 minutes')
         RETURNING id`,
        [classId, studentId],
      )
    ).rows[0]!.id;

  it('1. creates a class persisted with full availability', async () => {
    const created = await newClass('create', 30);
    expect(created).toMatchObject({
      name: `${tag} create`,
      totalSeats: 30,
      heldSeats: 0,
      confirmedSeats: 0,
      availableSeats: 30,
    });
    expect(await classes.getClass(created.id)).toEqual(created);
    const { rows } = await pool.query('SELECT total_seats FROM admission_classes WHERE id = $1', [
      created.id,
    ]);
    expect(rows[0].total_seats).toBe(30);
  });

  it('2. rejects invalid capacity at the API boundary and in the database', async () => {
    for (const totalSeats of [0, -1, 10_001, 1.5]) {
      const res = await request(app)
        .post('/classes')
        .set(INTERNAL_API_KEY_HEADER, API_KEY)
        .send({ name: `${tag} capacity ${totalSeats}`, totalSeats });
      expect(res.status, String(totalSeats)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }

    await expect(newClass('capacity-db', 0)).rejects.toThrow();
    await expect(newClass('capacity-db', -5)).rejects.toThrow();
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM admission_classes WHERE name LIKE $1',
      [`${tag} capacity%`],
    );
    expect(rows[0].n).toBe(0);
  });

  it('3. rejects a duplicate class name', async () => {
    await newClass('duplicate', 5);
    const error = await newClass('duplicate', 9).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('CLASS_SECTION_TAKEN');
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM admission_classes WHERE name = $1',
      [`${tag} duplicate`],
    );
    expect(rows[0].n).toBe(1);
  });

  it('4. holds a seat with a database-timed expiry', async () => {
    const cls = await newClass('hold', 2);
    const studentId = nextStudent();
    const hold = await holds.createHold({ classId: cls.id, studentId });

    expect(hold).toMatchObject({ classId: cls.id, studentId, status: 'HELD', confirmedAt: null });
    expect(Date.parse(hold.expiresAt) - Date.parse(hold.createdAt)).toBe(600_000);
    expect(await classes.getClass(cls.id)).toMatchObject({ heldSeats: 1, availableSeats: 1 });
  });

  it('5. rejects a duplicate active application by the same student', async () => {
    const cls = await newClass('dup-app', 5);
    const studentId = nextStudent();
    await holds.createHold({ classId: cls.id, studentId });

    await expect(holds.createHold({ classId: cls.id, studentId })).rejects.toBeInstanceOf(
      DuplicateApplicationError,
    );
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM admission_holds WHERE class_id = $1 AND student_id = $2',
      [cls.id, studentId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('6. releases an expired seat to the next student and keeps the history', async () => {
    const cls = await newClass('release', 1);
    const oldHold = await expiredHold(cls.id, nextStudent());
    expect(await classes.getClass(cls.id)).toMatchObject({ heldSeats: 0, availableSeats: 1 });

    const next = await holds.createHold({ classId: cls.id, studentId: nextStudent() });
    expect(next.status).toBe('HELD');
    expect(await statusOf(oldHold)).toBe('EXPIRED');
    expect(await classes.getClass(cls.id)).toMatchObject({ heldSeats: 1, availableSeats: 0 });
  });

  it('7. confirms a valid hold', async () => {
    const cls = await newClass('confirm', 2);
    const studentId = nextStudent();
    const hold = await holds.createHold({ classId: cls.id, studentId });

    const confirmed = await holds.confirmHold(hold.holdId, studentId);
    expect(confirmed).toMatchObject({ holdId: hold.holdId, status: 'CONFIRMED' });
    expect(confirmed.confirmedAt).not.toBeNull();
    expect(await statusOf(hold.holdId)).toBe('CONFIRMED');
    expect(await classes.getClass(cls.id)).toMatchObject({
      heldSeats: 0,
      confirmedSeats: 1,
      availableSeats: 1,
    });
  });

  it('8. rejects confirmation of an expired hold', async () => {
    const cls = await newClass('expired-confirm', 1);
    const studentId = nextStudent();
    const holdId = await expiredHold(cls.id, studentId);

    await expect(holds.confirmHold(holdId, studentId)).rejects.toBeInstanceOf(HoldExpiredError);
    expect(await statusOf(holdId)).toBe('EXPIRED');
    expect(await classes.getClass(cls.id)).toMatchObject({ confirmedSeats: 0, availableSeats: 1 });
  });

  it('9. confirmation is idempotent', async () => {
    const cls = await newClass('idempotent', 1);
    const studentId = nextStudent();
    const hold = await holds.createHold({ classId: cls.id, studentId });

    const first = await holds.confirmHold(hold.holdId, studentId);
    const second = await holds.confirmHold(hold.holdId, studentId);
    const third = await holds.confirmHold(hold.holdId, studentId);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(await classes.getClass(cls.id)).toMatchObject({ confirmedSeats: 1, availableSeats: 0 });
  });

  it('10. cancels a hold and frees the seat', async () => {
    const cls = await newClass('cancel', 1);
    const studentId = nextStudent();
    const hold = await holds.createHold({ classId: cls.id, studentId });

    const cancelled = await holds.cancelHold(hold.holdId, studentId);
    expect(cancelled).toMatchObject({ holdId: hold.holdId, status: 'CANCELLED' });
    expect(await statusOf(hold.holdId)).toBe('CANCELLED');
    expect(await classes.getClass(cls.id)).toMatchObject({ heldSeats: 0, availableSeats: 1 });
    expect((await holds.createHold({ classId: cls.id, studentId: nextStudent() })).status).toBe(
      'HELD',
    );
  });

  it('11. rejects confirm and cancel by a different student', async () => {
    const cls = await newClass('owner', 2);
    const owner = nextStudent();
    const hold = await holds.createHold({ classId: cls.id, studentId: owner });

    await expect(holds.confirmHold(hold.holdId, nextStudent())).rejects.toBeInstanceOf(
      HoldNotOwnedError,
    );
    await expect(holds.cancelHold(hold.holdId, nextStudent())).rejects.toBeInstanceOf(
      HoldNotOwnedError,
    );
    expect(await statusOf(hold.holdId)).toBe('HELD');
  });

  it('12. a student can confirm admission in only one class', async () => {
    const first = await newClass('one-admission-a', 5);
    const second = await newClass('one-admission-b', 5);
    const studentId = nextStudent();
    const holdA = await holds.createHold({ classId: first.id, studentId });
    const holdB = await holds.createHold({ classId: second.id, studentId });

    await holds.confirmHold(holdA.holdId, studentId);
    const error = await holds.confirmHold(holdB.holdId, studentId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AlreadyAdmittedError);
    expect((error as AlreadyAdmittedError).code).toBe('ALREADY_ADMITTED');
    expect(await statusOf(holdB.holdId)).toBe('HELD');

    expect((await holds.cancelHold(holdB.holdId, studentId)).status).toBe('CANCELLED');
    expect(await classes.getClass(second.id)).toMatchObject({ heldSeats: 0, availableSeats: 5 });
  });

  it('13. an admitted student cannot take a seat in another class', async () => {
    const first = await newClass('admitted-a', 5);
    const other = await newClass('admitted-b', 5);
    const studentId = nextStudent();
    const hold = await holds.createHold({ classId: first.id, studentId });
    await holds.confirmHold(hold.holdId, studentId);

    await expect(holds.createHold({ classId: other.id, studentId })).rejects.toBeInstanceOf(
      AlreadyAdmittedError,
    );
    expect(await classes.getClass(other.id)).toMatchObject({ heldSeats: 0, availableSeats: 5 });
    expect((await holds.createHold({ classId: other.id, studentId: nextStudent() })).status).toBe(
      'HELD',
    );
  });

  it('14. the database itself allows only one CONFIRMED row per student', async () => {
    const a = await newClass('db-one-a', 5);
    const b = await newClass('db-one-b', 5);
    const studentId = nextStudent();
    await pool.query(
      `INSERT INTO admission_holds (class_id, student_id, status, expires_at, confirmed_at)
       VALUES ($1, $2, 'CONFIRMED', now() + interval '10 minutes', now())`,
      [a.id, studentId],
    );
    await expect(
      pool.query(
        `INSERT INTO admission_holds (class_id, student_id, status, expires_at, confirmed_at)
         VALUES ($1, $2, 'CONFIRMED', now() + interval '10 minutes', now())`,
        [b.id, studentId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
