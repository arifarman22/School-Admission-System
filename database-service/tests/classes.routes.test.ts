import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { INTERNAL_API_KEY_HEADER } from '../src/middleware/internal-auth.js';
import type { ClassService } from '../src/services/class.service.js';
import { buildTestApp, InMemoryClassService, TEST_API_KEY } from './helpers.js';

function setup() {
  const classService = new InMemoryClassService();
  const app = buildTestApp({ classService });
  const post = (body: unknown) =>
    request(app)
      .post('/classes')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY)
      .send(body as object);
  const get = (path = '/classes') =>
    request(app).get(path).set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);
  return { app, classService, post, get };
}

function failingClassService(error: unknown): ClassService {
  return {
    createClass: async () => {
      throw error;
    },
    listClasses: async () => {
      throw error;
    },
    getClass: async () => {
      throw error;
    },
  };
}

describe('POST /classes', () => {
  it('creates a class and returns the typed contract', async () => {
    const { post } = setup();
    const res = await post({ name: 'Class 3', totalSeats: 40 });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/classes/${res.body.data.id}`);
    expect(res.body).toEqual({
      data: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        name: 'Class 3',
        totalSeats: 40,
        heldSeats: 0,
        confirmedSeats: 0,
        availableSeats: 40,
        createdAt: expect.any(String),
      },
    });
  });

  it('trims and collapses whitespace in the class name', async () => {
    const { post } = setup();
    const res = await post({ name: '  Class    4  ', totalSeats: 10 });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Class 4');
  });

  it.each([
    ['missing', { totalSeats: 10 }, 'name is required'],
    ['null', { name: null, totalSeats: 10 }, 'name must be a string'],
    ['a number', { name: 42, totalSeats: 10 }, 'name must be a string'],
    ['empty', { name: '', totalSeats: 10 }, 'name must not be empty'],
    ['whitespace only', { name: '   \t ', totalSeats: 10 }, 'name must not be empty'],
    ['too long', { name: 'x'.repeat(101), totalSeats: 10 }, 'name must be at most 100 characters'],
    [
      'containing control characters',
      { name: 'Class\u0007 5', totalSeats: 10 },
      'name must not contain control or invisible formatting characters',
    ],
    [
      'containing zero-width characters',
      { name: 'Class​5', totalSeats: 10 },
      'name must not contain control or invisible formatting characters',
    ],
  ])('rejects a class name that is %s', async (_label, body, message) => {
    const { post, classService } = setup();
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toContainEqual({ path: 'name', message });
    expect(classService.createCalls).toBe(0);
  });

  it('accepts a name of exactly 100 characters', async () => {
    const { post } = setup();
    const res = await post({ name: 'x'.repeat(100), totalSeats: 1 });
    expect(res.status).toBe(201);
  });

  it.each([
    ['missing', { name: 'A' }, 'totalSeats is required'],
    ['zero', { name: 'A', totalSeats: 0 }, 'totalSeats must be greater than zero'],
    ['negative', { name: 'A', totalSeats: -5 }, 'totalSeats must be greater than zero'],
    ['fractional', { name: 'A', totalSeats: 1.5 }, 'totalSeats must be a whole number'],
    ['a numeric string', { name: 'A', totalSeats: '30' }, 'totalSeats must be a number'],
    ['a boolean', { name: 'A', totalSeats: true }, 'totalSeats must be a number'],
    ['null', { name: 'A', totalSeats: null }, 'totalSeats must be a number'],
    ['above the maximum', { name: 'A', totalSeats: 10_001 }, 'totalSeats must be at most 10000'],
  ])('rejects a seat count that is %s', async (_label, body, message) => {
    const { post, classService } = setup();
    const res = await post(body);

    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ path: 'totalSeats', message });
    expect(classService.createCalls).toBe(0);
  });

  it('accepts the seat boundaries 1 and 10000', async () => {
    const { post } = setup();
    expect((await post({ name: 'Min', totalSeats: 1 })).status).toBe(201);
    expect((await post({ name: 'Max', totalSeats: 10_000 })).status).toBe(201);
  });

  it('reports every invalid field at once', async () => {
    const { post } = setup();
    const res = await post({ name: '', totalSeats: 0 });
    expect(res.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'name',
      'totalSeats',
    ]);
  });

  it('rejects caller-supplied fields such as id or createdAt', async () => {
    const { post, classService } = setup();
    const res = await post({
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Class 6',
      totalSeats: 10,
      createdAt: '2000-01-01T00:00:00Z',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('(root)');
    expect(res.body.error.details[0].message).toMatch(/id.*createdAt|createdAt.*id/);
    expect(classService.createCalls).toBe(0);
  });

  it('rejects non-object bodies', async () => {
    const { post } = setup();
    const res = await post([{ name: 'A', totalSeats: 1 }]);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed JSON', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/classes')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY)
      .set('Content-Type', 'application/json')
      .send('{"name": "A", totalSeats: }');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
  });

  it('requires a JSON content type', async () => {
    const { app } = setup();
    const res = await request(app)
      .post('/classes')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY)
      .set('Content-Type', 'text/plain')
      .send('name=A&totalSeats=1');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects oversized bodies', async () => {
    const { post } = setup();
    const res = await post({ name: 'A', totalSeats: 1, padding: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns 409 for a duplicate class name, including after normalisation', async () => {
    const { post } = setup();
    expect((await post({ name: 'Class 7', totalSeats: 10 })).status).toBe(201);

    for (const name of ['Class 7', '  Class   7 ']) {
      const res = await post({ name, totalSeats: 20 });
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        code: 'CLASS_NAME_TAKEN',
        message: 'A class named "Class 7" already exists',
      });
    }
  });

  it('does not reach the service without the internal API key', async () => {
    const { app, classService } = setup();
    const res = await request(app).post('/classes').send({ name: 'Sneaky', totalSeats: 5 });
    expect(res.status).toBe(401);
    expect(classService.createCalls).toBe(0);
  });
});

describe('GET /classes', () => {
  it('returns an empty list when there are no classes', async () => {
    const { get } = setup();
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('returns created classes', async () => {
    const { post, get } = setup();
    await post({ name: 'Class B', totalSeats: 20 });
    await post({ name: 'Class A', totalSeats: 10 });

    const res = await get();
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(['Class A', 'Class B']);
  });
});

describe('GET /classes/:classId', () => {
  it('validates the class id before calling the service', async () => {
    const { get } = setup();
    const res = await get('/classes/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      path: 'classId',
      message: 'classId must be a UUID',
    });
  });

  it('returns 404 NOT_FOUND for an unknown class', async () => {
    const { get } = setup();
    const res = await get('/classes/7f2d6cf0-6e49-4b6d-bb33-64f3ed23d0b7');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns a single class', async () => {
    const { post, get } = setup();
    const created = await post({ name: 'Class 9', totalSeats: 9 });
    const res = await get(`/classes/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(created.body.data);
  });
});

describe('centralized error handling', () => {
  it('maps database connectivity failures to 503 without leaking details', async () => {
    const dbDown = Object.assign(new Error("Can't reach database server at db.internal:5432"), {
      code: 'P1001',
    });
    const res = await request(buildTestApp({ classService: failingClassService(dbDown) }))
      .get('/classes')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);

    expect(res.status).toBe(503);
    expect(res.body.error).toEqual({
      code: 'DATABASE_UNAVAILABLE',
      message: 'Database is temporarily unavailable',
    });
  });

  it('maps unexpected errors to a generic 500', async () => {
    const res = await request(
      buildTestApp({ classService: failingClassService(new Error('secret internal detail')) }),
    )
      .get('/classes')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);

    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});
