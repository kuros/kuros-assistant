import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

// Walk up from cwd until we find `.env` (up to 6 levels). This works
// regardless of whether the CLI is invoked from the repo root or apps/backend.
function findEnv(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const envPath = findEnv(process.cwd());
if (envPath) dotenv.config({ path: envPath });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5439),
  username: process.env.DB_USER ?? 'kuros',
  password: process.env.DB_PASSWORD ?? 'kuros',
  database: process.env.DB_NAME ?? 'kuros_manager',
  entities: [path.join(__dirname, '..', 'entities', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: ['error', 'warn', 'migration'],
});
