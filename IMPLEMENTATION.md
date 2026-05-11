# Kuros Manager — Implementation Specification

This document is the source of truth for implementation. It is intentionally low-level so that an agent can execute it mechanically without making architectural decisions or guessing at names, paths, types, signatures, or commands.

If anything in this document conflicts with [PLAN.md](PLAN.md), this document wins.

---

## 0. Locked decisions (resolves PLAN.md §4)

| # | Decision | Locked value |
|---|---|---|
| 1 | Claude access | Anthropic API via `@anthropic-ai/sdk`, env `ANTHROPIC_API_KEY`. Default model `claude-sonnet-4-6`. Long-form insight model `claude-opus-4-7`. |
| 2 | ORM | **TypeORM** (per user) |
| 3 | Scheduler | `@nestjs/schedule` (in-process cron). BullMQ only when we move hosted. |
| 4 | Slack auth | v1 uses `@slack/web-api` `WebClient` for **polling-based sync only**. Required: bot token `xoxb-`. The `xapp-` app token may be stored on the connector but is unused in v1. `@slack/bolt` is **not** a v1 dependency. |
| 5 | Outlook auth | MSAL Node, **device-code flow** for local. |
| 6 | Data dir | `<repoRoot>/data` by default. Override via `KUROS_DATA_DIR`. |
| 7 | Ports | Backend `3000`, frontend `5173`. |
| 8 | Package manager | pnpm |
| 9 | Node version | `>=20.11`, locked via `.nvmrc` to `22` |
| 10 | TS version | `5.5.x` |
| 11 | DB | Postgres 16, schema `kuros_manager`. App user owns the schema. |
| 12 | Test runner | Jest (NestJS default) for backend, Vitest for frontend |
| 13 | Owner profile (email + timezone) | Stored on the seed `users` row, **set by the user via the frontend onboarding screen** — NOT via env vars. Both `email` and `timezone` (IANA name) are required before any cron sync runs. See §7.5 (bootstrap behavior) and §14.3 (onboarding page). |
| 14 | Date/time bucketing | All daily/weekly bucketing and `[HH:mm]` rendering use `users.timezone`. If unset, the cron jobs no-op (logged as `awaiting_onboarding`). |
| 15 | Secret merge on PATCH | When PATCH `/api/connectors/:id` body's `config` contains the literal string `***` for a token/secret field, the server preserves the existing stored value for that field (shallow merge over secret fields only). |
| 16 | Outlook sync target | `connector_sync_state.targetId` = **mail folder id** (typically Inbox id). `monitoredAddresses` from `OutlookConnectorConfig` are applied as **client-side filters** after `/me/messages/delta` returns. Cursor = Graph delta token per folder. |
| 17 | External-API retry policy | All Anthropic, Slack `WebClient`, and Graph calls go through a shared retry helper: 3 attempts, exponential backoff `500ms * 2^n`, retry only on HTTP 408/425/429/500/502/503/504 (and 529 for Anthropic). Honour `Retry-After` header when present. After final failure, throw and let the caller log + continue. See §9.2. |

**Implementer rule:** if a question arises that is NOT answered here or in PLAN.md, **stop and ask** rather than choose. Do not invent column types, route paths, env var names, or prompt wording.

---

## 1. Prerequisites the user must have installed

The implementer should not try to install these system-level tools — flag if missing:

- Node ≥ 20.11 (we'll use 22)
- pnpm ≥ 9 (install via `npm i -g pnpm` if missing — this is OK to do)
- Postgres 16 reachable on `localhost:5432` with a superuser able to create schemas and users. Either:
  - **Option A (preferred):** Docker Desktop, then `docker compose up -d db`
  - **Option B:** Native Postgres install on the host
- Git

---

## 2. Final repo layout

```
kuros-manager/
├── .editorconfig
├── .gitignore
├── .nvmrc
├── .prettierrc.json
├── .eslintrc.cjs
├── .env.example
├── docker-compose.yml
├── package.json                    # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── PLAN.md
├── IMPLEMENTATION.md
├── README.md                       # see §3.12 for required sections
├── data/                           # gitignored, created at runtime
└── apps/
    ├── backend/
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── tsconfig.build.json
    │   ├── nest-cli.json
    │   ├── jest.config.ts
    │   ├── src/
    │   │   ├── main.ts
    │   │   ├── app.module.ts
    │   │   ├── config/
    │   │   │   ├── config.module.ts
    │   │   │   └── env.schema.ts            # zod schema for process.env
    │   │   ├── common/
    │   │   │   ├── auth/
    │   │   │   │   ├── auth.module.ts
    │   │   │   │   ├── auth.guard.ts        # stub: req.user = { id: SINGLE_USER_ID }
    │   │   │   │   └── current-user.decorator.ts
    │   │   │   ├── filters/
    │   │   │   │   └── http-exception.filter.ts
    │   │   │   ├── logging/
    │   │   │   │   └── logger.module.ts     # nestjs-pino
    │   │   │   └── retry/
    │   │   │       └── with-retry.ts        # §9.3
    │   │   ├── database/
    │   │   │   ├── database.module.ts       # registers TypeOrmModule
    │   │   │   ├── data-source.ts           # for CLI migrations
    │   │   │   └── migrations/
    │   │   │       └── 1700000000000-Init.ts
    │   │   ├── entities/                    # all TypeORM entities
    │   │   │   ├── user.entity.ts
    │   │   │   ├── connector.entity.ts
    │   │   │   ├── connector-sync-state.entity.ts
    │   │   │   ├── summary.entity.ts
    │   │   │   ├── insight.entity.ts
    │   │   │   ├── action-item.entity.ts
    │   │   │   ├── risk.entity.ts
    │   │   │   ├── person.entity.ts
    │   │   │   ├── team.entity.ts
    │   │   │   └── team-member.entity.ts
    │   │   ├── storage/
    │   │   │   ├── storage.module.ts
    │   │   │   ├── storage.service.ts       # interface + LocalFsStorage impl
    │   │   │   └── path-builder.ts
    │   │   ├── claude/
    │   │   │   ├── claude.module.ts
    │   │   │   ├── claude.service.ts
    │   │   │   └── prompts/
    │   │   │       ├── index.ts
    │   │   │       ├── daily-summary.prompt.ts
    │   │   │       ├── weekly-summary.prompt.ts
    │   │   │       ├── action-items.prompt.ts
    │   │   │       ├── risks.prompt.ts
    │   │   │       └── insights.prompt.ts
    │   │   ├── health/
    │   │   │   ├── health.module.ts
    │   │   │   └── health.controller.ts
    │   │   ├── me/
    │   │   │   ├── me.module.ts
    │   │   │   ├── me.controller.ts
    │   │   │   ├── me.service.ts
    │   │   │   └── dto/
    │   │   │       └── update-me.dto.ts
    │   │   ├── connectors/
    │   │   │   ├── connectors.module.ts
    │   │   │   ├── connectors.controller.ts
    │   │   │   ├── connectors.service.ts
    │   │   │   ├── connector.interface.ts   # abstract Connector
    │   │   │   ├── connector.registry.ts
    │   │   │   ├── connector-scheduler.service.ts
    │   │   │   ├── post-summary.pipeline.ts # extract action items / risks / insights
    │   │   │   └── dto/
    │   │   │       ├── create-connector.dto.ts
    │   │   │       ├── update-connector.dto.ts
    │   │   │       └── trigger-sync.dto.ts
    │   │   ├── slack/
    │   │   │   ├── slack.module.ts
    │   │   │   ├── slack.connector.ts        # implements Connector
    │   │   │   ├── slack.client.ts           # thin wrapper over @slack/web-api
    │   │   │   └── slack.types.ts
    │   │   ├── outlook/
    │   │   │   ├── outlook.module.ts
    │   │   │   ├── outlook.connector.ts      # implements Connector
    │   │   │   ├── outlook.client.ts         # MS Graph wrapper
    │   │   │   ├── outlook.auth.ts           # device-code flow
    │   │   │   └── outlook.types.ts
    │   │   ├── summaries/
    │   │   │   ├── summaries.module.ts
    │   │   │   ├── summaries.controller.ts
    │   │   │   └── summaries.service.ts
    │   │   ├── insights/
    │   │   │   ├── insights.module.ts
    │   │   │   ├── insights.controller.ts
    │   │   │   └── insights.service.ts
    │   │   ├── action-items/
    │   │   │   ├── action-items.module.ts
    │   │   │   ├── action-items.controller.ts
    │   │   │   └── action-items.service.ts
    │   │   ├── risks/
    │   │   │   ├── risks.module.ts
    │   │   │   ├── risks.controller.ts
    │   │   │   └── risks.service.ts
    │   │   └── people-teams/
    │   │       ├── people-teams.module.ts
    │   │       ├── people.controller.ts
    │   │       ├── teams.controller.ts
    │   │       ├── people.service.ts
    │   │       └── teams.service.ts
    │   └── test/
    │       └── app.e2e-spec.ts
    └── frontend/
        ├── package.json
        ├── tsconfig.json
        ├── tsconfig.node.json
        ├── vite.config.ts
        ├── index.html
        ├── public/
        └── src/
            ├── main.tsx
            ├── App.tsx
            ├── theme.ts
            ├── api/
            │   ├── client.ts                # fetch wrapper
            │   └── hooks/                   # one file per resource
            │       ├── me.ts
            │       ├── connectors.ts
            │       ├── summaries.ts
            │       ├── insights.ts
            │       ├── action-items.ts
            │       ├── risks.ts
            │       ├── people.ts
            │       └── teams.ts
            ├── layout/
            │   ├── AppShell.tsx             # AppBar + Drawer + Outlet
            │   ├── SideNav.tsx              # nested list
            │   └── nav-config.ts            # nav tree as data
            ├── components/
            │   ├── MarkdownView.tsx
            │   ├── DatePicker.tsx
            │   ├── WeekPicker.tsx
            │   ├── StatusChip.tsx
            │   └── EmptyState.tsx
            ├── pages/
            │   ├── OnboardingPage.tsx
            │   ├── ProfilePage.tsx
            │   ├── ConnectorsPage.tsx
            │   ├── connectors/
            │   │   ├── ConnectorForm.tsx
            │   │   ├── SlackConfigFields.tsx
            │   │   └── OutlookConfigFields.tsx
            │   ├── DailySummaryPage.tsx
            │   ├── WeeklySummaryPage.tsx
            │   ├── RisksActionsPage.tsx
            │   ├── PersonInsightsPage.tsx
            │   └── TeamInsightsPage.tsx
            └── routes.tsx
└── packages/
    └── shared/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── index.ts
            ├── ids.ts                      # SINGLE_USER_ID constant
            ├── connector.types.ts
            ├── summary.types.ts
            ├── insight.types.ts
            ├── action-item.types.ts
            ├── risk.types.ts
            ├── people-team.types.ts
            └── api.contracts.ts            # response shapes for FE
```

---

## 3. Workspace root files (Phase 0)

### 3.1 `.gitignore`

Standard Node/TS plus our runtime data:
```
node_modules/
dist/
build/
coverage/
.env
.env.local
.DS_Store
.idea/
.vscode/
*.log
data/
```

### 3.2 `.nvmrc`
```
22
```

### 3.3 `.editorconfig`, `.prettierrc.json`, `.eslintrc.cjs`

Standard. Prettier: 2-space, single quotes, semicolons, trailing comma `all`, print width 100.
ESLint: `@typescript-eslint/recommended` + `prettier`. No project-specific rules.

### 3.4 `pnpm-workspace.yaml`
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 3.5 Root `package.json`
```json
{
  "name": "kuros-manager",
  "private": true,
  "engines": { "node": ">=20.11" },
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "pnpm -r --parallel run dev",
    "build": "pnpm -r run build",
    "lint": "pnpm -r run lint",
    "test": "pnpm -r run test",
    "db:up": "docker compose up -d db",
    "db:down": "docker compose down",
    "db:migrate": "pnpm --filter @kuros/backend run migration:run",
    "db:revert": "pnpm --filter @kuros/backend run migration:revert"
  },
  "devDependencies": {
    "prettier": "3.3.3",
    "eslint": "8.57.1",
    "@typescript-eslint/eslint-plugin": "8.8.0",
    "@typescript-eslint/parser": "8.8.0",
    "eslint-config-prettier": "9.1.0",
    "typescript": "5.5.4"
  }
}
```

### 3.6 `tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true,
    "incremental": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "baseUrl": ".",
    "paths": {
      "@kuros/shared": ["packages/shared/src/index.ts"],
      "@kuros/shared/*": ["packages/shared/src/*"]
    }
  },
  "exclude": ["node_modules", "dist", "build"]
}
```

### 3.7 `.env.example`
```
# Backend
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# DB
DB_HOST=localhost
DB_PORT=5432
DB_NAME=kuros_manager
DB_USER=kuros
DB_PASSWORD=kuros
DB_SCHEMA=kuros_manager

