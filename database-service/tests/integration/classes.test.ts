import { randomUUID } from 'node:crypto';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createPrismaClient, type PrismaClient } from '../../src/db/prisma.js';
import { INTERNAL_API_KEY_HEADER } from '../../src/middleware/internal-auth.js';
import { PrismaClassService } from '../../src/services/class.service.js';
import { StubHoldService } from '../helpers.js';
import { PrismaDatabaseProbe } from '../../src/services/prisma-probe.js';

const url = process.env.TEST_DATABASE_URL;
const API_KEY = 'integration-internal-key-123456';

describe.skipIf(!url)('classes API against PostgreSQL', () => {
  const prefix = `it-${randomUUID().slice(0, 8)}`;
  let prisma: PrismaClient;
  let app: ReturnType<typeof createApp>;

  const post = (body: object) =>
    request(app).post('/classes').set(INTERNAL_API_KEY_HEADER, API_KEY).send(body);
  const list = () => request(app).get('/classes').set(INTERNAL_API_KEY_HEADER, API_KEY);

  beforeAll(() => {
    prisma = createPrismaClient(url as string);
    app = createApp({
      internalApiKey: API_KEY,
      logger: pino({ level: 'silent' }),
      databaseProbe: new PrismaDatabaseProbe(prisma),
      classService: new PrismaClassService(prisma),
      holdService: new StubHoldService(),
    });
  });

  afterAll(async () => {
    await prisma?.admissionClass.deleteMany({ where: { name: { startsWith: prefix } } });
    await prisma?.$disconnect();
  });

  it('creates a class that is persisted with database-generated id and timestamp', async () => {
    const res = await post({ name: `${prefix} Class A`, totalSeats: 30 });

    expect(res.status).toBe(201);
    expect(Number.isInteger(res.body.data.id)).toBe(true);
    expect(res.body.data).toMatchObject({
      name: `${prefix} Class A`,
      totalSeats: 30,
      heldSeats: 0,
      confirmedSeats: 0,
      availableSeats: 30,
    });

    const stored = await prisma.admissionClass.findUniqueOrThrow({
      where: { id: res.body.data.id },
    });
    expect(stored.name).toBe(`${prefix} Class A`);
    expect(stored.createdAt.toISOString()).toBe(res.body.data.createdAt);
  });

  it('lists classes with availability derived from the database view', async () => {
    await post({ name: `${prefix} Class B`, totalSeats: 12 });

    const res = await list();
    expect(res.status).toBe(200);

    const ours = res.body.data.filter((c: { name: string }) => c.name.startsWith(prefix));
    expect(ours).toEqual([
      expect.objectContaining({ name: `${prefix} Class A`, totalSeats: 30, availableSeats: 30 }),
      expect.objectContaining({ name: `${prefix} Class B`, totalSeats: 12, availableSeats: 12 }),
    ]);
    for (const c of ours) {
      expect(Number.isInteger(c.id) && c.id > 0).toBe(true);
      expect(Number.isNaN(Date.parse(c.createdAt))).toBe(false);
    }
  });

  it('rejects a duplicate class name with 409, including a whitespace variant', async () => {
    for (const name of [`${prefix} Class A`, `  ${prefix}   Class A `]) {
      const res = await post({ name, totalSeats: 5 });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CLASS_SECTION_TAKEN');
    }
    const count = await prisma.admissionClass.count({ where: { name: `${prefix} Class A` } });
    expect(count).toBe(1);
  });

  it('allows several sections of one class but rejects a repeated section', async () => {
    const name = `${prefix} Sectioned`;
    expect((await post({ name, section: 'A', totalSeats: 30 })).status).toBe(201);
    expect((await post({ name, section: 'B', totalSeats: 30 })).status).toBe(201);
    const duplicate = await post({ name: name.toUpperCase(), section: 'a', totalSeats: 30 });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CLASS_SECTION_TAKEN');
    const rows = await prisma.admissionClass.findMany({
      where: { name },
      orderBy: { section: 'asc' },
    });
    expect(rows.map((r) => r.section)).toEqual(['A', 'B']);
  });

  it('enforces uniqueness in the database under concurrent creation', async () => {
    const name = `${prefix} Concurrent`;
    const results = await Promise.all(
      Array.from({ length: 5 }, () => post({ name, totalSeats: 10 })),
    );

    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.admissionClass.count({ where: { name } })).toBe(1);
  });

  it('treats class names and sections as case-insensitive for uniqueness', async () => {
    const res = await post({ name: `${prefix} CLASS A`, section: 'a', totalSeats: 5 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CLASS_SECTION_TAKEN');
  });

  it('rejects invalid input before it reaches the database', async () => {
    const before = await prisma.admissionClass.count({ where: { name: { startsWith: prefix } } });
    expect((await post({ name: `${prefix} Zero`, totalSeats: 0 })).status).toBe(400);
    expect((await post({ name: '   ', totalSeats: 5 })).status).toBe(400);
    const after = await prisma.admissionClass.count({ where: { name: { startsWith: prefix } } });
    expect(after).toBe(before);
  });
});
