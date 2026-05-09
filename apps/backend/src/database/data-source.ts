import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'node:path';
import * as dotenv from 'dotenv';

// Try local .env first, then workspace root.
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'kuros',
  password: process.env.DB_PASSWORD ?? 'kuros',
  database: process.env.DB_NAME ?? 'kuros_manager',
  schema: process.env.DB_SCHEMA ?? 'kuros_manager',
  entities: [path.join(__dirname, '..', 'entities', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
  logging: ['error', 'warn', 'migration'],
});