# Storage
KUROS_DATA_DIR=./data

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL_FAST=claude-sonnet-4-6
CLAUDE_MODEL_DEEP=claude-opus-4-7

# Slack (per-connector overrides allowed in DB)
SLACK_BOT_TOKEN=
SLACK_APP_TOKEN=

# Outlook
OUTLOOK_TENANT_ID=common
OUTLOOK_CLIENT_ID=

# Frontend
VITE_API_BASE_URL=http://localhost:3000
```

### 3.8 `docker-compose.yml`
```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: kuros-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: kuros_manager
      POSTGRES_USER: kuros
      POSTGRES_PASSWORD: kuros
    ports:
      - "5432:5432"
    volumes:
      - kuros-db-data:/var/lib/postgresql/data
volumes:
  kuros-db-data:
```

### 3.9 Backend TS / Nest configs

`apps/backend/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node", "jest"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

`apps/backend/tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "dist", "test", "**/*.spec.ts", "scripts/**"]
}
```

`apps/backend/nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "tsConfigPath": "tsconfig.build.json", "deleteOutDir": true }
}
```

### 3.10 Backend Jest configs

`apps/backend/jest.config.ts`:
```ts
import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleNameMapper: {
    '^@kuros/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    '^@kuros/shared/(.*)$': '<rootDir>/../../../packages/shared/src/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
};
export default config;
```

`apps/backend/jest-e2e.config.ts`:
```ts
import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '.e2e-spec\\.ts$',
  moduleNameMapper: {
    '^@kuros/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@kuros/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
  },
};
export default config;
```

### 3.11 Shared package files

`packages/shared/package.json`:
```json
{
  "name": "@kuros/shared",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./*": "./src/*"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.5.4"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src", "noEmit": true },
  "include": ["src/**/*"]
}
```

> Even though we point `main`/`types` directly at `.ts` source (no build step) for v1, `noEmit: true` gives us `tsc --noEmit` for type-checking in CI later.

### 3.12 `README.md` required sections

The repo README is short but must contain all the operational knowledge a fresh contributor needs. Sections in this order:

1. **What this is** — 2-3 sentences linking to `PLAN.md` and `IMPLEMENTATION.md` as the authoritative specs.
2. **Prerequisites** — copy of §1.
3. **First-run setup** — exact commands:
   ```bash
   pnpm install
   cp .env.example .env   # edit DB creds + ANTHROPIC_API_KEY
   pnpm db:up             # starts postgres via docker-compose
   pnpm db:migrate        # creates schema + seed user (email/timezone NULL)
   pnpm dev               # boots backend (3000) and frontend (5173)
   ```
4. **Onboarding screen** — explain that on first load the frontend redirects to `/onboarding` to collect email + timezone + display name (§7.5, §14.3). No env vars are required for these.
5. **Adding a Slack connector** — full content of §12.1.
6. **Adding an Outlook connector** — full content of §13.1.
7. **Common operations** — list the root scripts from §3.5 with one-line descriptions.
8. **Where things live** — quick reference: `data/` for generated markdown, `apps/backend/src/prompts/` for Claude prompts, `packages/shared/` for cross-app types.
9. **Troubleshooting** — at minimum: "device-code flow shows code in `/api/connectors/:id/test` response," "scheduler is no-op until onboarded," "to reset everything: `pnpm db:down && rm -rf data/`".

Implementer keeps this README in sync as new operational knowledge arrives.

---

## 4. Shared package (`packages/shared`)

### 4.1 Purpose
Holds types and constants used by both apps. **No runtime deps.** Pure TS.

### 4.2 `src/ids.ts`
```ts
export const SINGLE_USER_ID = '00000000-0000-0000-0000-000000000001';
```

### 4.3 Type contracts (one example, others follow same pattern)

