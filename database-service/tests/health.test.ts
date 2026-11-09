import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { INTERNAL_API_KEY_HEADER } from '../src/middleware/internal-auth.js';
import type { DatabaseProbe } from '../src/types/health.js';
import { buildTestApp, healthyDb, TEST_API_KEY } from './helpers.js';

const brokenDb: DatabaseProbe = {
  ping: async () => {
    throw new Error('connection refused');
  },
};

describe('internal auth', () => {
  it('rejects requests without the internal API key using the error envelope', async () => {
    const res = await request(buildTestApp()).get('/health');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid internal API key' },
      requestId: expect.any(String),
    });
  });

  it('rejects requests with a wrong key', async () => {
    const res = await request(buildTestApp())
      .get('/health')
      .set(INTERNAL_API_KEY_HEADER, 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('ignores a caller request id unless the caller is authenticated', async () => {
    const unauthenticated = await request(buildTestApp())
      .get('/health')
      .set('x-request-id', 'spoofed-id');
    expect(unauthenticated.headers['x-request-id']).not.toBe('spoofed-id');

    const authenticated = await request(buildTestApp())
      .get('/health')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY)
      .set('x-request-id', 'trace-123');
    expect(authenticated.headers['x-request-id']).toBe('trace-123');
  });
});

describe('GET /health', () => {
  it('returns liveness without touching the database', async () => {
    const res = await request(buildTestApp({ databaseProbe: brokenDb }))
      .get('/health')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'database-service' });
  });
});

describe('GET /health/ready', () => {
  it('returns 200 when the database is reachable', async () => {
    const res = await request(buildTestApp({ databaseProbe: healthyDb }))
      .get('/health/ready')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.checks.database.status).toBe('ok');
  });

  it('returns 503 without leaking error details when the database is down', async () => {
    const res = await request(buildTestApp({ databaseProbe: brokenDb }))
      .get('/health/ready')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);
    expect(res.status).toBe(503);
    expect(res.body.checks.database).toEqual({ status: 'error', error: 'Database unreachable' });
  });

  it('returns 503 while the service is shutting down', async () => {
    const res = await request(buildTestApp({ isShuttingDown: () => true }))
      .get('/health/ready')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'error', shuttingDown: true });
  });
});

describe('unknown routes', () => {
  it('returns a 404 error envelope', async () => {
    const res = await request(buildTestApp())
      .get('/does-not-exist')
      .set(INTERNAL_API_KEY_HEADER, TEST_API_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
