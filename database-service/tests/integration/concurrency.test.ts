import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INTERNAL_API_KEY_HEADER } from '../../src/middleware/internal-auth.js';
import type { HoldDto } from '../../src/types/holds.js';

const url = process.env.TEST_DATABASE_URL;
const dedicated = process.env.TEST_DATABASE_DEDICATED === 'true';
const ROUNDS = Number(process.env.CONCURRENCY_ROUNDS ?? 5);
const PROCESSES = 3;
const API_KEY = 'concurrency-internal-key-1234567890';
const serviceRoot = fileURLToPath(new URL('../..', import.meta.url));

interface Result {
  status: number;
  code?: string | undefined;
  data?: HoldDto | undefined;
}

interface Sample {
  total: number;
  held: number;
  confirmed: number;
  available: number;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForReady(baseUrl: string, child: ChildProcess, output: () => string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`service process exited with ${child.exitCode}: ${output()}`);
    }
    try {
      const res = await fetch(`${baseUrl}/health/ready`, {
        headers: { [INTERNAL_API_KEY_HEADER]: API_KEY },
      });
      if (res.status === 200) return;
    } catch {
      void 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`service at ${baseUrl} did not become ready: ${output()}`);
}

describe.skipIf(!url || !dedicated)(
  `concurrency across ${PROCESSES} separate service processes sharing PostgreSQL`,
  () => {
    const tag = `cc-${randomUUID().slice(0, 8)}`;
    const studentPrefix = String(randomInt(1000, 9999));
    let counter = 0;
    const nextStudent = () => `${studentPrefix}${String(++counter).padStart(13, '0')}`;
    const children: ChildProcess[] = [];
    const baseUrls: string[] = [];
    let pool: pg.Pool;

    const instance = (i: number) => baseUrls[i % baseUrls.length]!;

    async function call(base: string, path: string, body: object): Promise<Result> {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [INTERNAL_API_KEY_HEADER]: API_KEY },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { data?: HoldDto; error?: { code: string } };
      return { status: res.status, code: json.error?.code, data: json.data };
    }

    const reserve = (classId: string, studentId: string, i: number) =>
      call(instance(i), '/holds', { classId, studentId });
    const confirm = (holdId: string, studentId: string, i: number) =>
      call(instance(i), `/holds/${holdId}/confirm`, { studentId });
    const cancel = (holdId: string, studentId: string, i: number) =>
      call(instance(i), `/holds/${holdId}/cancel`, { studentId });

    function tally(results: Result[]) {
      const counts: Record<string, number> = {};
      for (const r of results) {
        const key =
          r.status === 201 ? 'CREATED' : r.status === 200 ? 'OK' : (r.code ?? `${r.status}`);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    }

    async function createClass(label: string, totalSeats: number) {
      const { rows } = await pool.query<{ id: string }>(
        'INSERT INTO admission_classes (name, total_seats) VALUES ($1, $2) RETURNING id',
        [`${tag} ${label}`, totalSeats],
      );
      return rows[0]!.id;
    }

    async function sample(classId: string): Promise<Sample> {
      const { rows } = await pool.query<Sample>(
        `SELECT total_seats AS total, held_seats AS held, confirmed_seats AS confirmed,
                available_seats AS available
         FROM admission_class_availability WHERE class_id = $1`,
        [classId],
      );
      return rows[0]!;
    }

    async function apiSample(classId: string, i: number): Promise<Sample> {
      const res = await fetch(`${instance(i)}/classes/${classId}`, {
        headers: { [INTERNAL_API_KEY_HEADER]: API_KEY },
      });
      const { data } = (await res.json()) as {
        data: {
          totalSeats: number;
          heldSeats: number;
          confirmedSeats: number;
          availableSeats: number;
        };
      };
      return {
        total: data.totalSeats,
        held: data.heldSeats,
        confirmed: data.confirmedSeats,
        available: data.availableSeats,
      };
    }

    async function duringBurst<T>(classId: string, burst: Promise<T>) {
      const samples: Sample[] = [];
      let done = false;
      const watcher = (async () => {
        let i = 0;
        while (!done) {
          const [db, api] = await Promise.all([sample(classId), apiSample(classId, i++)]);
          samples.push(db, api);
        }
      })();
      const result = await burst.finally(() => {
        done = true;
      });
      await watcher;
      samples.push(await sample(classId));
      return { result, samples };
    }

    function expectSamplesValid(samples: Sample[]) {
      expect(samples.length).toBeGreaterThan(2);
      for (const s of samples) {
        expect(s.available).toBeGreaterThanOrEqual(0);
        expect(s.held + s.confirmed).toBeLessThanOrEqual(s.total);
        expect(s.available).toBe(s.total - s.held - s.confirmed);
      }
    }

    async function rowCounts(classId: string) {
      const { rows } = await pool.query<{ held: number; confirmed: number; students: number }>(
        `SELECT count(*) FILTER (WHERE status = 'HELD' AND expires_at > now())::int AS held,
                count(*) FILTER (WHERE status = 'CONFIRMED')::int AS confirmed,
                count(DISTINCT student_id) FILTER (
                  WHERE status = 'CONFIRMED' OR (status = 'HELD' AND expires_at > now())
                )::int AS students
         FROM admission_holds WHERE class_id = $1`,
        [classId],
      );
      return rows[0]!;
    }

    beforeAll(async () => {
      pool = new pg.Pool({ connectionString: url, max: 4 });
      for (let i = 0; i < PROCESSES; i++) {
        const port = await freePort();
        let output = '';
        const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
          cwd: serviceRoot,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            HOST: '127.0.0.1',
            PORT: String(port),
            DATABASE_URL: url,
            DATABASE_POOL_MAX: '10',
            INTERNAL_API_KEY: API_KEY,
            LOG_LEVEL: 'error',
            HOLD_DURATION_SECONDS: '600',
            RESERVATION_LOCK_TIMEOUT_MS: '60000',
            RESERVATION_TX_TIMEOUT_MS: '90000',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stdout?.on('data', (d: Buffer) => (output += d.toString()));
        child.stderr?.on('data', (d: Buffer) => (output += d.toString()));
        children.push(child);
        const base = `http://127.0.0.1:${port}`;
        await waitForReady(base, child, () => output);
        baseUrls.push(base);
      }
    }, 120_000);

    afterAll(async () => {
      for (const child of children) {
        if (child.exitCode === null) {
          const exited = new Promise((resolve) => child.once('exit', resolve));
          child.kill();
          await exited;
        }
      }
      await pool?.end();
    });

    it('runs as separate OS processes', () => {
      expect(baseUrls).toHaveLength(PROCESSES);
      const pids = new Set(children.map((c) => c.pid));
      expect(pids.size).toBe(PROCESSES);
      expect(pids.has(process.pid)).toBe(false);
    });

    it(`10 seats, 100 concurrent distinct students: exactly 10 holds and 90 SEATS_FULL, ${ROUNDS} rounds`, async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const classId = await createClass(`ten-${round}`, 10);
        const students = Array.from({ length: 100 }, () => nextStudent());
        const { result, samples } = await duringBurst(
          classId,
          Promise.all(students.map((s, i) => reserve(classId, s, i))),
        );

        expect(tally(result), `round ${round}`).toEqual({ CREATED: 10, SEATS_FULL: 90 });
        expectSamplesValid(samples);
        expect(await rowCounts(classId)).toEqual({ held: 10, confirmed: 0, students: 10 });
        expect(await sample(classId)).toEqual({ total: 10, held: 10, confirmed: 0, available: 0 });

        const winners = result.filter((r) => r.status === 201).map((r) => r.data!.studentId);
        expect(new Set(winners).size).toBe(10);
        for (const w of winners) expect(students).toContain(w);
      }
    }, 300_000);

    it(`1 seat, 50 concurrent distinct students: exactly 1 hold, ${ROUNDS} rounds`, async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const classId = await createClass(`one-${round}`, 1);
        const { result, samples } = await duringBurst(
          classId,
          Promise.all(Array.from({ length: 50 }, (_, i) => reserve(classId, nextStudent(), i))),
        );

        expect(tally(result), `round ${round}`).toEqual({ CREATED: 1, SEATS_FULL: 49 });
        expectSamplesValid(samples);
        expect(await rowCounts(classId)).toEqual({ held: 1, confirmed: 0, students: 1 });
      }
    }, 300_000);

    it('same student, 30 simultaneous requests across processes: exactly one hold', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const classId = await createClass(`same-${round}`, 20);
        const studentId = nextStudent();
        const results = await Promise.all(
          Array.from({ length: 30 }, (_, i) => reserve(classId, studentId, i)),
        );

        expect(tally(results), `round ${round}`).toEqual({ CREATED: 1, DUPLICATE_APPLICATION: 29 });
        const { rows } = await pool.query(
          'SELECT count(*)::int AS n FROM admission_holds WHERE class_id = $1 AND student_id = $2',
          [classId, studentId],
        );
        expect(rows[0].n).toBe(1);
      }
    }, 120_000);

    it('same student racing for the last seat against other students: one seat, no duplicates', async () => {
      const classId = await createClass('same-vs-others', 2);
      const repeat = nextStudent();
      const requests = [
        ...Array.from({ length: 15 }, () => repeat),
        ...Array.from({ length: 15 }, () => nextStudent()),
      ].sort(() => Math.random() - 0.5);
      const results = await Promise.all(requests.map((s, i) => reserve(classId, s, i)));

      const counted = tally(results);
      expect(counted.CREATED).toBe(2);
      expect((counted.SEATS_FULL ?? 0) + (counted.DUPLICATE_APPLICATION ?? 0)).toBe(28);
      const repeatWins = results.filter((r, i) => r.status === 201 && requests[i] === repeat);
      expect(repeatWins.length).toBeLessThanOrEqual(1);
      expect(await rowCounts(classId)).toMatchObject({ held: 2, students: 2 });
    });

    it('owner confirming 20 times at once across processes: all succeed with one confirmation', async () => {
      const classId = await createClass('confirm-many', 1);
      const studentId = nextStudent();
      const hold = (await reserve(classId, studentId, 0)).data!;

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => confirm(hold.holdId, studentId, i)),
      );
      expect(tally(results)).toEqual({ OK: 20 });
      const confirmedAt = new Set(results.map((r) => r.data!.confirmedAt));
      expect(confirmedAt.size).toBe(1);
      expect([...confirmedAt][0]).not.toBeNull();
      expect(await rowCounts(classId)).toEqual({ held: 0, confirmed: 1, students: 1 });
    });

    it('owner cancelling 20 times at once across processes: all succeed, seat freed once', async () => {
      const classId = await createClass('cancel-many', 1);
      const studentId = nextStudent();
      const hold = (await reserve(classId, studentId, 0)).data!;

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => cancel(hold.holdId, studentId, i)),
      );
      expect(tally(results)).toEqual({ OK: 20 });
      expect(results.every((r) => r.data!.status === 'CANCELLED')).toBe(true);
      expect(await sample(classId)).toMatchObject({ held: 0, available: 1 });
    });

    it(`10 confirms and 10 cancels of one hold at once: one outcome wins, ${ROUNDS * 2} rounds`, async () => {
      for (let round = 0; round < ROUNDS * 2; round++) {
        const classId = await createClass(`confirm-cancel-${round}`, 1);
        const studentId = nextStudent();
        const hold = (await reserve(classId, studentId, round)).data!;

        const ops = Array.from({ length: 20 }, (_, i) =>
          i % 2 === 0 ? ('confirm' as const) : ('cancel' as const),
        ).sort(() => Math.random() - 0.5);
        const results = await Promise.all(
          ops.map((op, i) =>
            op === 'confirm'
              ? confirm(hold.holdId, studentId, i)
              : cancel(hold.holdId, studentId, i),
          ),
        );
        const confirms = results.filter((_, i) => ops[i] === 'confirm');
        const cancels = results.filter((_, i) => ops[i] === 'cancel');

        const { rows } = await pool.query('SELECT status FROM admission_holds WHERE id = $1', [
          hold.holdId,
        ]);
        const final = rows[0].status as string;

        if (final === 'CONFIRMED') {
          expect(tally(confirms)).toEqual({ OK: 10 });
          expect(tally(cancels)).toEqual({ HOLD_ALREADY_CONFIRMED: 10 });
          expect(await sample(classId)).toMatchObject({ confirmed: 1, available: 0 });
        } else {
          expect(final).toBe('CANCELLED');
          expect(tally(cancels)).toEqual({ OK: 10 });
          expect(tally(confirms)).toEqual({ HOLD_NOT_ACTIVE: 10 });
          expect(await sample(classId)).toMatchObject({ confirmed: 0, held: 0, available: 1 });
        }
      }
    }, 120_000);

    it('a different student racing the owner never changes the hold', async () => {
      const classId = await createClass('intruder-race', 1);
      const owner = nextStudent();
      const intruder = nextStudent();
      const hold = (await reserve(classId, owner, 0)).data!;

      const results = await Promise.all([
        ...Array.from({ length: 10 }, (_, i) => confirm(hold.holdId, intruder, i)),
        ...Array.from({ length: 10 }, (_, i) => cancel(hold.holdId, intruder, i)),
        confirm(hold.holdId, owner, 1),
      ]);
      expect(tally(results.slice(0, 20))).toEqual({ HOLD_NOT_OWNED: 20 });
      expect(results[20]!.status).toBe(200);
      const { rows } = await pool.query('SELECT status FROM admission_holds WHERE id = $1', [
        hold.holdId,
      ]);
      expect(rows[0].status).toBe('CONFIRMED');
    });

    it('expired seats are released exactly once while 40 students compete', async () => {
      const classId = await createClass('expired-release', 5);
      const expired: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { rows } = await pool.query<{ id: string }>(
          `INSERT INTO admission_holds (class_id, student_id, created_at, expires_at)
           VALUES ($1, $2, now() - interval '20 minutes', now() - interval '10 minutes')
           RETURNING id`,
          [classId, nextStudent()],
        );
        expired.push(rows[0]!.id);
      }

      const { result, samples } = await duringBurst(
        classId,
        Promise.all(Array.from({ length: 40 }, (_, i) => reserve(classId, nextStudent(), i))),
      );
      expect(tally(result)).toEqual({ CREATED: 5, SEATS_FULL: 35 });
      expectSamplesValid(samples);
      const { rows } = await pool.query(
        'SELECT status, count(*)::int AS n FROM admission_holds WHERE id = ANY($1::uuid[]) GROUP BY status',
        [expired],
      );
      expect(rows).toEqual([{ status: 'EXPIRED', n: 5 }]);
    });

    it('mixed confirms, cancels and new applications never oversell', async () => {
      for (let round = 0; round < ROUNDS; round++) {
        const classId = await createClass(`mixed-${round}`, 5);
        const holders = Array.from({ length: 5 }, () => nextStudent());
        const held: HoldDto[] = [];
        for (const [i, s] of holders.entries()) held.push((await reserve(classId, s, i)).data!);

        const { result, samples } = await duringBurst(
          classId,
          Promise.all([
            cancel(held[0]!.holdId, holders[0]!, 0),
            cancel(held[1]!.holdId, holders[1]!, 1),
            confirm(held[2]!.holdId, holders[2]!, 2),
            confirm(held[3]!.holdId, holders[3]!, 0),
            confirm(held[4]!.holdId, holders[4]!, 1),
            ...Array.from({ length: 30 }, (_, i) => reserve(classId, nextStudent(), i)),
          ]),
        );

        expect(tally(result.slice(0, 5)), `round ${round}`).toEqual({ OK: 5 });
        const created = result.slice(5).filter((r) => r.status === 201).length;
        const full = result.slice(5).filter((r) => r.code === 'SEATS_FULL').length;
        expect(created + full).toBe(30);
        expect(created).toBeLessThanOrEqual(2);
        expectSamplesValid(samples);

        const counts = await rowCounts(classId);
        expect(counts.confirmed).toBe(3);
        expect(counts.held).toBe(created);
        expect(await sample(classId)).toMatchObject({ available: 2 - created });
      }
    }, 120_000);

    it('capacity invariant holds for every class created by this suite', async () => {
      const { rows } = await pool.query(
        `SELECT c.name, c.total_seats, v.available_seats,
                count(h.id) FILTER (
                  WHERE h.status = 'CONFIRMED' OR (h.status = 'HELD' AND h.expires_at > now())
                )::int AS occupied
         FROM admission_classes c
         JOIN admission_class_availability v ON v.class_id = c.id
         LEFT JOIN admission_holds h ON h.class_id = c.id
         WHERE c.name LIKE $1
         GROUP BY c.id, v.available_seats`,
        [`${tag} %`],
      );
      expect(rows.length).toBeGreaterThanOrEqual(ROUNDS * 4 + 6);
      for (const row of rows) {
        expect(row.occupied, row.name).toBeLessThanOrEqual(row.total_seats);
        expect(row.available_seats, row.name).toBeGreaterThanOrEqual(0);
      }
    });
  },
);