`src/connector.types.ts`:
```ts
export type ConnectorKind = 'slack' | 'outlook';
export type ConnectorStatus = 'active' | 'paused' | 'error';

export interface SlackConnectorConfig {
  botToken: string;        // xoxb-...
  appToken: string;        // xapp-...
  teamId: string;
  channelIds: string[];
}

export interface OutlookConnectorConfig {
  tenantId: string;
  clientId: string;
  cachedTokenFilePath: string;   // relative to data dir
  monitoredAddresses: string[];  // emails of teams I'm on
  teamLabels: Record<string, string>; // address -> team label
}

export type ConnectorConfig = SlackConnectorConfig | OutlookConnectorConfig;

export interface ConnectorDto {
  id: string;
  kind: ConnectorKind;
  name: string;
  status: ConnectorStatus;
  createdAt: string;
  updatedAt: string;
}
```

Implementer fills out `summary.types.ts`, `insight.types.ts`, `action-item.types.ts`, `risk.types.ts`, `people-team.types.ts` mirroring the entity columns from §6.

---

## 5. Backend — package.json (`apps/backend/package.json`)

```json
{
  "name": "@kuros/backend",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main.js",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "jest",
    "test:e2e": "jest --config jest-e2e.config.ts",
    "migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/database/data-source.ts",
    "migration:create": "typeorm-ts-node-commonjs migration:create",
    "migration:run": "typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts",
    "migration:revert": "typeorm-ts-node-commonjs migration:revert -d src/database/data-source.ts"
  },
  "dependencies": {
    "@nestjs/common": "10.4.4",
    "@nestjs/core": "10.4.4",
    "@nestjs/platform-express": "10.4.4",
    "@nestjs/config": "3.2.3",
    "@nestjs/typeorm": "10.0.2",
    "@nestjs/schedule": "4.1.1",
    "typeorm": "0.3.20",
    "pg": "8.13.0",
    "reflect-metadata": "0.2.2",
    "rxjs": "7.8.1",
    "class-validator": "0.14.1",
    "class-transformer": "0.5.1",
    "zod": "3.23.8",
    "nestjs-pino": "4.1.0",
    "pino": "9.4.0",
    "pino-http": "10.3.0",
    "pino-pretty": "11.2.2",
    "@anthropic-ai/sdk": "0.30.1",
    "@slack/web-api": "7.5.0",
    "@microsoft/microsoft-graph-client": "3.0.7",
    "@azure/msal-node": "2.16.1",
    "isomorphic-fetch": "3.0.0",
    "date-fns": "3.6.0",
    "date-fns-tz": "3.2.0",
    "zod-to-json-schema": "3.23.5",
    "@kuros/shared": "workspace:*"
  },
  "devDependencies": {
    "@nestjs/cli": "10.4.5",
    "@nestjs/testing": "10.4.4",
    "@types/jest": "29.5.13",
    "@types/node": "22.7.4",
    "jest": "29.7.0",
    "ts-jest": "29.2.5",
    "ts-node": "10.9.2",
    "typescript": "5.5.4"
  }
}
```

> **Pin all versions exactly as above** — do not let pnpm pick newer majors. If a version no longer resolves, stop and ask.

---

## 6. Database — entities & schema

### 6.1 TypeORM data source (`src/database/data-source.ts`)

This file is **separate** from the Nest module so the TypeORM CLI can use it.

```ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as dotenv from 'dotenv';

// Walk up from cwd looking for `.env` so this works regardless of how the CLI is invoked
// (`pnpm --filter backend ...` from repo root, or `pnpm migration:run` from apps/backend, etc.).
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
```

### 6.2 Database module

Loads via `forRootAsync`, reads same env, and registers entities. **`synchronize: false` always.** Migrations are the only path.

### 6.3 Entities — exact column specs

All entities live in `src/entities/`. All use `@Entity({ schema: 'kuros_manager', name: '<table>' })`. All ids are `uuid` with `@PrimaryGeneratedColumn('uuid')`. All entities have `@CreateDateColumn() createdAt: Date` and (where noted) `@UpdateDateColumn() updatedAt: Date`. All `userId` columns are `uuid not null`.

**`users`**
| column | type | notes |
|---|---|---|
| id | uuid PK | gen |
| email | varchar(320) UNIQUE NULLABLE | populated via onboarding (§7.5, §14.3). UNIQUE is `WHERE email IS NOT NULL`. |
| timezone | varchar(64) NULLABLE | IANA name (e.g. `America/New_York`). Populated via onboarding. |
| name | varchar(200) NULLABLE | optional display name; populated via onboarding. |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

**`connectors`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK→users.id | indexed |
| kind | varchar(32) | check in ('slack','outlook') |
| name | varchar(120) | |
| config | jsonb | encrypted-at-rest later; plain for now |
| status | varchar(16) default 'active' | check in ('active','paused','error') |
| lastError | text nullable | |
| createdAt, updatedAt | timestamptz | |

**`connector_sync_state`** — composite PK
| column | type | notes |
|---|---|---|
| connectorId | uuid FK→connectors.id ON DELETE CASCADE | PK part 1 |
| targetId | varchar(128) | PK part 2 (Slack channel id, Outlook folder, etc.) |
| cursor | varchar(255) nullable | provider-specific (Slack ts, Outlook delta token) |
| lastRunAt | timestamptz nullable | |
| lastItemAt | timestamptz nullable | timestamp of newest item ingested |
| updatedAt | timestamptz | |

**`summaries`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK | indexed |
| connectorId | uuid FK→connectors.id | indexed |
| targetId | varchar(128) | |
| kind | varchar(16) | check in ('daily','weekly') |
| periodStart | date | |
| periodEnd | date | |
| filePath | text | path relative to KUROS_DATA_DIR |
| itemCount | int | how many raw items summarized |
| modelUsed | varchar(64) | which Claude model |
| createdAt | timestamptz | |

UNIQUE (userId, connectorId, targetId, kind, periodStart).

**`insights`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK | |
| scope | varchar(16) | check in ('person','team','channel') |
| scopeRef | varchar(128) | personId/teamId/channelId |
| periodStart | date | |
| periodEnd | date | |
| filePath | text | |
| modelUsed | varchar(64) | |
| createdAt | timestamptz | |

UNIQUE (userId, scope, scopeRef, periodStart, periodEnd).

**`action_items`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK | |
| sourceSummaryId | uuid FK→summaries.id nullable | |
| title | varchar(512) | |
| detail | text nullable | |
| dueDate | date nullable | |
| status | varchar(16) default 'open' | check in ('open','in_progress','done','dismissed') |
| filePath | text nullable | optional standalone md |
| createdAt, updatedAt | timestamptz | |

**`risks`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK | |
| sourceSummaryId | uuid FK→summaries.id nullable | |
| title | varchar(512) | |
| detail | text nullable | |
| severity | varchar(16) | check in ('low','medium','high','critical') |
| status | varchar(16) default 'open' | check in ('open','mitigated','accepted','closed') |
| filePath | text nullable | |
| createdAt, updatedAt | timestamptz | |

**`people`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK | |
| name | varchar(200) | |
| email | varchar(320) nullable | |
| slackUserId | varchar(64) nullable | |
| outlookAddress | varchar(320) nullable | |
| role | varchar(120) nullable | |
| createdAt, updatedAt | timestamptz | |

UNIQUE (userId, email) when email not null.

**`teams`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| userId | uuid FK | |
| name | varchar(120) | |
| createdAt, updatedAt | timestamptz | |

UNIQUE (userId, name).

**`team_members`**
| column | type | notes |
|---|---|---|
| teamId | uuid FK→teams.id ON DELETE CASCADE | PK part 1 |
| personId | uuid FK→people.id ON DELETE CASCADE | PK part 2 |

### 6.4 Initial migration (`1700000000000-Init.ts`)

The migration must:
1. `CREATE SCHEMA IF NOT EXISTS kuros_manager`
2. `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` (on the `public` schema)
3. Create all tables above with constraints listed
4. Insert single seed user with `id = '00000000-0000-0000-0000-000000000001'` and `email = NULL`, `timezone = NULL`, `name = NULL` (populated via onboarding — see §7.5 and §14.3)
5. `down()` drops in reverse FK order; do NOT drop the schema in `down()` (preserves user data).

---

## 7. Backend — config & bootstrapping

