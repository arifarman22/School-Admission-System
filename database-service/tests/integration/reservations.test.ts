import { randomInt, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import pg from 'pg';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createPrismaClient, type PrismaClient } from '../../src/db/prisma.js';
import { INTERNAL_API_KEY_HEADER } from '../../src/middleware/internal-auth.js';
import { PrismaClassService } from '../../src/services/class.service.js';
import { PrismaHoldService, type ReservationSettings } from '../../src/services/hold.service.js';
import { PrismaDatabaseProbe } from '../../src/services/prisma-probe.js';
import type { HoldDto } from '../../src/types/holds.js';

const url = process.env.TEST_DATABASE_URL;
const dedicated = process.env.TEST_DATABASE_DEDICATED === 'true';
const API_KEY = 'reservation-internal-key-123456';
const HOLD_DURATION_SECONDS = 600;

interface Instance {
  prisma: PrismaClient;
  server: Server;
  baseUrl: string;
}

interface ReserveResult {
  status: number;
  code?: string | undefined;
  data?: HoldDto | undefined;
}

describe.skipIf(!url || !dedicated)('seat reservation engine against PostgreSQL', () => {
  const runTag = randomUUID().slice(0, 8);
  const studentPrefix = String(randomInt(1000, 9999));
  let studentCounter = 0;
  const instances: Instance[] = [];
  let pool: pg.Pool;

  const settings: ReservationSettings = {
    holdDurationSeconds: HOLD_DURATION_SECONDS,
    lockTimeoutMs: 60_000,
    transactionTimeoutMs: 90_000,
  };

  function nextStudentId(): string {
    studentCounter += 1;
    return `${studentPrefix}${String(studentCounter).padStart(13, '0')}`;
  }

  async function startInstance(instanceSettings: ReservationSettings): Promise<Instance> {
    const prisma = createPrismaClient(url as string);
    const app = createApp({
      internalApiKey: API_KEY,
      logger: pino({ level: 'silent' }),
      databaseProbe: new PrismaDatabaseProbe(prisma),
      classService: new PrismaClassService(prisma),
      holdService: new PrismaHoldService(prisma, instanceSettings),
    });
    const server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const { port } = server.address() as AddressInfo;
    return { prisma, server, baseUrl: `http://127.0.0.1:${port}` };
  }

  async function reserve(
    classId: string,
    studentId: string,
    instance: Instance = instances[studentCounter % instances.length]!,
  ): Promise<ReserveResult> {
    const res = await fetch(`${instance.baseUrl}/holds`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [INTERNAL_API_KEY_HEADER]: API_KEY },
      body: JSON.stringify({ classId, studentId }),
    });
    const body = (await res.json()) as { data?: ReserveResult['data']; error?: { code: string } };
    return { status: res.status, code: body.error?.code, data: body.data };
  }

  function reserveConcurrently(requests: { classId: string; studentId: string }[]) {
    return Promise.all(
      requests.map((r, i) => reserve(r.classId, r.studentId, instances[i % instances.length])),
    );
  }

  async function act(
    action: 'confirm' | 'cancel',
    holdId: string,
    studentId: string,
    instance: Instance = instances[0]!,
  ): Promise<ReserveResult> {
    const res = await fetch(`${instance.baseUrl}/holds/${holdId}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [INTERNAL_API_KEY_HEADER]: API_KEY },
      body: JSON.stringify({ studentId }),
    });
    const body = (await res.json()) as { data?: HoldDto; error?: { code: string } };
    return { status: res.status, code: body.error?.code, data: body.data };
  }

  async function getJson(path: string) {
    const res = await fetch(`${instances[0]!.baseUrl}${path}`, {
      headers: { [INTERNAL_API_KEY_HEADER]: API_KEY },
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  async function insertExpiredHold(classId: string, studentId: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO admission_holds (class_id, student_id, created_at, expires_at)
       VALUES ($1, $2, now() - interval '20 minutes', now() - interval '10 minutes')
       RETURNING id`,
      [classId, studentId],
    );
    return rows[0]!.id;
  }

  async function createClass(label: string, totalSeats: number): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      'INSERT INTO admission_classes (name, total_seats) VALUES ($1, $2) RETURNING id',
      [`${runTag} ${label}`, totalSeats],
    );
    return rows[0]!.id;
  }

  async function activeCounts(classId: string) {
    const { rows } = await pool.query<{
      held: number;
      confirmed: number;
      distinct_students: number;
      total_seats: number;
      available: number;
    }>(
      `SELECT count(*) FILTER (WHERE h.status = 'HELD' AND h.expires_at > now())::int AS held,
              count(*) FILTER (WHERE h.status = 'CONFIRMED')::int AS confirmed,
              count(DISTINCT h.student_id) FILTER (
                WHERE h.status = 'CONFIRMED' OR (h.status = 'HELD' AND h.expires_at > now())
              )::int AS distinct_students,
              c.total_seats,
              v.available_seats AS available
       FROM admission_classes c
       JOIN admission_class_availability v ON v.class_id = c.id
       LEFT JOIN admission_holds h ON h.class_id = c.id
       WHERE c.id = $1
       GROUP BY c.total_seats, v.available_seats`,
      [classId],
    );
    return rows[0]!;
  }

  function tally(results: ReserveResult[]) {
    const counts: Record<string, number> = {};
    for (const r of results) {
      const key = r.status === 201 ? 'CREATED' : (r.code ?? String(r.status));
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, max: 4 });
    instances.push(await startInstance(settings), await startInstance(settings));
  });

  afterAll(async () => {
    for (const i of instances) {
      await new Promise((resolve) => i.server.close(resolve));
      await i.prisma.$disconnect();
    }
    await pool?.end();
  });

  it('returns the hold contract with expiry computed from database time', async () => {
    const classId = await createClass('contract', 5);
    const studentId = nextStudentId();

    const before = (await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!
      .now;
    const result = await reserve(classId, studentId);
    const after = (await pool.query<{ now: Date }>('SELECT clock_timestamp() AS now')).rows[0]!.now;

    expect(result.status).toBe(201);
    expect(result.data).toMatchObject({ classId, studentId, status: 'HELD', confirmedAt: null });
    expect(result.data!.holdId).toMatch(/^[0-9a-f-]{36}$/);

    const createdAt = Date.parse(result.data!.createdAt);
    const expiresAt = Date.parse(result.data!.expiresAt);
    expect(expiresAt - createdAt).toBe(HOLD_DURATION_SECONDS * 1000);
    expect(createdAt).toBeGreaterThanOrEqual(before.getTime() - 1);
    expect(createdAt).toBeLessThanOrEqual(after.getTime() + 1);

    const { rows } = await pool.query(
      'SELECT status, expires_at FROM admission_holds WHERE id = $1',
      [result.data!.holdId],
    );
    expect(rows[0].status).toBe('HELD');
    expect(rows[0].expires_at.toISOString()).toBe(result.data!.expiresAt);
  });

  it('class with 1 seat, 50 concurrent students: exactly one hold', async () => {
    const classId = await createClass('one-seat', 1);
    const results = await reserveConcurrently(
      Array.from({ length: 50 }, () => ({ classId, studentId: nextStudentId() })),
    );

    expect(tally(results)).toEqual({ CREATED: 1, SEATS_FULL: 49 });
    expect(await activeCounts(classId)).toMatchObject({ held: 1, confirmed: 0, available: 0 });
  });

  it('class with 10 seats, 100 concurrent students: exactly ten holds', async () => {
    const classId = await createClass('ten-seats', 10);
    const results = await reserveConcurrently(
      Array.from({ length: 100 }, () => ({ classId, studentId: nextStudentId() })),
    );

    expect(tally(results)).toEqual({ CREATED: 10, SEATS_FULL: 90 });
    const counts = await activeCounts(classId);
    expect(counts).toMatchObject({ held: 10, distinct_students: 10, available: 0 });

    const winners = results.filter((r) => r.status === 201).map((r) => r.data!.studentId);
    expect(new Set(winners).size).toBe(10);
  });

  it('same student sending 30 concurrent requests gets exactly one hold', async () => {
    const classId = await createClass('same-student', 20);
    const studentId = nextStudentId();
    const results = await reserveConcurrently(
      Array.from({ length: 30 }, () => ({ classId, studentId })),
    );

    expect(tally(results)).toEqual({ CREATED: 1, DUPLICATE_APPLICATION: 29 });
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM admission_holds WHERE class_id = $1 AND student_id = $2',
      [classId, studentId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('mixed duplicates and competition never exceed capacity or duplicate a student', async () => {
    const classId = await createClass('mixed', 3);
    const students = Array.from({ length: 10 }, () => nextStudentId());
    const requests = students.flatMap((studentId) =>
      Array.from({ length: 4 }, () => ({ classId, studentId })),
    );
    const results = await reserveConcurrently(requests.sort(() => Math.random() - 0.5));

    const counted = tally(results);
    expect(counted.CREATED).toBe(3);
    expect((counted.SEATS_FULL ?? 0) + (counted.DUPLICATE_APPLICATION ?? 0)).toBe(37);
    expect(await activeCounts(classId)).toMatchObject({ held: 3, distinct_students: 3 });
  });

  it('different classes accept requests independently and concurrently', async () => {
    const seats = [1, 3, 5, 7, 12];
    const classIds = await Promise.all(seats.map((s, i) => createClass(`independent-${i}`, s)));
    const requests = classIds
      .flatMap((classId) =>
        Array.from({ length: 25 }, () => ({ classId, studentId: nextStudentId() })),
      )
      .sort(() => Math.random() - 0.5);

    const results = await reserveConcurrently(requests);

    for (const [i, classId] of classIds.entries()) {
      const forClass = results.filter((_, idx) => requests[idx]!.classId === classId);
      expect(tally(forClass)).toEqual({ CREATED: seats[i], SEATS_FULL: 25 - seats[i]! });
      expect(await activeCounts(classId)).toMatchObject({ held: seats[i], available: 0 });
    }
  });

  it('one student can hold seats in different classes at the same time', async () => {
    const classA = await createClass('student-multi-a', 2);
    const classB = await createClass('student-multi-b', 2);
    const studentId = nextStudentId();

    const results = await reserveConcurrently([
      { classId: classA, studentId },
      { classId: classB, studentId },
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
  });

  it('confirmed seats count toward capacity', async () => {
    const classId = await createClass('confirmed', 2);
    for (let i = 0; i < 2; i++) {
      await pool.query(
        `INSERT INTO admission_holds (class_id, student_id, status, expires_at, confirmed_at)
         VALUES ($1, $2, 'CONFIRMED', now() + interval '10 minutes', now())`,
        [classId, nextStudentId()],
      );
    }
    const result = await reserve(classId, nextStudentId());
    expect(result.code).toBe('SEATS_FULL');
  });

  it('expired holds release their seat, become EXPIRED and stay as history', async () => {
    const classId = await createClass('expiry', 1);
    const expiredStudent = nextStudentId();
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO admission_holds (class_id, student_id, created_at, expires_at)
       VALUES ($1, $2, now() - interval '20 minutes', now() - interval '10 minutes')
       RETURNING id`,
      [classId, expiredStudent],
    );

    const results = await reserveConcurrently(
      Array.from({ length: 10 }, () => ({ classId, studentId: nextStudentId() })),
    );
    expect(tally(results)).toEqual({ CREATED: 1, SEATS_FULL: 9 });

    const old = await pool.query('SELECT status FROM admission_holds WHERE id = $1', [rows[0]!.id]);
    expect(old.rows[0].status).toBe('EXPIRED');
  });

  it('a student whose hold expired can apply to the same class again', async () => {
    const classId = await createClass('reapply', 2);
    const studentId = nextStudentId();
    await pool.query(
      `INSERT INTO admission_holds (class_id, student_id, created_at, expires_at)
       VALUES ($1, $2, now() - interval '20 minutes', now() - interval '10 minutes')`,
      [classId, studentId],
    );

    const result = await reserve(classId, studentId);
    expect(result.status).toBe(201);

    const { rows } = await pool.query(
      'SELECT status FROM admission_holds WHERE class_id = $1 AND student_id = $2 ORDER BY created_at',
      [classId, studentId],
    );
    expect(rows.map((r) => r.status)).toEqual(['EXPIRED', 'HELD']);
  });

  it('returns NOT_FOUND for a class that does not exist', async () => {
    const result = await reserve(randomUUID(), nextStudentId());
    expect(result).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('returns VALIDATION_ERROR for invalid input', async () => {
    const classId = await createClass('validation', 1);
    const result = await reserve(classId, '12345');
    expect(result).toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    expect((await activeCounts(classId)).held).toBe(0);
  });

  it('fails fast with SERVICE_BUSY and creates nothing when the class lock cannot be acquired', async () => {
    const classId = await createClass('lock-timeout', 5);
    const impatient = await startInstance({
      ...settings,
      lockTimeoutMs: 300,
      transactionTimeoutMs: 5_000,
    });
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT 1 FROM admission_classes WHERE id = $1 FOR UPDATE', [classId]);

      const result = await reserve(classId, nextStudentId(), impatient);
      expect(result).toMatchObject({ status: 503, code: 'SERVICE_BUSY' });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await new Promise((resolve) => impatient.server.close(resolve));
      await impatient.prisma.$disconnect();
    }
    expect((await activeCounts(classId)).held).toBe(0);
  });

  describe('hold lifecycle', () => {
    it('owner confirms a hold; confirming again is idempotent', async () => {
      const classId = await createClass('confirm', 2);
      const studentId = nextStudentId();
      const hold = (await reserve(classId, studentId)).data!;

      const first = await act('confirm', hold.holdId, studentId);
      expect(first.status).toBe(200);
      expect(first.data).toMatchObject({ holdId: hold.holdId, status: 'CONFIRMED' });
      expect(first.data!.confirmedAt).not.toBeNull();

      const again = await act('confirm', hold.holdId, studentId);
      expect(again.data).toEqual(first.data);
      expect(await activeCounts(classId)).toMatchObject({ held: 0, confirmed: 1, available: 1 });
    });

    it('another student cannot confirm or cancel the hold', async () => {
      const classId = await createClass('ownership', 2);
      const owner = nextStudentId();
      const intruder = nextStudentId();
      const hold = (await reserve(classId, owner)).data!;

      expect(await act('confirm', hold.holdId, intruder)).toMatchObject({
        status: 403,
        code: 'HOLD_NOT_OWNED',
      });
      expect(await act('cancel', hold.holdId, intruder)).toMatchObject({
        status: 403,
        code: 'HOLD_NOT_OWNED',
      });
      const { rows } = await pool.query('SELECT status FROM admission_holds WHERE id = $1', [
        hold.holdId,
      ]);
      expect(rows[0].status).toBe('HELD');
    });

    it('cancelling releases the seat; cancelling again is idempotent', async () => {
      const classId = await createClass('cancel', 1);
      const studentId = nextStudentId();
      const hold = (await reserve(classId, studentId)).data!;
      expect((await reserve(classId, nextStudentId())).code).toBe('SEATS_FULL');

      const cancelled = await act('cancel', hold.holdId, studentId);
      expect(cancelled).toMatchObject({ status: 200, data: { status: 'CANCELLED' } });
      expect((await act('cancel', hold.holdId, studentId)).status).toBe(200);

      expect((await reserve(classId, nextStudentId())).status).toBe(201);
      expect((await act('confirm', hold.holdId, studentId)).code).toBe('HOLD_NOT_ACTIVE');
    });

    it('a confirmed hold cannot be cancelled', async () => {
      const classId = await createClass('confirmed-cancel', 1);
      const studentId = nextStudentId();
      const hold = (await reserve(classId, studentId)).data!;
      await act('confirm', hold.holdId, studentId);

      expect(await act('cancel', hold.holdId, studentId)).toMatchObject({
        status: 409,
        code: 'HOLD_ALREADY_CONFIRMED',
      });
    });

    it('an expired hold cannot be confirmed or cancelled', async () => {
      const classId = await createClass('expired-actions', 1);
      const studentId = nextStudentId();
      const holdId = await insertExpiredHold(classId, studentId);

      expect(await act('confirm', holdId, studentId)).toMatchObject({
        status: 409,
        code: 'HOLD_EXPIRED',
      });
      expect(await act('cancel', holdId, studentId)).toMatchObject({
        status: 409,
        code: 'HOLD_EXPIRED',
      });
    });

    it('returns NOT_FOUND for an unknown hold', async () => {
      const result = await act('confirm', randomUUID(), nextStudentId());
      expect(result).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect((await getJson(`/holds/${randomUUID()}`)).status).toBe(404);
    });

    it('concurrent confirm and cancel of one hold: exactly one wins', async () => {
      for (let round = 0; round < 10; round++) {
        const classId = await createClass(`confirm-vs-cancel-${round}`, 1);
        const studentId = nextStudentId();
        const hold = (await reserve(classId, studentId)).data!;

        const [confirm, cancel] = await Promise.all([
          act('confirm', hold.holdId, studentId, instances[0]),
          act('cancel', hold.holdId, studentId, instances[1]),
        ]);

        const { rows } = await pool.query('SELECT status FROM admission_holds WHERE id = $1', [
          hold.holdId,
        ]);
        if (rows[0].status === 'CONFIRMED') {
          expect(confirm.status).toBe(200);
          expect(cancel.code).toBe('HOLD_ALREADY_CONFIRMED');
        } else {
          expect(rows[0].status).toBe('CANCELLED');
          expect(cancel.status).toBe(200);
          expect(confirm.code).toBe('HOLD_NOT_ACTIVE');
        }
      }
    });

    it('an expired hold confirmed while others compete never yields two seats', async () => {
      const classId = await createClass('expiry-race', 1);
      const lateStudent = nextStudentId();
      const holdId = await insertExpiredHold(classId, lateStudent);

      const [confirm, ...others] = await Promise.all([
        act('confirm', holdId, lateStudent),
        ...Array.from({ length: 20 }, () => reserve(classId, nextStudentId())),
      ]);

      expect(confirm.code).toBe('HOLD_EXPIRED');
      expect(tally(others)).toEqual({ CREATED: 1, SEATS_FULL: 19 });
      expect(await activeCounts(classId)).toMatchObject({ held: 1, confirmed: 0 });
    });

    it('a cancellation racing with new requests frees exactly one seat', async () => {
      const classId = await createClass('cancel-race', 1);
      const holder = nextStudentId();
      const hold = (await reserve(classId, holder)).data!;

      const [cancel, ...others] = await Promise.all([
        act('cancel', hold.holdId, holder),
        ...Array.from({ length: 20 }, () => reserve(classId, nextStudentId())),
      ]);

      expect(cancel.status).toBe(200);
      const created = others.filter((r) => r.status === 201).length;
      expect(created).toBeLessThanOrEqual(1);
      expect((await activeCounts(classId)).held).toBe(created);
    });

    it('getHold and listStudentHolds report expiry by database time and include the class name', async () => {
      const classId = await createClass('reads', 3);
      const studentId = nextStudentId();
      const expiredId = await insertExpiredHold(classId, studentId);
      const otherClass = await createClass('reads-other', 3);
      const live = (await reserve(otherClass, studentId)).data!;

      const expired = await getJson(`/holds/${expiredId}`);
      expect(expired.status).toBe(200);
      expect((expired.body.data as HoldDto).status).toBe('EXPIRED');

      const list = await getJson(`/students/${studentId}/holds`);
      const holds = list.body.data as (HoldDto & { className: string })[];
      expect(holds.map((h) => [h.holdId, h.status, h.className])).toEqual([
        [live.holdId, 'HELD', `${runTag} reads-other`],
        [expiredId, 'EXPIRED', `${runTag} reads`],
      ]);
    });

    it('getClass returns availability for one class', async () => {
      const classId = await createClass('get-class', 4);
      await reserve(classId, nextStudentId());
      const res = await getJson(`/classes/${classId}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        id: classId,
        totalSeats: 4,
        heldSeats: 1,
        confirmedSeats: 0,
        availableSeats: 3,
      });
    });
  });

  it('invariant holds for every class created by this run', async () => {
    const { rows } = await pool.query(
      `SELECT c.name, c.total_seats,
              count(h.id) FILTER (
                WHERE h.status = 'CONFIRMED' OR (h.status = 'HELD' AND h.expires_at > now())
              )::int AS occupied
       FROM admission_classes c
       LEFT JOIN admission_holds h ON h.class_id = c.id
       WHERE c.name LIKE $1
       GROUP BY c.id`,
      [`${runTag} %`],
    );
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.occupied, row.name).toBeLessThanOrEqual(row.total_seats);
    }
  });
});
