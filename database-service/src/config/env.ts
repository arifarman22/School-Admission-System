import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  INTERNAL_API_KEY: z.string().min(16, 'INTERNAL_API_KEY must be at least 16 characters'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(10_000),
  HOLD_DURATION_SECONDS: z.coerce.number().int().min(1).max(86_400).default(600),
  RESERVATION_LOCK_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  RESERVATION_TX_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (result.data.RESERVATION_LOCK_TIMEOUT_MS >= result.data.RESERVATION_TX_TIMEOUT_MS) {
    throw new Error(
      'Invalid environment configuration:\n  - RESERVATION_LOCK_TIMEOUT_MS must be less than RESERVATION_TX_TIMEOUT_MS',
    );
  }
  return result.data;
}