### 7.1 `config/env.schema.ts`
```ts
import { z } from 'zod';
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default('info'),
  DB_HOST: z.string(),
  DB_PORT: z.coerce.number(),
  DB_NAME: z.string(),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_SCHEMA: z.string().default('kuros_manager'),
  KUROS_DATA_DIR: z.string().default('./data'),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL_FAST: z.string().default('claude-sonnet-4-6'),
  CLAUDE_MODEL_DEEP: z.string().default('claude-opus-4-7'),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  OUTLOOK_TENANT_ID: z.string().default('common'),
  OUTLOOK_CLIENT_ID: z.string().optional(),
});
export type Env = z.infer<typeof envSchema>;
```

`config.module.ts` validates at startup; on failure, log all issues and exit non-zero.

### 7.2 `main.ts` responsibilities
- Create Nest app with `bufferLogs: true`
- Use `nestjs-pino` `Logger`
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`
- Global `HttpExceptionFilter`
- CORS:
  - `NODE_ENV=development` → allow origin `http://localhost:5173` only
  - `NODE_ENV=test` → allow origin `http://localhost:5173`
  - `NODE_ENV=production` → CORS disabled in v1 (the desktop wrapper serves the SPA from the same origin as the API; hosted multi-user is out of v1 scope per §17). If `production` is detected without an explicit `KUROS_ALLOWED_ORIGIN`, the app boots normally with CORS off and logs a single `cors_disabled_in_production` warning.
- Listen on `PORT`

### 7.3 Auth stub (`common/auth/auth.guard.ts`)
- Always allows
- Sets `req.user = { id: SINGLE_USER_ID }`
- A `@CurrentUser()` param decorator returns `req.user`

Apply globally via `APP_GUARD` so every controller already sees `userId`.

The auth guard exempts the health endpoint (§7.4) and the onboarding endpoints (§7.5) via a `@Public()` decorator (sets `Reflect.metadata('isPublic', true)` on the handler; guard reads via `Reflector` and skips when true). Note: the guard itself never blocks anything in v1 — `@Public()` exists for symmetry with future real auth.

### 7.4 Health module (`apps/backend/src/health/`)

Module: `HealthModule`. Controller: `HealthController`. Single route:

```ts
@Public()
@Get('/api/health')
get(): { ok: true; version: string } {
  return { ok: true, version: process.env.npm_package_version ?? 'dev' };
}
```

No DB call (intentionally cheap — used by Phase 1a smoke test before the database module is wired).

### 7.5 Owner profile / onboarding gate

The single seed user has `email`, `timezone`, and `name` NULL until the user fills out the onboarding screen (§14.3).

**Endpoints** (under `/api/me`, exempted from any future auth via `@Public()` since the auth stub already injects `SINGLE_USER_ID`):

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/me` | — | `{ id, email: string \| null, timezone: string \| null, name: string \| null, onboarded: boolean }` |
| PATCH | `/api/me` | `{ email?: string, timezone?: string, name?: string }` | same shape as GET |

`onboarded` is the derived boolean `email != null && timezone != null`.

`PATCH /api/me` validates:
- `email` — RFC-5322 lite via zod `.string().email()`
- `timezone` — must be in `Intl.supportedValuesOf('timeZone')` (Node 22 supports this); otherwise 400
- `name` — `1..200` chars

**Cron behavior when not onboarded.** Every cron job (§10.3) reads the user row first. If `onboarded === false`, the job logs `{ job, status: 'awaiting_onboarding' }` and exits — no Anthropic calls, no Slack/Graph polling, no `summaries` rows.

**Connector creation when not onboarded.** `POST /api/connectors` returns 409 `{ error: 'awaiting_onboarding' }` until the user is onboarded. The frontend ConnectorsPage is unreachable while onboarding is incomplete (§14.3).

---

## 8. Storage layer

### 8.1 `storage.service.ts`
```ts
export interface StorageService {
  write(relPath: string, content: string): Promise<void>;
  read(relPath: string): Promise<string>;
  exists(relPath: string): Promise<boolean>;
  list(relDir: string): Promise<string[]>;
  delete(relPath: string): Promise<void>;
}
```
Provided as a Nest provider with token `STORAGE`. The default implementation, `LocalFsStorage`, resolves `relPath` against `KUROS_DATA_DIR`, refuses paths containing `..`, creates parent dirs on write.

### 8.2 `path-builder.ts`
Pure functions. **Implementer must use only these helpers — never concatenate paths inline.**
```ts
export const paths = {
  rawItems: (userId: string, kind: ConnectorKind, targetId: string, day: Date) =>
    `users/${userId}/${kind}/raw/${targetId}/${formatISODate(day)}.jsonl`,
  dailySummary: (userId: string, kind: ConnectorKind, targetId: string, day: Date) =>
    `users/${userId}/${kind}/daily/${targetId}/${formatISODate(day)}.md`,
  weeklySummary: (userId: string, kind: ConnectorKind, targetId: string, isoWeek: string) =>
    `users/${userId}/${kind}/weekly/${targetId}/${isoWeek}.md`,
  insight: (userId: string, scope: 'person'|'team'|'channel', scopeRef: string, periodStart: Date, periodEnd: Date) =>
    `users/${userId}/insights/${scope}/${scopeRef}/${formatISODate(periodStart)}_${formatISODate(periodEnd)}.md`,
  actionItems: (userId: string, day: Date) => `users/${userId}/action-items/${formatISODate(day)}.md`,
  risks: (userId: string, day: Date) => `users/${userId}/risks/${formatISODate(day)}.md`,
};
```
- `formatISODate(d)` → `YYYY-MM-DD` **in the user's timezone** (`users.timezone`). Use `date-fns-tz/format` with `format(d, 'yyyy-MM-dd', { timeZone })` so days bucket correctly across DST transitions.
- `isoWeek` format: `YYYY-Www` (e.g. `2026-W19`). Use `date-fns/formatISO`, `getISOWeek`, `getISOWeekYear` — also computed in the user's TZ.

---

## 9. Claude service

### 9.1 `claude.service.ts`
```ts
@Injectable()
export class ClaudeService {
  private client: Anthropic;
  constructor(private cfg: ConfigService) {
    this.client = new Anthropic({ apiKey: cfg.get<string>('ANTHROPIC_API_KEY') });
  }

  async summarize(args: {
    system: string;        // cacheable system prompt
    user: string;          // user message body
    model?: 'fast' | 'deep';
    maxTokens?: number;
  }): Promise<string> { ... }

