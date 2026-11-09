import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { INTERNAL_API_KEY_HEADER } from '../src/middleware/internal-auth.js';
import {
  DuplicateApplicationError,
  NotFoundError,
  SeatsFullError,
  ServiceBusyError,
} from '../src/services/errors.js';
import type { HoldDto } from '../src/types/holds.js';
import { buildTestApp, StubHoldService, TEST_API_KEY } from './helpers.js';

const HOLD_ID = '7f2d6cf0-6e49-4b6d-bb33-64f3ed23d0b7';
const CLASS_ID = 42;
const STUDENT_ID = '20240000000000001';

const auth = <T extends request.Test>(req: T) => req.set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);

function appWith(onCreate: () => Promise<HoldDto>) {
  const holdService = new StubHoldService(onCreate);
  return { app: buildTestApp({ holdService }), holdService };
}

describe('POST /holds', () => {
  it('returns the created hold contract', async () => {
    const hold: HoldDto = {
      holdId: HOLD_ID,
      classId: CLASS_ID,
      studentId: STUDENT_ID,
      status: 'HELD',
      createdAt: '2026-11-09T06:00:00.000Z',
      expiresAt: '2026-11-09T06:10:00.000Z',
      confirmedAt: null,
    };
    const { app, holdService } = appWith(async () => hold);

    const res = await auth(request(app).post('/holds')).send({
      classId: CLASS_ID,
      studentId: STUDENT_ID,
    });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/holds/${HOLD_ID}`);
    expect(res.body).toEqual({ data: hold });
    expect(holdService.createCalls).toEqual([{ classId: CLASS_ID, studentId: STUDENT_ID }]);
  });

  it.each([
    [new NotFoundError(`Class ${CLASS_ID} not found`), 404, 'NOT_FOUND'],
    [new SeatsFullError(CLASS_ID), 409, 'SEATS_FULL'],
    [new DuplicateApplicationError(CLASS_ID), 409, 'DUPLICATE_APPLICATION'],
    [new ServiceBusyError(), 503, 'SERVICE_BUSY'],
  ])('maps %s to %i %s', async (error, status, code) => {
    const { app } = appWith(async () => {
      throw error;
    });
    const res = await auth(request(app).post('/holds')).send({
      classId: CLASS_ID,
      studentId: STUDENT_ID,
    });
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it.each([
    '1234567890123456',
    '123456789012345678',
    '1234567890123456a',
    '１２３４５６７８９０１２３４５６７',
  ])('rejects invalid student id %s before reaching the service', async (studentId) => {
    const { app, holdService } = appWith(async () => {
      throw new Error('should not be called');
    });
    const res = await auth(request(app).post('/holds')).send({ classId: CLASS_ID, studentId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({
      path: 'studentId',
      message: 'studentId must be exactly 17 digits',
    });
    expect(holdService.createCalls).toHaveLength(0);
  });

  it('rejects a student id sent as a number', async () => {
    const { app } = appWith(async () => {
      throw new Error('should not be called');
    });
    const res = await auth(request(app).post('/holds')).send({
      classId: CLASS_ID,
      studentId: 2024,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      path: 'studentId',
      message: 'studentId must be a string',
    });
  });

  it('rejects an invalid class id', async () => {
    const { app } = appWith(async () => {
      throw new Error('should not be called');
    });
    const res = await auth(request(app).post('/holds')).send({
      classId: 'class-1',
      studentId: STUDENT_ID,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      path: 'classId',
      message: 'classId must be a number',
    });

    for (const [classId, message] of [
      ['42', 'classId must be a number'],
      [0, 'classId must be a positive number'],
      [1.5, 'classId must be a whole number'],
    ] as const) {
      const bad = await auth(request(app).post('/holds')).send({ classId, studentId: STUDENT_ID });
      expect(bad.status, String(classId)).toBe(400);
      expect(bad.body.error.details).toContainEqual({ path: 'classId', message });
    }
  });

  it('does not accept caller-controlled hold state', async () => {
    const { app, holdService } = appWith(async () => {
      throw new Error('should not be called');
    });
    const res = await auth(request(app).post('/holds')).send({
      classId: CLASS_ID,
      studentId: STUDENT_ID,
      status: 'CONFIRMED',
      expiresAt: '2999-01-01T00:00:00Z',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(holdService.createCalls).toHaveLength(0);
  });
});

describe('hold read and student actions', () => {
  function forwardingApp() {
    const holdService = new StubHoldService(undefined, async (operation) =>
      operation === 'listStudentHolds' ? [] : { holdId: HOLD_ID },
    );
    return { app: buildTestApp({ holdService }), holdService };
  }

  it.each([
    [
      'getHold',
      (app: ReturnType<typeof buildTestApp>) => auth(request(app).get(`/holds/${HOLD_ID}`)),
      [HOLD_ID],
    ],
    [
      'confirmHold',
      (app: ReturnType<typeof buildTestApp>) =>
        auth(request(app).post(`/holds/${HOLD_ID}/confirm`)).send({ studentId: STUDENT_ID }),
      [HOLD_ID, STUDENT_ID],
    ],
    [
      'cancelHold',
      (app: ReturnType<typeof buildTestApp>) =>
        auth(request(app).post(`/holds/${HOLD_ID}/cancel`)).send({ studentId: STUDENT_ID }),
      [HOLD_ID, STUDENT_ID],
    ],
    [
      'listStudentHolds',
      (app: ReturnType<typeof buildTestApp>) =>
        auth(request(app).get(`/students/${STUDENT_ID}/holds`)),
      [STUDENT_ID],
    ],
  ])('%s forwards validated input to the service', async (operation, send, args) => {
    const { app, holdService } = forwardingApp();
    const res = await send(app);
    expect(res.status).toBe(200);
    expect(holdService.calls).toEqual([{ operation, args }]);
  });

  it.each(['confirm', 'cancel'])(
    '%s requires the acting student id in the body',
    async (action) => {
      const { app, holdService } = forwardingApp();
      const missing = await auth(request(app).post(`/holds/${HOLD_ID}/${action}`)).send({});
      expect(missing.status).toBe(400);
      expect(missing.body.error.details).toContainEqual({
        path: 'studentId',
        message: 'studentId is required',
      });
      const invalid = await auth(request(app).post(`/holds/${HOLD_ID}/${action}`)).send({
        studentId: '123',
      });
      expect(invalid.status).toBe(400);
      expect(holdService.calls).toHaveLength(0);
    },
  );

  it('validates hold and student path parameters', async () => {
    const { app, holdService } = forwardingApp();
    expect((await auth(request(app).get('/holds/not-a-uuid'))).status).toBe(400);
    expect((await auth(request(app).get('/students/123/holds'))).status).toBe(400);
    expect(holdService.calls).toHaveLength(0);
  });
});
