import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import type { AdmissionClass, HoldStatus, StudentHold } from '../types/api';
import { apiBaseUrl } from '../utils/config';

export const HOLD_SECONDS = 600;
export const STUDENT = '20152691234567890';
export const OTHER_STUDENT = '20152691234567891';
const STUDENT_ID = /^[0-9]{17}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface ClassRow {
  id: string;
  name: string;
  totalSeats: number;
}

interface HoldRow {
  holdId: string;
  classId: string;
  studentId: string;
  status: HoldStatus;
  createdAt: number;
  expiresAt: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  studentId: string | null;
  body: unknown;
}

let sequence = 0;
const uuid = (prefix: number) =>
  `${prefix.toString(16).padStart(8, '0')}-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`;

export function problem(
  status: number,
  code: string,
  detail: string,
  errors?: Record<string, string[]>,
) {
  return HttpResponse.json(
    {
      type: 'about:blank',
      title: code,
      status,
      detail,
      code,
      traceId: `trace-${sequence}`,
      ...(errors ? { errors } : {}),
    },
    { status, headers: { 'Content-Type': 'application/problem+json' } },
  );
}

export function createFakeBackend() {
  const classes = new Map<string, ClassRow>();
  const holds = new Map<string, HoldRow>();
  const requests: RecordedRequest[] = [];

  const effective = (h: HoldRow): HoldStatus =>
    h.status === 'HELD' && h.expiresAt <= Date.now() ? 'EXPIRED' : h.status;

  const availability = (c: ClassRow): AdmissionClass => {
    const forClass = [...holds.values()].filter((h) => h.classId === c.id);
    const heldSeats = forClass.filter((h) => effective(h) === 'HELD').length;
    const confirmedSeats = forClass.filter((h) => h.status === 'CONFIRMED').length;
    return {
      ...c,
      heldSeats,
      confirmedSeats,
      availableSeats: c.totalSeats - heldSeats - confirmedSeats,
    };
  };

  const publicHold = (h: HoldRow) => ({
    holdId: h.holdId,
    classId: h.classId,
    status: effective(h),
    expiresAt: new Date(h.expiresAt).toISOString(),
  });

  const student = (request: Request) => {
    const value = request.headers.get('x-student-id');
    if (value === null)
      return { error: problem(401, 'STUDENT_ID_REQUIRED', 'X-Student-Id header is required') };
    if (!STUDENT_ID.test(value)) {
      return {
        error: problem(400, 'VALIDATION_ERROR', 'Invalid student id', {
          'X-Student-Id': ['Must be exactly 17 digits'],
        }),
      };
    }
    return { id: value };
  };

  const ownedHold = (request: Request, holdId: string) => {
    const who = student(request);
    if (who.error) return { error: who.error };
    const hold = holds.get(holdId);
    if (!hold) return { error: problem(404, 'NOT_FOUND', `Hold ${holdId} not found`) };
    if (hold.studentId !== who.id) {
      return { error: problem(403, 'HOLD_NOT_OWNED', 'This hold belongs to a different student') };
    }
    return { hold };
  };

  const url = (path: string) => `${apiBaseUrl}${path}`;

  const handlers = [
    http.get(url('/classes'), () => HttpResponse.json([...classes.values()].map(availability))),

    http.post(url('/classes'), async ({ request }) => {
      const body = (await request.json()) as { name?: unknown; totalSeats?: unknown };
      const errors: Record<string, string[]> = {};
      const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
      if (name.length === 0 || name.length > 100) errors.Name = ['Name must be 1-100 characters'];
      const seats = body.totalSeats;
      if (typeof seats !== 'number' || !Number.isInteger(seats) || seats < 1 || seats > 10_000) {
        errors.TotalSeats = ['TotalSeats must be between 1 and 10000'];
      }
      if (Object.keys(errors).length > 0) {
        return problem(400, 'VALIDATION_ERROR', 'One or more validation errors occurred.', errors);
      }
      if ([...classes.values()].some((c) => c.name === name)) {
        return problem(409, 'CLASS_NAME_TAKEN', `A class named "${name}" already exists`);
      }
      const row = { id: uuid(1), name, totalSeats: seats as number };
      classes.set(row.id, row);
      return HttpResponse.json(row, { status: 201, headers: { Location: `/classes/${row.id}` } });
    }),

    http.get(url('/classes/:classId'), ({ params }) => {
      const id = String(params.classId);
      if (!UUID.test(id)) return problem(400, 'VALIDATION_ERROR', 'Invalid class id');
      const row = classes.get(id);
      return row
        ? HttpResponse.json(availability(row))
        : problem(404, 'NOT_FOUND', `Class ${id} not found`);
    }),

    http.post(url('/classes/:classId/holds'), ({ request, params }) => {
      const who = student(request);
      if (who.error) return who.error;
      const row = classes.get(String(params.classId));
      if (!row) return problem(404, 'NOT_FOUND', `Class ${String(params.classId)} not found`);
      const active = [...holds.values()].some(
        (h) =>
          h.classId === row.id &&
          h.studentId === who.id &&
          ['HELD', 'CONFIRMED'].includes(effective(h)),
      );
      if (active) {
        return problem(
          409,
          'DUPLICATE_APPLICATION',
          'Student already has an active application for this class',
        );
      }
      if (availability(row).availableSeats <= 0) {
        return problem(409, 'SEATS_FULL', `Class ${row.id} has no available seats`);
      }
      const now = Date.now();
      const hold: HoldRow = {
        holdId: uuid(2),
        classId: row.id,
        studentId: who.id,
        status: 'HELD',
        createdAt: now,
        expiresAt: now + HOLD_SECONDS * 1000,
      };
      holds.set(hold.holdId, hold);
      return HttpResponse.json(
        { ...publicHold(hold), studentId: who.id },
        { status: 201, headers: { Location: `/holds/${hold.holdId}` } },
      );
    }),

    http.get(url('/holds/:holdId'), ({ params }) => {
      const hold = holds.get(String(params.holdId));
      return hold
        ? HttpResponse.json(publicHold(hold))
        : problem(404, 'NOT_FOUND', `Hold ${String(params.holdId)} not found`);
    }),

    http.post(url('/holds/:holdId/confirm'), ({ request, params }) => {
      const owned = ownedHold(request, String(params.holdId));
      if (owned.error) return owned.error;
      const hold = owned.hold;
      const status = effective(hold);
      if (status === 'EXPIRED') {
        hold.status = 'EXPIRED';
        return problem(409, 'HOLD_EXPIRED', `Hold ${hold.holdId} has expired`);
      }
      if (status === 'CANCELLED')
        return problem(409, 'HOLD_NOT_ACTIVE', `Hold ${hold.holdId} has been cancelled`);
      hold.status = 'CONFIRMED';
      return HttpResponse.json({ holdId: hold.holdId, status: 'CONFIRMED' });
    }),

    http.delete(url('/holds/:holdId'), ({ request, params }) => {
      const owned = ownedHold(request, String(params.holdId));
      if (owned.error) return owned.error;
      const hold = owned.hold;
      const status = effective(hold);
      if (status === 'CONFIRMED')
        return problem(409, 'HOLD_ALREADY_CONFIRMED', 'Already confirmed');
      if (status === 'EXPIRED')
        return problem(409, 'HOLD_EXPIRED', `Hold ${hold.holdId} has expired`);
      hold.status = 'CANCELLED';
      return new HttpResponse(null, { status: 204 });
    }),

    http.get(url('/me/holds'), ({ request }) => {
      const who = student(request);
      if (who.error) return who.error;
      const mine: StudentHold[] = [...holds.values()]
        .filter((h) => h.studentId === who.id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((h) => ({ ...publicHold(h), className: classes.get(h.classId)!.name }));
      return HttpResponse.json(mine);
    }),
  ];

  return {
    handlers,
    requests,
    url,
    addClass(name: string, totalSeats: number) {
      const row = { id: uuid(1), name, totalSeats };
      classes.set(row.id, row);
      return row;
    },
    addHold(
      classId: string,
      studentId: string,
      overrides: Partial<Pick<HoldRow, 'status' | 'expiresAt'>> = {},
    ) {
      const now = Date.now();
      const hold: HoldRow = {
        holdId: uuid(2),
        classId,
        studentId,
        status: 'HELD',
        createdAt: now - holds.size,
        expiresAt: now + HOLD_SECONDS * 1000,
        ...overrides,
      };
      holds.set(hold.holdId, hold);
      return hold;
    },
    fill(classId: string, count: number, status: HoldStatus = 'CONFIRMED') {
      for (let i = 0; i < count; i++) {
        this.addHold(
          classId,
          `9${String(sequence).padStart(4, '0')}${String(i).padStart(12, '0')}`,
          { status },
        );
      }
    },
    holdStatus(holdId: string) {
      const hold = holds.get(holdId);
      return hold ? effective(hold) : undefined;
    },
    classAvailability(classId: string) {
      return availability(classes.get(classId)!);
    },
  };
}

export type FakeBackend = ReturnType<typeof createFakeBackend>;

export function setupFakeBackend() {
  const server = setupServer();
  const state: { backend: FakeBackend } = { backend: createFakeBackend() };

  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
    server.events.on('request:start', ({ request }) => {
      const path = new URL(request.url).pathname;
      const record: RecordedRequest = {
        method: request.method,
        path,
        studentId: request.headers.get('x-student-id'),
        body: undefined,
      };
      state.backend.requests.push(record);
      if (request.method === 'POST' && request.headers.get('content-type')?.includes('json')) {
        void request
          .clone()
          .json()
          .then((body) => (record.body = body))
          .catch(() => undefined);
      }
    });
  });

  afterEach(() => {
    server.resetHandlers();
    state.backend = createFakeBackend();
    server.use(...state.backend.handlers);
  });

  afterAll(() => server.close());

  server.use(...state.backend.handlers);

  return {
    server,
    get backend() {
      return state.backend;
    },
  };
}