  async extractStructured<T>(args: {
    system: string;
    user: string;
    schema: ZodSchema<T>;  // result must parse against this
    model?: 'fast' | 'deep';
    toolName: string;
  }): Promise<T> { ... }
}
```

- `summarize` uses `messages.create` with `system` field set to `[{ type:'text', text: args.system, cache_control: { type:'ephemeral' } }]` to enable prompt caching.
- `extractStructured` uses tool use: defines a single tool whose `input_schema` is converted from the zod schema (use `zod-to-json-schema` if needed — add to deps if used). Requires `tool_choice: { type: 'tool', name: args.toolName }`.
- Models:
  - `'fast'` → `cfg.CLAUDE_MODEL_FAST`
  - `'deep'` → `cfg.CLAUDE_MODEL_DEEP`
- Default `maxTokens`: 4096 for fast, 8192 for deep.
- All Anthropic calls go through the retry helper (§9.2). After exhaustion, errors are wrapped into `InternalServerErrorException` with the original message.

### 9.2 Retry helper (`apps/backend/src/common/retry/with-retry.ts`)

Used by `ClaudeService`, `SlackClient`, and `OutlookClient`. Single function — no retry library dependency.

```ts
export interface RetryOpts {
  maxAttempts?: number;          // default 3
  baseDelayMs?: number;          // default 500
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (attempt === max) break;
      if (opts.isRetryable && !opts.isRetryable(err)) break;
      const retryAfterMs = extractRetryAfterMs(err);
      const delay = retryAfterMs ?? base * Math.pow(2, attempt - 1);
      opts.onRetry?.(err, attempt, delay);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```

`extractRetryAfterMs` reads `err.response?.headers?.['retry-after']` (HTTP date or seconds) and returns ms, or `null` if absent.

Retryable predicates per provider:
- **Anthropic:** retry on status `408 | 425 | 429 | 500 | 502 | 503 | 504 | 529`. The SDK throws `Anthropic.APIError` with `.status`.
- **Slack `WebClient`:** retry on `error.code === 'slack_webapi_platform_error'` with `data.error === 'ratelimited'`, AND on transport errors (`ECONNRESET`, `ETIMEDOUT`).
- **Graph:** retry on status `408 | 425 | 429 | 500 | 502 | 503 | 504`.

`onRetry` logs structured: `{ provider, attempt, delayMs, err: err.message, status }`.

### 9.3 Prompt files

Each prompt module exports `system: string` and `userTemplate(input): string`. **Exact wording is part of the spec — do not paraphrase.** Below are the locked texts.

**`daily-summary.prompt.ts`**
```
SYSTEM:
You are a precise executive assistant summarizing a single day of communication for a professional. Output strict GitHub-flavored markdown with these sections, in order:

# Daily summary — {{date}} — {{sourceLabel}}

## TL;DR
3-5 bullets, one line each, written in past tense.

## Key threads
For each meaningful thread (skip noise), one heading-3 with the topic, followed by:
- **Participants:** comma-separated names
- **Decisions:** bullet list (or "none")
- **Open questions:** bullet list (or "none")

## Mentions of me
Bullet list of items where the user was directly addressed or @-mentioned. Skip the section if empty.

## Notable links / files
Bullet list with one-line context per link. Skip if empty.

Rules:
- Do not invent facts.
- Quote sparingly; prefer paraphrase.
- Use the user's first name only when referring to them.
- If the input is empty or only auto-generated noise, return only "# Daily summary — {{date}} — {{sourceLabel}}\n\n_No substantive activity._"

USER TEMPLATE:
The user's name is {{userName}}. Source: {{sourceLabel}}. Date: {{date}}.

Raw items (newest last):
{{items}}
```

**`weekly-summary.prompt.ts`**
```
SYSTEM:
You are a precise chief-of-staff summarizing a workweek across daily summaries. Output strict GitHub-flavored markdown with sections:

# Weekly summary — {{isoWeek}} — {{sourceLabel}}

## Themes
2-5 themes that recurred across the week. One heading-3 per theme, then 2-4 bullets.

## Decisions made
Bulleted list with date in brackets, e.g. "[Mon] Approved Q3 budget bump".

## Open items rolling forward
Bulleted list of items still unresolved at week end.

## Stakeholder pulse
One bullet per stakeholder who appeared significantly, summarizing their tone/asks.

USER TEMPLATE:
Source: {{sourceLabel}}. Week: {{isoWeek}} ({{periodStart}} to {{periodEnd}}).

Daily summaries for the week (chronological):
{{dailies}}
```

**`action-items.prompt.ts`** (used with tool use)
```
SYSTEM:
Extract concrete, actionable items the user is responsible for, from the supplied summary. An action item must have a clear verb, a clear object, and be something the user (not someone else) needs to do. Skip vague aspirations.

TOOL: record_action_items
INPUT SCHEMA: { items: [{ title: string<=200, detail?: string<=1000, dueDate?: ISO date string }] }

If there are no action items, return { items: [] }.

USER TEMPLATE:
Summary source: {{sourceLabel}}, {{period}}.

{{summaryMarkdown}}
```

**`risks.prompt.ts`** (used with tool use)
```
SYSTEM:
Identify risks surfaced in the supplied summary. A risk is a future negative event that could plausibly occur, with a non-trivial impact on the user, their team, or the business. Do not flag low-impact annoyances.

TOOL: record_risks
INPUT SCHEMA: { risks: [{ title: string<=200, detail?: string<=1000, severity: 'low'|'medium'|'high'|'critical' }] }

USER TEMPLATE:
Summary source: {{sourceLabel}}, {{period}}.

{{summaryMarkdown}}
```

**`insights.prompt.ts`** (long-form)
```
SYSTEM:
You are an analyst producing a concise insight report on {{scopeLabel}} based on the supplied corpus of summaries. Output markdown with:

# {{scopeLabel}} insights — {{periodStart}} to {{periodEnd}}

## Snapshot
2-3 sentence portrait of {{scopeLabel}} during this period.

## Patterns
3-6 bullets covering communication patterns, recurring topics, working style.

## Concerns
Bullets covering anything the user should be paying attention to. Skip section if none.

## Suggested next steps for the user
Bullets phrased as recommendations.

USER TEMPLATE:
Period: {{periodStart}} to {{periodEnd}}. Scope: {{scopeLabel}}.

Corpus (each entry is a daily or weekly summary):
{{corpus}}
```

---

## 10. Connector framework

### 10.1 `connector.interface.ts`
```ts
export interface RawItem {
  id: string;             // provider-side id, used for dedup
  timestamp: Date;
  author?: { id: string; name?: string; email?: string };
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  items: RawItem[];
  newCursor?: string;
}

export interface SummaryResult {
  filePath: string;       // relative
  itemCount: number;
  modelUsed: string;
}

export abstract class Connector {
  abstract readonly kind: ConnectorKind;

  /** Validates raw config from the API request body. Throws BadRequestException on failure. */
  abstract validateConfig(cfg: unknown): Promise<void>;

  /** Pulls new raw items for one target since cursor. */
  abstract syncTarget(args: {
    connectorId: string;
    targetId: string;
    sinceCursor: string | null;
  }): Promise<SyncResult>;

  /** Lists the targets configured on this connector (channel ids, addresses, etc.) */
  abstract listTargets(connectorId: string): Promise<string[]>;

  /** Provider-friendly label for a target, used in markdown headings. */
  abstract labelForTarget(connectorId: string, targetId: string): Promise<string>;
}
```

### 10.2 `connector.registry.ts`
- Module-scoped Map of `kind → Connector instance`.
- Connectors register themselves in their module's `onModuleInit`.

### 10.3 `connector-scheduler.service.ts`
Cron jobs (defined via `@Cron`):

| Cron | Job | Behavior |
|---|---|---|
| `*/5 * * * *` | `syncAll` | For every active connector → for every target → call `syncTarget`. Persist raw items to `data/users/<userId>/<kind>/raw/<targetId>/<YYYY-MM-DD>.jsonl` (append). Update `connector_sync_state.cursor`. |
| `30 23 * * *` | `dailyFanout` | For each connector/target, build daily summary for "today" using accumulated raw items. Write to disk + `summaries` row + run post-summary pipeline (action items, risks). |
| `0 6 * * 1` | `weeklyFanout` | For each connector/target, read last week's daily summaries, generate weekly. Trigger weekly insight job. |

All cron jobs MUST:
- Acquire a per-job in-memory mutex (don't run concurrently with itself)
- Wrap each connector iteration in try/catch; one bad connector cannot break the others
- Log start/end with structured fields `{ job, connectorId, targetId, durationMs, ok }`

### 10.4 Connector config zod schemas (`packages/shared/src/connector.types.ts`)

Live in the shared package so the frontend form validation and the backend `validateConfig` use the **same** schema instance.

```ts
import { z } from 'zod';

export const SlackConnectorConfigSchema = z.object({
  botToken: z.string().regex(/^xoxb-/, 'must start with xoxb-'),
  appToken: z.string().regex(/^xapp-/, 'must start with xapp-').optional().or(z.literal('')),
  teamId: z.string().regex(/^T[A-Z0-9]+$/, 'expected Slack team id like T01234'),
  channelIds: z.array(z.string().regex(/^[CG][A-Z0-9]+$/)).min(1, 'select at least one channel'),
}).strict();

export const OutlookConnectorConfigSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().uuid(),
  cachedTokenFilePath: z.string().min(1),       // relative to data dir; server fills if missing
  monitoredAddresses: z.array(z.string().email()).min(1),
  teamLabels: z.record(z.string().email(), z.string().min(1).max(120)),
  folderId: z.string().min(1),                  // Inbox id by default; resolved during connector creation
}).strict();

