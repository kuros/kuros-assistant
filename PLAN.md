# Kuros Manager — Plan of Action

## 1. Goals

Build a personal productivity hub that ingests data from work tools (Slack, Outlook, more later), uses Claude to summarize and reason over it, and surfaces summaries / insights / action items / risks through a local web UI.

**Three deployment targets to design for from day one:**
1. **Local-first** (initial): runs on the user's machine, single user, data on local disk.
2. **Desktop app** (future): wrap the same backend + frontend in Electron or Tauri.
3. **Hosted, multi-user** (future): same code, swap storage + auth, scale.

The architectural choices below all flow from "make 1 work today, but don't paint ourselves into a corner for 2 and 3."

---

## 2. High-level architecture

```
kuros-manager/
├── apps/
│   ├── backend/        NestJS API + workers
│   └── frontend/       React + MUI SPA (Vite)
├── packages/
│   └── shared/         shared TS types / DTOs / zod schemas
├── data/               (gitignored) markdown summaries, generated locally
│   └── users/<userId>/<connector>/...
├── docker-compose.yml  postgres (+ optional redis)
├── package.json        pnpm workspace root
└── PLAN.md
```

### 2.1 Backend stack

| Concern | Choice | Rationale |
|---|---|---|
| Framework | **NestJS** | requested; module/DI fits a connector framework |
| ORM | **TypeORM** | per user; mature decorators, first-class `schema` support |
| DB | **Postgres**, schema `kuros_manager` | requested |
| Job scheduler | **`@nestjs/schedule`** (cron) for v1; **BullMQ + Redis** when we move off local | no Redis dep needed for local-first |
| Claude | **`@anthropic-ai/sdk`** wrapped in a `ClaudeService` | swap models per task; prompt caching for repeated context |
| Storage | `StorageService` interface — `LocalFsStorage` now, `S3Storage` later | enables hosted target without refactor |
| Auth | Stub `AuthGuard` injecting `userId=1` locally; JWT-ready surface | single-user today, multi-user-ready |
| Validation | `class-validator` + `zod` (in shared package for FE/BE parity) | |
| Logging | `pino` via `nestjs-pino` | structured, fast |

### 2.2 Frontend stack

| Concern | Choice |
|---|---|
| Build | Vite |
| UI | React 18 + MUI v6 |
| Routing | React Router v6 |
| Server state | TanStack Query |
| Client state | Zustand (light) — only if needed |
| Forms | React Hook Form + zod (shared schemas) |
| Markdown rendering | `react-markdown` + `remark-gfm` |

**Desktop-readiness rule:** the frontend uses only browser APIs — no `fs`, no `child_process`, no `electron` imports. When we wrap with Electron/Tauri later, the SPA loads unchanged and the NestJS backend runs as a sidecar process.

### 2.3 Data model (Postgres, schema `kuros_manager`)

Postgres stores **pointers and metadata only**. Summary bodies, raw messages, and long-form insights live as markdown on disk.

```
users(id, email, created_at)
connectors(id, user_id, kind /* 'slack' | 'outlook' */, name, config_json, status, created_at)
connector_sync_state(connector_id, target_id /* channel id, mailbox folder, etc. */, cursor, last_run_at)
summaries(id, user_id, connector_id, target_id, kind /* 'daily' | 'weekly' */,
          period_start, period_end, file_path, created_at)
insights(id, user_id, scope /* 'person' | 'team' | 'channel' */, scope_ref,
         period_start, period_end, file_path, created_at)
action_items(id, user_id, source_summary_id, title, due_date, status, file_path, created_at)
risks(id, user_id, source_summary_id, title, severity, status, file_path, created_at)
people(id, user_id, name, email, slack_user_id, outlook_address, role)
teams(id, user_id, name)
team_members(team_id, person_id)
```

Every row carries `user_id` from day one even though we only have one user — this is the cheapest way to keep the multi-user door open.

### 2.4 Local file layout

```
data/users/<userId>/
  slack/
    daily/<channelId>/<YYYY-MM-DD>.md
    weekly/<channelId>/<YYYY-Www>.md
  outlook/
    daily/<team>/<YYYY-MM-DD>.md
    weekly/<team>/<YYYY-Www>.md
  insights/<scope>/<scopeRef>/<period>.md
  action-items/<YYYY-MM-DD>.md
  risks/<YYYY-MM-DD>.md
```

Path is computed by `StorageService.pathFor(...)`; nothing else hardcodes paths.

### 2.5 Connector framework

Each connector is a Nest module that implements:

```ts
interface Connector {
  kind: 'slack' | 'outlook' | string;
  validateConfig(cfg: unknown): Promise<void>;
  syncSince(connectorId: string, since: Date): Promise<RawItem[]>;  // pulls raw messages/mails
  buildDailySummary(connectorId: string, day: Date): Promise<SummaryResult>;
  buildWeeklySummary(connectorId: string, week: ISOWeek): Promise<SummaryResult>;
}
```

