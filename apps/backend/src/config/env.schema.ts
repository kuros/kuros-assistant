import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(5432),
  DB_NAME: z.string().default('kuros_manager'),
  DB_USER: z.string().default('kuros'),
  DB_PASSWORD: z.string().default('kuros'),
  DB_SCHEMA: z.string().default('kuros_manager'),
  KUROS_DATA_DIR: z.string().default('./data'),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  OUTLOOK_TENANT_ID: z.string().default('common'),
  OUTLOOK_CLIENT_ID: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