export const ConnectorConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slack'), config: SlackConnectorConfigSchema }),
  z.object({ kind: z.literal('outlook'), config: OutlookConnectorConfigSchema }),
]);
```

`Connector.validateConfig(cfg)` calls the appropriate schema's `parseAsync` and re-throws zod errors as `BadRequestException` whose body is `{ message: 'invalid_config', issues: ZodIssue[] }`.

### 10.5 `post-summary.pipeline.ts`
Given a freshly-written daily summary:
1. Read the markdown.
2. Run `extractStructured` for action items → upsert to `action_items` keyed by `(userId, sourceSummaryId, normalizedTitle)` where `normalizedTitle = title.trim().toLowerCase()`. New rows insert; existing rows leave user-edited `status` / `dueDate` untouched and update only `detail`.
3. Run `extractStructured` for risks → upsert to `risks` keyed by `(userId, sourceSummaryId, normalizedTitle)` with the same idempotency rule.
4. Rewrite the per-day combined `action-items/<date>.md` and `risks/<date>.md` files from the **current DB state** for that day (idempotent: full rewrite, not append).

### 10.6 `insights.service.ts`

Lives in `apps/backend/src/insights/`. Single service, used by both the cron weekly job and the on-demand controller endpoints (§11).

```ts
async generate(args: {
  userId: string;
  scope: 'person' | 'team' | 'channel';
  scopeRef: string;       // personId | teamId | `${connectorId}:${targetId}`
  periodStart: Date;
  periodEnd: Date;
}): Promise<Insight>;
```

Behavior:

1. **Build the corpus** (read-only, from disk + DB):
   - `scope='channel'`: read all `summaries` rows for `(userId, connectorId, targetId)` from §11 `scopeRef` parse with `periodStart..periodEnd` overlap. Concatenate the markdown files.
   - `scope='team'`: load the team's member list, then for each member, find every `summaries` row where the daily/weekly markdown contains the person's `name`, `email`, `slackUserId`, or `outlookAddress` (full-text `LIKE` against the file content is fine for v1; pre-built corpus is Phase 9). Concatenate.
   - `scope='person'`: same as team but for one person.
2. **Cap corpus size.** Truncate to 200 KB. If truncated, append a marker `\n\n[truncated for length]\n` and log `{ scope, scopeRef, originalBytes, truncatedTo: 200_000 }`.
3. **Call Claude.** `claude.summarize({ system: insightsPrompt.system(scopeLabel), user: insightsPrompt.userTemplate(...), model: 'deep' })`.
4. **Write file** at `paths.insight(userId, scope, scopeRef, periodStart, periodEnd)`.
5. **Upsert `insights` row** keyed by the table's UNIQUE `(userId, scope, scopeRef, periodStart, periodEnd)`. Replace `filePath` and `modelUsed`.
6. **Return** the row.

`scopeLabel` is computed:
- `person` → `people.name`
- `team` → `teams.name`
- `channel` → `<connector.kind>:<labelForTarget(targetId)>`

The `weeklyFanout` cron (§10.3) generates **person** insights for every active person and **team** insights for every team for the prior ISO week. Channel insights are on-demand only.

If no corpus is found (e.g. no summaries in range), return 404 from the controller — do not write an empty file or an `insights` row.

---

## 11. Connectors API (controllers)

All routes are JSON, prefixed `/api`. The auth stub injects `userId`. **Do NOT accept `userId` in any DTO.**

**Token redaction round-trip (applies to PATCH on connectors):** GET responses redact secret fields (`botToken`, `appToken`, anything matching `/token|secret|password/i`) to the literal string `***`. When PATCH is called with a `config` object, the server **shallow-merges** the incoming config over the existing one, but for any secret field where the incoming value equals `***`, the existing stored value is preserved. This lets the frontend send the redacted form back unchanged without overwriting tokens.

**People & teams creation (v1):** `people` and `teams` rows are created **manually** through `POST /api/people` and `POST /api/teams` (typically via the future People/Teams admin UI; for v1 the implementer can rely on direct API calls / SQL seeds). There is **no auto-extraction** of people from connector raw items in v1 — that's Phase 9 backlog. Without people/team rows, the corresponding insight pages will show an empty state and a "Create your first person/team" CTA.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/connectors` | — | `ConnectorDto[]` |
| POST | `/api/connectors` | `{ kind, name, config }` | `ConnectorDto` |
| GET | `/api/connectors/:id` | — | `ConnectorDto` (config redacted: tokens replaced with `***`) |
| PATCH | `/api/connectors/:id` | `{ name?, config?, status? }` | `ConnectorDto` |
| DELETE | `/api/connectors/:id` | — | 204 |
| POST | `/api/connectors/:id/test` | — | `{ ok: boolean, message?: string }` |
| POST | `/api/connectors/:id/sync` | `{ targetId? }` | `{ queued: number }` |

| Method | Path | Returns |
|---|---|---|
| GET | `/api/summaries/daily?date=YYYY-MM-DD&connectorId=...&targetId=...` | `{ summaries: SummaryDto[], markdownByPath: Record<string,string> }` |
| GET | `/api/summaries/weekly?isoWeek=YYYY-Www&connectorId=...&targetId=...` | same shape |
| POST | `/api/summaries/daily/regenerate` | `{ date, connectorId, targetId }` → `SummaryDto` |
| POST | `/api/summaries/weekly/regenerate` | `{ isoWeek, connectorId, targetId }` → `SummaryDto` |

| Method | Path | Returns |
|---|---|---|
| GET | `/api/action-items?status=&from=&to=` | `ActionItemDto[]` |
| GET | `/api/action-items/markdown?date=YYYY-MM-DD` | `{ filePath: string, markdown: string }` (404 if not generated) |
| PATCH | `/api/action-items/:id` | `{ status?, dueDate? }` → `ActionItemDto` |
| GET | `/api/risks?status=&severity=&from=&to=` | `RiskDto[]` |
| GET | `/api/risks/markdown?date=YYYY-MM-DD` | `{ filePath: string, markdown: string }` (404 if not generated) |
| PATCH | `/api/risks/:id` | `{ status?, severity? }` → `RiskDto` |

| Method | Path | Returns |
|---|---|---|
| GET | `/api/people` | `PersonDto[]` |
| POST | `/api/people` | full body → `PersonDto` |
| PATCH | `/api/people/:id` | partial → `PersonDto` |
| GET | `/api/teams` | `TeamDto[]` (with member ids) |
| POST | `/api/teams` | `{ name, memberIds[] }` → `TeamDto` |
| PATCH | `/api/teams/:id` | partial → `TeamDto` |
| GET | `/api/insights/person/:personId?from=&to=` | `{ insight: InsightDto, markdown: string }` (404 if not generated) |
| POST | `/api/insights/person/:personId/generate` | `{ from, to }` → `InsightDto` |
| GET | `/api/insights/team/:teamId?from=&to=` | same |
| POST | `/api/insights/team/:teamId/generate` | `{ from, to }` → `InsightDto` |
| GET | `/api/insights/channel/:scopeRef?from=&to=` | `{ insight: InsightDto, markdown: string }` (404 if not generated). `scopeRef` is `<connectorId>:<targetId>` URL-encoded. |
| POST | `/api/insights/channel/:scopeRef/generate` | `{ from, to }` → `InsightDto` |

DTOs are defined alongside their feature module and re-exported from `@kuros/shared` where the frontend consumes them.

---

## 12. Slack connector — implementation notes

v1 is **polling-only** via `@slack/web-api` `WebClient`. No Socket Mode, no Bolt, no event handlers. Push events are deferred to Phase 9.

### 12.1 Manual setup the user must do (document in README)
1. Create a Slack app at api.slack.com.
2. Bot scopes: `channels:history`, `groups:history`, `channels:read`, `groups:read`, `users:read`, `users:read.email`.
3. Install to workspace, copy `xoxb-` token — paste into the Connectors form in the UI.
4. (Optional, for future push events) Enable Socket Mode and generate an `xapp-` token; paste into the Connectors form. v1 stores it but does not use it.
5. Invite the bot to each channel to be monitored.

Tokens are entered into the Connectors page in the UI; env vars (`SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`) are fallbacks for the implementer's local testing only and are not read by the runtime connector.

### 12.2 `slack.client.ts`
Wrapper around `@slack/web-api` `WebClient`. Methods:
- `listChannels()` → `[{ id, name }]` (joined channels only)
- `historySince(channelId, oldestTs?)` → `{ messages, latestTs }` using cursor pagination (`conversations.history`)
- `userInfo(userId)` → `{ id, name, email? }` with in-memory cache

### 12.3 `slack.connector.ts`
- `kind = 'slack'`
- `validateConfig`: zod-validate `SlackConnectorConfig`, then call `auth.test` to verify token.
- `listTargets(connectorId)` → `config.channelIds`
- `labelForTarget(connectorId, channelId)` → `#channel-name` (cached)
- `syncTarget`:
  1. Read `connector_sync_state.cursor` (Slack `ts`)
  2. Call `historySince(channelId, cursor)`
  3. For each message, resolve user → build `RawItem` with text, author, ts
  4. Return `{ items, newCursor: latestTs }`

