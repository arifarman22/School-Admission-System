import { pino } from 'pino';
import { createApp, type AppDependencies } from '../src/app.js';
import type { ClassService } from '../src/services/class.service.js';
import { ConflictError, NotFoundError, NotImplementedError } from '../src/services/errors.js';
import type { HoldService } from '../src/services/hold.service.js';
import type { ClassDto, CreateClassInput } from '../src/types/classes.js';
import type { DatabaseProbe } from '../src/types/health.js';
import type { CreateHoldInput, HoldDto, StudentHoldDto } from '../src/types/holds.js';

export const TEST_API_KEY = 'test-internal-key-1234567890';

export class StubHoldService implements HoldService {
  readonly createCalls: CreateHoldInput[] = [];
  readonly calls: { operation: string; args: unknown[] }[] = [];

  constructor(
    private readonly onCreate?: (input: CreateHoldInput) => Promise<HoldDto>,
    private readonly onOther?: (operation: string, args: unknown[]) => Promise<unknown>,
  ) {}

  private other<T>(operation: string, args: unknown[]): Promise<T> {
    this.calls.push({ operation, args });
    if (!this.onOther) throw new NotImplementedError(operation);
    return this.onOther(operation, args) as Promise<T>;
  }

  async createHold(input: CreateHoldInput): Promise<HoldDto> {
    this.createCalls.push(input);
    if (!this.onCreate) throw new NotImplementedError('createHold');
    return this.onCreate(input);
  }

  getHold(holdId: string): Promise<HoldDto> {
    return this.other('getHold', [holdId]);
  }

  confirmHold(holdId: string, studentId: string): Promise<HoldDto> {
    return this.other('confirmHold', [holdId, studentId]);
  }

  cancelHold(holdId: string, studentId: string): Promise<HoldDto> {
    return this.other('cancelHold', [holdId, studentId]);
  }

  listStudentHolds(studentId: string): Promise<StudentHoldDto[]> {
    return this.other('listStudentHolds', [studentId]);
  }
}

export const healthyDb: DatabaseProbe = { ping: async () => {} };

export class InMemoryClassService implements ClassService {
  readonly classes: ClassDto[] = [];
  createCalls = 0;
  private nextId = 1;

  async createClass(input: CreateClassInput): Promise<ClassDto> {
    this.createCalls++;
    if (
      this.classes.some(
        (c) =>
          c.name.toLowerCase() === input.name.toLowerCase() &&
          c.section.toLowerCase() === input.section.toLowerCase(),
      )
    ) {
      throw new ConflictError(
        'CLASS_SECTION_TAKEN',
        `Section "${input.section}" of "${input.name}" already exists`,
      );
    }
    const created: ClassDto = {
      id: this.nextId++,
      name: input.name,
      section: input.section,
      totalSeats: input.totalSeats,
      heldSeats: 0,
      confirmedSeats: 0,
      availableSeats: input.totalSeats,
      createdAt: new Date().toISOString(),
    };
    this.classes.push(created);
    return created;
  }

  async listClasses(): Promise<ClassDto[]> {
    return [...this.classes].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getClass(classId: number): Promise<ClassDto> {
    const found = this.classes.find((c) => c.id === classId);
    if (!found) throw new NotFoundError(`Class ${classId} not found`);
    return found;
  }
}

export function buildTestApp(overrides: Partial<AppDependencies> = {}) {
  return createApp({
    internalApiKey: TEST_API_KEY,
    logger: pino({ level: 'silent' }),
    databaseProbe: healthyDb,
    classService: new InMemoryClassService(),
    holdService: new StubHoldService(),
    ...overrides,
  });
}