A `ConnectorRegistry` maps `kind → Connector`. The scheduler iterates connectors and calls them generically — the daily/weekly/insight/risk/action-item logic is the same shape for every connector, so adding a 3rd one later is just a new module.

### 2.6 Claude integration

A single `ClaudeService` exposes:
- `summarize(prompt, context, opts)` — daily/weekly summary generation
- `extract(schema, context)` — structured action items / risks via tool use or JSON mode
- `insight(prompt, context, opts)` — long-form insight reports

Prompts live in `apps/backend/src/prompts/*.ts` as exported template functions — easy to iterate without code changes elsewhere. We use prompt caching on the system prompt + reference docs to keep cost down for repeated daily runs.

### 2.7 Frontend layout & pages

**Shell:** AppBar (top) + collapsible nested side nav (MUI `Drawer` + `List`).

Side nav groups:
- **Today** → Daily summary, Action items, Risks
- **This week** → Weekly summary
- **Insights** → Person insights, Team insights
- **Settings** → Connectors

Pages map 1:1 to your list:
1. `/connectors` — list, add, configure, test, enable/disable
2. `/daily` — pick date → render markdown per channel/team
3. `/weekly` — pick week → render rollup markdown
4. `/risks-actions` — table view (status, severity, due date) + linked source summary
5. `/insights/people/:personId` — generate-on-demand person report
6. `/insights/teams/:teamId` — generate-on-demand team report

---

## 3. Phased delivery

Each phase ends in something runnable. Phase numbers are just ordering, not estimates.

### Phase 0 — Repo bootstrap
- pnpm workspaces, TS strict, ESLint + Prettier, EditorConfig
- `docker-compose.yml` with postgres
- `.env.example`, `.gitignore` (excludes `data/`)
- Root scripts: `dev`, `build`, `test`, `lint`

### Phase 1 — Backend skeleton
- NestJS app, health endpoint
- TypeORM data source + entities (tables from §2.3), initial migration creating `kuros_manager` schema
- `StorageService` + `LocalFsStorage`
- Stub `AuthGuard` (`userId=1`)
- pino logging, global exception filter
- Config module with `.env` validation

### Phase 2 — Claude service
- `ClaudeService` wrapping Anthropic SDK
- Prompt template registry
- A smoke-test endpoint that runs a trivial summarize call

### Phase 3 — Connector framework
- `Connector` interface, `ConnectorRegistry`
- `connectors`, `connector_sync_state` CRUD endpoints
- Generic scheduler: cron-driven daily/weekly fan-out across registered connectors
- Generic post-summary pipeline: `extractActionItems`, `extractRisks`, `generateInsights`

### Phase 4 — Slack connector
- Slack Bolt SDK, Socket Mode for local dev (no public URL)
- OAuth flow stored in `connectors.config_json` (token, team id, configured channel ids)
- `syncSince` via `conversations.history` with cursor in `connector_sync_state`
- `buildDailySummary` / `buildWeeklySummary` — write markdown via `StorageService`
- Hooks into the generic action-item / risk / insight pipeline

### Phase 5 — Outlook connector
- Microsoft Graph SDK
- OAuth device-code flow for local
- Filter: mails addressed to me, scoped per configured team
- Same daily/weekly + downstream pipeline as Slack

### Phase 6 — Frontend skeleton
- Vite + MUI + Router scaffold
- Layout shell with nested sidebar
- TanStack Query setup, API client generated from shared types
- Auth stub (no login screen yet — bearer-less local mode)

### Phase 7 — Frontend pages
- Connectors page (forms via RHF + zod)
- Daily summary viewer (date picker + markdown)
- Weekly summary viewer
- Risks & action items table (filters, status updates)
- Person insight page (search person → generate → render)
- Team insight page (pick team → generate → render)

### Phase 8 — Desktop & multi-user readiness checks
- Audit: no Node-only APIs leaked into frontend, no hardcoded `localhost` outside config
- Document the wrap path (Electron `main` runs `nest start`, BrowserWindow loads built SPA)
- Document the hosted path (swap `LocalFsStorage` → `S3Storage`, swap stub auth → real JWT, swap cron → BullMQ)

---

## 4. Locked decisions

All open questions are now locked in [IMPLEMENTATION.md §0](IMPLEMENTATION.md). Summary:

1. Claude access: Anthropic API + `ANTHROPIC_API_KEY` (`claude-sonnet-4-6` fast / `claude-opus-4-7` deep).
2. ORM: **TypeORM**.
3. Scheduler: `@nestjs/schedule` (cron).
4. Slack: Socket Mode bot+app token.
5. Outlook: MSAL device-code flow.
6. Data dir: `./data` (override `KUROS_DATA_DIR`).
7. Ports: backend `3000`, frontend `5173`.
8. Package manager: pnpm.

---

## 5. Source of truth

[IMPLEMENTATION.md](IMPLEMENTATION.md) is the implementation spec. If it conflicts with this file, IMPLEMENTATION.md wins.