### 12.4 Daily summary input format
The implementer formats `RawItem[]` for the prompt as:
```
[HH:mm] @author: text (one item per line, threads collapsed with two-space indent)
```

---

## 13. Outlook connector — implementation notes

### 13.1 Manual setup
1. Register an app in Azure AD (Entra ID).
2. Platform: "Mobile and desktop applications", redirect `http://localhost`.
3. API permissions (delegated): `Mail.Read`, `User.Read`, `offline_access`. Grant admin consent.
4. Copy tenant id and client id into the connector form.

### 13.2 `outlook.auth.ts`
- Uses `@azure/msal-node` `PublicClientApplication`.
- Token cache persisted to disk via `StorageService` at the path stored in `OutlookConnectorConfig.cachedTokenFilePath`.
- `getAccessToken(connectorId)` returns a fresh token, kicking off device-code flow only on first run (the device code is logged AND surfaced via a `/api/connectors/:id/test` response so the UI can show it).

### 13.3 `outlook.client.ts`
Wrapper over `@microsoft/microsoft-graph-client`. Methods:
- `mailFolders()` → list of folders (Inbox + custom)
- `messagesSince(folderId, deltaToken?)` → uses `/me/mailFolders/{folderId}/messages/delta`. Returns `{ messages, deltaLink }`. **No `$filter` on recipients** — Graph's delta endpoint doesn't support arbitrary `$filter` on `toRecipients`. Filtering by address is done by the connector after fetch.

### 13.4 `outlook.connector.ts`
- `kind = 'outlook'`
- `validateConfig`: parse with `OutlookConnectorConfigSchema` (§10.4). On creation, if `folderId` is empty, call `mailFolders()` and pick the user's `Inbox` (the well-known display name) and persist its id back into config.
- **Targets** are mail folder ids. `listTargets(connectorId)` returns `[config.folderId]` (v1 supports one folder per connector; the ability to monitor multiple folders is Phase 9).
- `labelForTarget(connectorId, folderId)` returns the folder's display name (cached).
- **Cursor** = Graph delta token, persisted in `connector_sync_state.cursor` keyed by `(connectorId, folderId)`.
- `syncTarget`:
  1. Read `connector_sync_state.cursor` (delta token) for `(connectorId, folderId)`.
  2. Call `messagesSince(folderId, cursor)`.
  3. **Client-side filter:** keep messages whose `toRecipients` OR `ccRecipients` includes the user's `users.email` OR any address in `OutlookConnectorConfig.monitoredAddresses`. Drop the rest.
  4. For each kept message, group by which monitored address (or "me") matched and emit `RawItem` with `metadata.matchedAddress` set. The downstream daily fanout treats each monitored address as a logical sub-target for summary file naming (path uses `targetId = sanitize(matchedAddress)` and `labelForTarget` reads `teamLabels[address]`).
  5. Return `{ items, newCursor: deltaLink }`.

> **Note on `targetId` reuse:** the row in `connector_sync_state` uses the folder id (one delta cursor per folder), but daily/weekly summary files and `summaries.targetId` use the matched address. This is the only place where the storage targetId differs from the sync-state targetId — implementer must take care.

---

## 14. Frontend — exact pages

### 14.1 Routing (`routes.tsx`)
```
/                            → redirect: if !onboarded → /onboarding, else → /daily
/onboarding                  → OnboardingPage (full-screen, no AppShell)
/daily                       → DailySummaryPage
/weekly                      → WeeklySummaryPage
/risks-actions               → RisksActionsPage
/insights/people             → PersonInsightsPage (search bar + result)
/insights/people/:personId   → PersonInsightsPage (preselected)
/insights/teams              → TeamInsightsPage
/insights/teams/:teamId      → TeamInsightsPage (preselected)
/connectors                  → ConnectorsPage
/connectors/new              → ConnectorsPage (drawer open)
/connectors/:id              → ConnectorsPage (drawer open, edit mode)
/settings/profile            → ProfilePage (edit email, timezone, name post-onboarding)
```

**Onboarding gate.** A top-level `<RequireOnboarding>` wrapper around AppShell calls `useMe()` (TanStack Query for `GET /api/me`). While loading: render full-page `<CircularProgress />`. If `!onboarded`: `<Navigate to="/onboarding" replace />`. The `/onboarding` route itself is rendered outside the AppShell so the side nav doesn't appear before setup is complete.

### 14.2 Side nav structure (`nav-config.ts`)
```ts
export const nav = [
  { group: 'Today', items: [
    { label: 'Daily summary', to: '/daily', icon: 'Today' },
    { label: 'Action items', to: '/risks-actions?tab=actions', icon: 'CheckBox' },
    { label: 'Risks', to: '/risks-actions?tab=risks', icon: 'WarningAmber' },
  ]},
  { group: 'This week', items: [
    { label: 'Weekly summary', to: '/weekly', icon: 'CalendarViewWeek' },
  ]},
  { group: 'Insights', items: [
    { label: 'People', to: '/insights/people', icon: 'Person' },
    { label: 'Teams', to: '/insights/teams', icon: 'Groups' },
  ]},
  { group: 'Settings', items: [
    { label: 'Connectors', to: '/connectors', icon: 'Cable' },
    { label: 'Profile', to: '/settings/profile', icon: 'AccountCircle' },
  ]},
];
```

### 14.3 Page contracts

**OnboardingPage** (`/onboarding`)
- Full-screen card, no nav. Heading: "Welcome to Kuros Manager — let's set up your profile."
- Form fields (RHF + zod):
  - `name` — required, 1..200 chars.
  - `email` — required, valid email. Hint text: "We use this to detect when you're @-mentioned or addressed directly."
  - `timezone` — required, MUI `Autocomplete` populated from `Intl.supportedValuesOf('timeZone')`. Default-select the browser's `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- Submit calls `PATCH /api/me`. On 200 → invalidate `['me']` query → `<Navigate to="/connectors" replace />` (so the user immediately lands on connector setup, the next required step).
- Error rendering: inline under the offending field for 400, top-of-form alert for 5xx.

**ProfilePage** (`/settings/profile`)
- Same fields as OnboardingPage, prefilled from `useMe()`. Save button calls `PATCH /api/me`. No redirect on success — show a snackbar.

**ConnectorsPage**
- Layout: 2-col list + drawer.
- List: name, kind chip, status chip, last error (truncated), buttons: Test / Sync now / Edit / Delete.
- Drawer: form. `kind` field switches between `<SlackConfigFields />` and `<OutlookConfigFields />`.
- Slack fields: bot token, app token, team id, channel ids (chip input).
- Outlook fields: tenant id, client id, monitored addresses (each with team label).
- "Test" button calls `POST /api/connectors/:id/test`. For Outlook, displays device-code instructions in a modal until token is obtained.

**DailySummaryPage**
- Top bar: date picker (default today), connector dropdown (multi), target dropdown (multi).
- Body: per-target accordion. Each accordion renders the markdown via `<MarkdownView />`.
- "Regenerate" button per target → `POST /api/summaries/daily/regenerate`.

**WeeklySummaryPage**
- Top bar: ISO week picker (default current), connector dropdown, target dropdown.
- Body: same accordion pattern.

**RisksActionsPage**
- Tabs: Action items | Risks (controlled via `?tab=`).
- Action items table cols: title, detail (truncated), source (link to summary day), due date, status (editable chip), updatedAt.
- Risks table cols: title, severity, status, source, updatedAt.
- Filters: status multi-select, severity multi-select (risks only), date range.

**PersonInsightsPage**
- Person search (autocomplete from `/api/people`).
- On select: date range picker (default last 14 days), `Generate insight` button, then markdown view.

**TeamInsightsPage**
- Team picker (autocomplete).
- Same generate-and-render pattern as person.

### 14.4 API client (`api/client.ts`)
- Single `fetch` wrapper, base URL from `import.meta.env.VITE_API_BASE_URL`.
- Adds `Content-Type: application/json` for non-GET, throws on `!response.ok`, parses JSON.
- No auth header until we add real auth; backend ignores it for now.

### 14.5 TanStack Query keys
| Resource | Query key |
|---|---|
| Me | `['me']` |
| Connectors list | `['connectors']` |
| Connector detail | `['connectors', id]` |
| Daily summaries | `['summaries', 'daily', { date, connectorId, targetId }]` |
| Weekly summaries | `['summaries', 'weekly', { isoWeek, connectorId, targetId }]` |
| Action items | `['action-items', filters]` |
| Risks | `['risks', filters]` |
| People | `['people']` |
| Teams | `['teams']` |
| Person insight | `['insights', 'person', personId, { from, to }]` |
| Team insight | `['insights', 'team', teamId, { from, to }]` |

Mutations call `queryClient.invalidateQueries` on the relevant keys.

### 14.6 Theme
- MUI v6 `createTheme` with mode toggle (default light). Persist mode in `localStorage` key `kuros.theme`.
- No custom colors; default palette is fine.

### 14.7 `apps/frontend/package.json`

```json
{
  "name": "@kuros/frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 5173",
    "lint": "eslint \"src/**/*.{ts,tsx}\"",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-router-dom": "6.26.2",
    "@tanstack/react-query": "5.59.0",
    "@mui/material": "6.1.2",
    "@mui/icons-material": "6.1.2",
    "@emotion/react": "11.13.3",
    "@emotion/styled": "11.13.0",
    "react-hook-form": "7.53.0",
    "@hookform/resolvers": "3.9.0",
    "zod": "3.23.8",
    "react-markdown": "9.0.1",
    "remark-gfm": "4.0.0",
    "date-fns": "3.6.0",
    "@kuros/shared": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.2",
    "vite": "5.4.8",
    "vitest": "2.1.2",
    "@vitest/ui": "2.1.2",
    "jsdom": "25.0.1",
    "@testing-library/react": "16.0.1",
    "@testing-library/jest-dom": "6.5.0",
    "@testing-library/user-event": "14.5.2",
    "typescript": "5.5.4"
  }
}
```

> Same pinning rule as the backend (§5): if a version no longer resolves, stop and ask.

### 14.8 `apps/frontend/vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  resolve: { alias: { '@kuros/shared': new URL('../../packages/shared/src/index.ts', import.meta.url).pathname } },
});
```

### 14.9 `apps/frontend/tsconfig.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "noEmit": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`apps/frontend/tsconfig.node.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "module": "ESNext", "moduleResolution": "Bundler", "noEmit": true },
  "include": ["vite.config.ts"]
}
```

### 14.10 `apps/frontend/vitest.config.ts`

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom';
```

### 14.11 Frontend smoke test

Place at `src/test/AppShell.smoke.test.tsx`:
```ts
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '../layout/AppShell';

describe('AppShell', () => {
  it('renders nav groups', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><AppShell /></MemoryRouter>
      </QueryClientProvider>
    );
    expect(screen.getByText(/Today/i)).toBeInTheDocument();
    expect(screen.getByText(/Insights/i)).toBeInTheDocument();
  });
});
```

---

## 15. Phasing for execution

Implementer executes in this order, committing after each phase passes a smoke test:

1. **Phase 0** — Workspace files (§3), shared package skeleton (§4 minimal types), git init, first commit.
2. **Phase 1a** — Backend skeleton: app.module, config, logging, auth stub, health endpoint. Commit. `pnpm --filter backend run dev` should boot and `GET /api/health` should return `{ ok: true }`.
3. **Phase 1b** — Database module + entities + initial migration. `pnpm db:migrate` should create the schema and tables. Commit.
4. **Phase 1c** — `/api/me` GET + PATCH endpoints; `MeModule` + `MeService`; onboarding-gate behavior in cron stubs (no-op when not onboarded). Commit when `curl PATCH /api/me` round-trips.
5. **Phase 2** — Claude service + prompt registry. Commit.
6. **Phase 3** — Connectors core (interface, registry, scheduler stub, post-summary pipeline scaffold), connectors controller with CRUD only. Commit. `POST /api/connectors` should create a row (returns 409 until onboarded).
7. **Phase 4** — Slack connector. Commit when daily summary writes successfully against a real token.
8. **Phase 5** — Outlook connector. Commit when daily summary writes successfully.
9. **Phase 6** — Frontend skeleton: vite + MUI + router + layout + nav + onboarding gate. Commit. `pnpm --filter frontend run dev` should serve on 5173 and route to `/onboarding` on first load.
10. **Phase 7** — One page at a time: Onboarding → Profile → Connectors → Daily → Weekly → Risks/Actions → People insights → Team insights. Commit per page.
11. **Phase 8** — Pre-desktop / pre-multi-user audit. Add an `electron/` notes section to README.

---

## 16. Smoke-test checklist (per phase)

The implementer must verify before committing:

- **Phase 1a:** `curl localhost:3000/api/health` → `{ ok: true, version: ... }`
- **Phase 1b:** Connect with `psql` → `SELECT id,email,timezone,name FROM kuros_manager.users;` returns the seed row with id `00000000-…01` and NULL email/timezone/name.
- **Phase 1c:** `curl GET /api/me` returns `{ onboarded: false, ... }`. `curl -X PATCH /api/me -d '{"email":"x@y.z","timezone":"UTC","name":"X"}'` returns `{ onboarded: true, ... }`. Re-running `GET /api/me` reflects the new values. Trigger a cron job manually (or wait): when `onboarded=false`, log line `awaiting_onboarding` is emitted and no Anthropic call is made.
- **Phase 2:** A test command (e.g. `pnpm --filter backend run claude:smoke`) hits Claude and prints output. (Add a simple CLI script under `apps/backend/scripts/claude-smoke.ts`.)
- **Phase 3:** `POST /api/connectors` with valid Slack body returns 201; row persists; `GET /api/connectors/:id` redacts `botToken`.
- **Phase 4:** Trigger `POST /api/connectors/:id/sync` → see `RawItem`s collected on disk; trigger daily fanout → markdown file appears; DB `summaries` row created.
- **Phase 6:** Frontend boots, sidebar renders all nav items.
- **Phase 7 (each page):** Page renders against backend with seeded data; mutations refetch.

Failing any check → stop and report; do not proceed.

---

## 17. What is explicitly OUT of scope for v1

To prevent scope creep and corresponding hallucinations:

- Real authentication (login, password, JWT) — stub only
- Encryption-at-rest for `connectors.config` — plaintext jsonb for v1
- Multi-workspace Slack — one workspace per Slack connector instance
- Outlook calendar — only mail
- WebSocket / SSE push to frontend — polling only
- File attachments rendering — markdown text only
- Internationalization
- Mobile / responsive polish — desktop layout only
- Tests beyond the smoke-test endpoints — unit and e2e tests are post-v1
- CI / GitHub Actions
- Electron/Tauri wrapping — only a doc note

When the implementer encounters a feature gap that feels essential, it should be added to the Phase 9 backlog (§18 below), **not implemented opportunistically**.

---

## 18. Phase 9 backlog

Items deferred from v1, captured here so they aren't forgotten and aren't done opportunistically. Append to this list — do not delete entries when starting work; move them into a phase plan instead.

- **Slack push events.** Re-introduce `@slack/bolt` + Socket Mode for real-time event handling (mentions, message-edited, etc.). Lifecycle: one `App` per active connector, started on `onModuleInit` and on connector creation, stopped on delete/pause.
- **Auto-extraction of people from raw items.** When a Slack message or Outlook mail comes in with a new author, upsert a `people` row (with `slackUserId` or `outlookAddress` populated). Heuristic match against existing `people.email` to dedupe.
- **Multi-folder Outlook monitoring.** Today, one `outlook` connector watches one folder. Lift this to N folders per connector with one delta cursor each.
- **Connector config encryption-at-rest.** Move `connectors.config` from plain `jsonb` to AES-GCM-encrypted blob with a key from env or OS keychain.
- **Real auth.** Replace `auth.guard.ts` stub with JWT or session auth; populate `req.user` from claims.
- **WebSocket / SSE push.** Replace TanStack Query polling for summaries / action items with server-pushed invalidation.
- **Pre-built corpus index for insights.** Today the team/person corpus build does a `LIKE` over markdown files; replace with a denormalized index keyed by `(personId, summaryId)`.
- **CI / GitHub Actions.** Lint + typecheck + Vitest + backend Jest on PR.
- **Electron/Tauri wrapping.** Materialize the documentation note in §17 into an actual desktop build.
- **Hosted multi-user mode.** `S3Storage` impl, real auth, BullMQ scheduler with Redis.
- **Production CORS rules.** Today `production` mode boots with CORS off (§7.2). Add explicit `KUROS_ALLOWED_ORIGIN` handling once hosted mode is real.
