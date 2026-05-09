# Per-User Anthropic Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `ANTHROPIC_API_KEY`, `CLAUDE_MODEL_FAST`, and `CLAUDE_MODEL_DEEP` from global env vars to a per-user `user_settings` database table, exposed via `/api/me/settings` and a new AI Settings frontend page.

**Architecture:** New `user_settings` table (1:1 with users) stores the API key and model preferences. `UserSettingsService` (in `MeModule`) manages CRUD and raw key access. `ClaudeClientFactory` (in `ClaudeModule`) fetches the user's settings per request and creates an Anthropic client. `ClaudeService` methods gain a `userId` param and delegate client/model resolution to the factory.

**Tech Stack:** NestJS 10, TypeORM 0.3, PostgreSQL, React 18, MUI v6, react-hook-form, Zod, TanStack Query v5

---

### Task 1: Shared DTOs

**Files:**
- Modify: `packages/shared/src/api.contracts.ts`

- [ ] **Step 1: Add `UserSettingsDto` and `UpdateUserSettingsRequest` to the contracts file**

Open `packages/shared/src/api.contracts.ts` and append at the bottom:

```ts
export interface UserSettingsDto {
  hasAnthropicKey: boolean;
  claudeModelFast: string;
  claudeModelDeep: string;
}

export interface UpdateUserSettingsRequest {
  anthropicApiKey?: string;
  claudeModelFast?: string;
  claudeModelDeep?: string;
}
```

- [ ] **Step 2: Build shared package**

```bash
pnpm --filter @kuros/shared build
```

Expected: exits 0, `packages/shared/dist/` updated.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/api.contracts.ts packages/shared/dist
git commit -m "feat: add UserSettingsDto and UpdateUserSettingsRequest to shared"
```

---

### Task 2: UserSettingsEntity + migration

**Files:**
- Create: `apps/backend/src/entities/user-settings.entity.ts`
- Create: `apps/backend/src/database/migrations/1700000000001-UserSettings.ts`

- [ ] **Step 1: Create the entity**

Create `apps/backend/src/entities/user-settings.entity.ts`:

```ts
import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity({ schema: 'kuros_manager', name: 'user_settings' })
export class UserSettingsEntity {
  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ type: 'text', name: 'anthropic_api_key', nullable: true })
  anthropicApiKey!: string | null;

  @Column({ type: 'text', name: 'claude_model_fast', nullable: true })
  claudeModelFast!: string | null;

  @Column({ type: 'text', name: 'claude_model_deep', nullable: true })
  claudeModelDeep!: string | null;
}
```

- [ ] **Step 2: Create the migration**

Create `apps/backend/src/database/migrations/1700000000001-UserSettings.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserSettings1700000000001 implements MigrationInterface {
  name = 'UserSettings1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "kuros_manager"."user_settings" (
        "user_id" uuid NOT NULL,
        "anthropic_api_key" text,
        "claude_model_fast" text,
        "claude_model_deep" text,
        CONSTRAINT "pk_user_settings" PRIMARY KEY ("user_id"),
        CONSTRAINT "fk_user_settings_user" FOREIGN KEY ("user_id")
          REFERENCES "kuros_manager"."users"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "kuros_manager"."user_settings"`);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/entities/user-settings.entity.ts \
        apps/backend/src/database/migrations/1700000000001-UserSettings.ts
git commit -m "feat: add UserSettingsEntity and migration"
```

---

### Task 3: UserSettingsService

**Files:**
- Create: `apps/backend/src/me/user-settings.service.ts`

- [ ] **Step 1: Create the service**

Create `apps/backend/src/me/user-settings.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSettingsEntity } from '../entities/user-settings.entity';
import type { UserSettingsDto } from '@kuros/shared';

const DEFAULT_MODEL_FAST = 'claude-sonnet-4-6';
const DEFAULT_MODEL_DEEP = 'claude-opus-4-7';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(UserSettingsEntity)
    private readonly repo: Repository<UserSettingsEntity>,
  ) {}

  private toDto(row: UserSettingsEntity | null): UserSettingsDto {
    return {
      hasAnthropicKey: row?.anthropicApiKey != null && row.anthropicApiKey.length > 0,
      claudeModelFast: row?.claudeModelFast ?? DEFAULT_MODEL_FAST,
      claudeModelDeep: row?.claudeModelDeep ?? DEFAULT_MODEL_DEEP,
    };
  }

  async get(userId: string): Promise<UserSettingsDto> {
    const row = await this.repo.findOne({ where: { userId } });
    return this.toDto(row);
  }

  async update(
    userId: string,
    dto: { anthropicApiKey?: string; claudeModelFast?: string; claudeModelDeep?: string },
  ): Promise<UserSettingsDto> {
    let row = await this.repo.findOne({ where: { userId } });
    if (!row) {
      row = this.repo.create({ userId, anthropicApiKey: null, claudeModelFast: null, claudeModelDeep: null });
    }
    if (dto.anthropicApiKey != null) row.anthropicApiKey = dto.anthropicApiKey;
    if (dto.claudeModelFast != null) row.claudeModelFast = dto.claudeModelFast;
    if (dto.claudeModelDeep != null) row.claudeModelDeep = dto.claudeModelDeep;
    await this.repo.save(row);
    return this.toDto(row);
  }

  async getRawApiKey(userId: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { userId } });
    return row?.anthropicApiKey ?? null;
  }

  async getEffective(
    userId: string,
  ): Promise<{ apiKey: string | null; modelFast: string; modelDeep: string }> {
    const row = await this.repo.findOne({ where: { userId } });
    return {
      apiKey: row?.anthropicApiKey ?? null,
      modelFast: row?.claudeModelFast ?? DEFAULT_MODEL_FAST,
      modelDeep: row?.claudeModelDeep ?? DEFAULT_MODEL_DEEP,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/me/user-settings.service.ts
git commit -m "feat: add UserSettingsService"
```

---

### Task 4: MeSettingsController, backend DTO, and MeModule wiring

**Files:**
- Create: `apps/backend/src/me/dto/update-user-settings.dto.ts`
- Create: `apps/backend/src/me/me-settings.controller.ts`
- Modify: `apps/backend/src/me/me.module.ts`

- [ ] **Step 1: Create the backend validation DTO**

Create `apps/backend/src/me/dto/update-user-settings.dto.ts`:

```ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  anthropicApiKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claudeModelFast?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  claudeModelDeep?: string;
}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/me/me-settings.controller.ts`:

```ts
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserSettingsService } from './user-settings.service';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';
import { CurrentUser } from '../common/auth/current-user.decorator';

@Controller('api/me/settings')
export class MeSettingsController {
  constructor(private readonly userSettings: UserSettingsService) {}

  @Get()
  get(@CurrentUser() user: { id: string }) {
    return this.userSettings.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: { id: string }, @Body() dto: UpdateUserSettingsDto) {
    return this.userSettings.update(user.id, dto);
  }
}
```

- [ ] **Step 3: Update MeModule to wire the new files**

Replace the full contents of `apps/backend/src/me/me.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../entities/user.entity';
import { UserSettingsEntity } from '../entities/user-settings.entity';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { MeSettingsController } from './me-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserSettingsEntity])],
  controllers: [MeController, MeSettingsController],
  providers: [MeService, UserSettingsService],
  exports: [MeService, UserSettingsService],
})
export class MeModule {}
```

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/me/dto/update-user-settings.dto.ts \
        apps/backend/src/me/me-settings.controller.ts \
        apps/backend/src/me/me.module.ts
git commit -m "feat: add MeSettingsController and wire UserSettingsService into MeModule"
```

---

### Task 5: ClaudeClientFactory and updated ClaudeModule

**Files:**
- Create: `apps/backend/src/claude/claude-client.factory.ts`
- Modify: `apps/backend/src/claude/claude.module.ts`

- [ ] **Step 1: Create ClaudeClientFactory**

Create `apps/backend/src/claude/claude-client.factory.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { UserSettingsService } from '../me/user-settings.service';

export interface ClaudeContext {
  client: Anthropic;
  modelFast: string;
  modelDeep: string;
}

@Injectable()
export class ClaudeClientFactory {
  constructor(private readonly userSettings: UserSettingsService) {}

  async getContext(userId: string): Promise<ClaudeContext> {
    const { apiKey, modelFast, modelDeep } = await this.userSettings.getEffective(userId);
    if (!apiKey) {
      throw new BadRequestException('Anthropic API key not configured — set it in AI Settings');
    }
    return { client: new Anthropic({ apiKey }), modelFast, modelDeep };
  }
}
```

- [ ] **Step 2: Update ClaudeModule to import MeModule and provide the factory**

Replace the full contents of `apps/backend/src/claude/claude.module.ts`:

```ts
import { Global, Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { ClaudeClientFactory } from './claude-client.factory';
import { ClaudeService } from './claude.service';

@Global()
@Module({
  imports: [MeModule],
  providers: [ClaudeClientFactory, ClaudeService],
  exports: [ClaudeService],
})
export class ClaudeModule {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/claude/claude-client.factory.ts \
        apps/backend/src/claude/claude.module.ts
git commit -m "feat: add ClaudeClientFactory and update ClaudeModule"
```

---

### Task 6: Update ClaudeService

**Files:**
- Modify: `apps/backend/src/claude/claude.service.ts`

- [ ] **Step 1: Replace the full contents of `claude.service.ts`**

```ts
import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { z, ZodSchema } from 'zod';
import { ClaudeClientFactory } from './claude-client.factory';

export type ClaudeModelTier = 'fast' | 'deep';

export interface SummarizeArgs {
  system: string;
  user: string;
  model?: ClaudeModelTier;
  maxTokens?: number;
}

export interface ExtractStructuredArgs<T> {
  system: string;
  user: string;
  schema: ZodSchema<T>;
  toolName: string;
  toolDescription: string;
  toolInputSchema: Record<string, unknown>;
  model?: ClaudeModelTier;
  maxTokens?: number;
}

@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);

  constructor(private readonly factory: ClaudeClientFactory) {}

  async summarize(
    userId: string,
    args: SummarizeArgs,
  ): Promise<{ text: string; modelUsed: string }> {
    const { client, modelFast, modelDeep } = await this.factory.getContext(userId);
    const model = args.model === 'deep' ? modelDeep : modelFast;
    try {
      const response = await client.messages.create({
        model,
        max_tokens: args.maxTokens ?? (args.model === 'deep' ? 8192 : 4096),
        system: [
          { type: 'text', text: args.system, cache_control: { type: 'ephemeral' } } as Anthropic.TextBlockParam,
        ],
        messages: [{ role: 'user', content: args.user }],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { text, modelUsed: model };
    } catch (err) {
      this.logger.error(`Claude summarize failed: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Claude summarize failed');
    }
  }

  async extractStructured<T>(
    userId: string,
    args: ExtractStructuredArgs<T>,
  ): Promise<{ data: T; modelUsed: string }> {
    const { client, modelFast, modelDeep } = await this.factory.getContext(userId);
    const model = args.model === 'deep' ? modelDeep : modelFast;
    try {
      const response = await client.messages.create({
        model,
        max_tokens: args.maxTokens ?? 2048,
        system: [
          { type: 'text', text: args.system, cache_control: { type: 'ephemeral' } } as Anthropic.TextBlockParam,
        ],
        tools: [
          {
            name: args.toolName,
            description: args.toolDescription,
            input_schema: args.toolInputSchema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: 'tool', name: args.toolName },
        messages: [{ role: 'user', content: args.user }],
      });
      const toolUse = response.content.find(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === args.toolName,
      );
      if (!toolUse) {
        throw new Error('Claude did not return a tool_use block');
      }
      const parsed = args.schema.safeParse(toolUse.input);
      if (!parsed.success) {
        this.logger.warn(
          `Tool input failed schema: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        );
        throw new Error('Claude tool input did not match schema');
      }
      return { data: parsed.data, modelUsed: model };
    } catch (err) {
      this.logger.error(`Claude extractStructured failed: ${err instanceof Error ? err.message : err}`);
      throw new InternalServerErrorException('Claude extractStructured failed');
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/claude/claude.service.ts
git commit -m "feat: update ClaudeService to use ClaudeClientFactory with per-user key"
```

---

### Task 7: Update InsightsService call site

**Files:**
- Modify: `apps/backend/src/insights/insights.service.ts`

- [ ] **Step 1: Pass `userId` to `claude.summarize`**

In `apps/backend/src/insights/insights.service.ts`, find the `generate` method and update the `this.claude.summarize` call. The `args.userId` is already available. Change:

```ts
    const { text, modelUsed } = await this.claude.summarize({
      system: insightsPrompt.system({
```

to:

```ts
    const { text, modelUsed } = await this.claude.summarize(args.userId, {
      system: insightsPrompt.system({
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/insights/insights.service.ts
git commit -m "feat: pass userId to claude.summarize in InsightsService"
```

---

### Task 8: Update PostSummaryPipeline call sites

**Files:**
- Modify: `apps/backend/src/connectors/post-summary.pipeline.ts`

- [ ] **Step 1: Pass `args.userId` to both `claude.extractStructured` calls**

In `apps/backend/src/connectors/post-summary.pipeline.ts`, find the two `this.claude.extractStructured` calls and add `args.userId` as the first argument.

First call — change:

```ts
      const { data: ai } = await this.claude.extractStructured({
        system: actionItemsPrompt.system,
```

to:

```ts
      const { data: ai } = await this.claude.extractStructured(args.userId, {
        system: actionItemsPrompt.system,
```

Second call — change:

```ts
      const { data: rk } = await this.claude.extractStructured({
        system: risksPrompt.system,
```

to:

```ts
      const { data: rk } = await this.claude.extractStructured(args.userId, {
        system: risksPrompt.system,
```

- [ ] **Step 2: Commit**

```bash
git add apps/backend/src/connectors/post-summary.pipeline.ts
git commit -m "feat: pass userId to claude.extractStructured in PostSummaryPipeline"
```

---

### Task 9: Add API key gate to ConnectorSchedulerService

**Files:**
- Modify: `apps/backend/src/connectors/connectors.module.ts`
- Modify: `apps/backend/src/connectors/connector-scheduler.service.ts`

- [ ] **Step 1: Import MeModule into ConnectorsModule**

Replace the full contents of `apps/backend/src/connectors/connectors.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConnectorEntity } from '../entities/connector.entity';
import { ConnectorSyncStateEntity } from '../entities/connector-sync-state.entity';
import { ActionItemEntity } from '../entities/action-item.entity';
import { RiskEntity } from '../entities/risk.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { UserEntity } from '../entities/user.entity';
import { MeModule } from '../me/me.module';
import { ConnectorsController } from './connectors.controller';
import { ConnectorsService } from './connectors.service';
import { ConnectorRegistry } from './connector.registry';
import { ConnectorSchedulerService } from './connector-scheduler.service';
import { PostSummaryPipeline } from './post-summary.pipeline';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConnectorEntity,
      ConnectorSyncStateEntity,
      ActionItemEntity,
      RiskEntity,
      SummaryEntity,
      UserEntity,
    ]),
    MeModule,
  ],
  controllers: [ConnectorsController],
  providers: [ConnectorsService, ConnectorRegistry, ConnectorSchedulerService, PostSummaryPipeline],
  exports: [ConnectorsService, ConnectorRegistry, ConnectorSchedulerService, PostSummaryPipeline],
})
export class ConnectorsModule {}
```

- [ ] **Step 2: Inject UserSettingsService and add the API key gate**

Replace the full contents of `apps/backend/src/connectors/connector-scheduler.service.ts`:

```ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorEntity } from '../entities/connector.entity';
import { ConnectorSyncStateEntity } from '../entities/connector-sync-state.entity';
import { UserEntity } from '../entities/user.entity';
import { ConnectorRegistry } from './connector.registry';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { paths } from '../storage/path-builder';
import type { RawItem } from './connector.interface';
import { SINGLE_USER_ID } from '@kuros/shared';
import { UserSettingsService } from '../me/user-settings.service';

@Injectable()
export class ConnectorSchedulerService {
  private readonly logger = new Logger(ConnectorSchedulerService.name);
  private readonly mutex = new Map<string, boolean>();

  constructor(
    @InjectRepository(ConnectorEntity)
    private readonly connectors: Repository<ConnectorEntity>,
    @InjectRepository(ConnectorSyncStateEntity)
    private readonly syncStates: Repository<ConnectorSyncStateEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly registry: ConnectorRegistry,
    @Inject(STORAGE) private readonly storage: StorageService,
    private readonly userSettings: UserSettingsService,
  ) {}

  private async isOnboarded(): Promise<boolean> {
    const user = await this.users.findOne({ where: { id: SINGLE_USER_ID } });
    return user?.onboarded ?? false;
  }

  private async hasApiKey(): Promise<boolean> {
    const key = await this.userSettings.getRawApiKey(SINGLE_USER_ID);
    return key != null && key.length > 0;
  }

  private async withMutex<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.mutex.get(key)) {
      this.logger.warn(`Skipping ${key}: previous run still in progress`);
      return undefined;
    }
    this.mutex.set(key, true);
    try {
      return await fn();
    } finally {
      this.mutex.set(key, false);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAll(): Promise<void> {
    if (!(await this.isOnboarded())) {
      this.logger.log({ job: 'syncAll', status: 'awaiting_onboarding' });
      return;
    }
    if (!(await this.hasApiKey())) {
      this.logger.warn('syncAll: skipping — Anthropic API key not configured');
      return;
    }
    await this.withMutex('syncAll', async () => {
      const rows = await this.connectors.find({ where: { status: 'active' } });
      for (const c of rows) {
        try {
          await this.runSyncForConnector(c);
        } catch (err) {
          this.logger.error(
            `syncAll connector ${c.id} (${c.kind}) failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    });
  }

  async runSyncForConnector(c: ConnectorEntity, onlyTargetId?: string): Promise<number> {
    const connector = this.registry.get(c.kind);
    const targets = onlyTargetId ? [onlyTargetId] : await connector.listTargets(c.id);
    let total = 0;

    for (const targetId of targets) {
      const state = await this.syncStates.findOne({
        where: { connectorId: c.id, targetId },
      });
      const sinceCursor = state?.cursor ?? null;

      const started = Date.now();
      try {
        const result = await connector.syncTarget({ connectorId: c.id, targetId, sinceCursor });
        await this.persistRawItems(c, targetId, result.items);

        await this.syncStates.upsert(
          {
            connectorId: c.id,
            targetId,
            cursor: result.newCursor ?? state?.cursor ?? null,
            lastRunAt: new Date(),
            lastItemAt:
              result.items.length > 0
                ? result.items[result.items.length - 1]?.timestamp ?? null
                : (state?.lastItemAt ?? null),
          },
          ['connectorId', 'targetId'],
        );

        total += result.items.length;
        this.logger.log(
          `sync ok connector=${c.id} target=${targetId} items=${result.items.length} dur=${Date.now() - started}ms`,
        );
      } catch (err) {
        this.logger.error(
          `sync fail connector=${c.id} target=${targetId} dur=${Date.now() - started}ms: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return total;
  }

  private async persistRawItems(c: ConnectorEntity, targetId: string, items: RawItem[]): Promise<void> {
    if (items.length === 0) return;
    const byDay = new Map<string, RawItem[]>();
    for (const item of items) {
      const day = item.timestamp.toISOString().slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(item);
      byDay.set(day, list);
    }
    for (const [day, list] of byDay) {
      const relPath = paths.rawJsonl(c.userId, c.kind, targetId, new Date(`${day}T00:00:00Z`));
      const lines = list.map((it) => JSON.stringify(it)).join('\n') + '\n';
      await this.storage.append(relPath, lines);
    }
  }

  @Cron('30 23 * * *')
  async dailyFanout(): Promise<void> {
    if (!(await this.isOnboarded())) {
      this.logger.log({ job: 'dailyFanout', status: 'awaiting_onboarding' });
      return;
    }
    if (!(await this.hasApiKey())) {
      this.logger.warn('dailyFanout: skipping — Anthropic API key not configured');
      return;
    }
    this.logger.log('dailyFanout: not yet implemented (Phase 4/5 will wire this)');
  }

  @Cron('0 6 * * 1')
  async weeklyFanout(): Promise<void> {
    if (!(await this.isOnboarded())) {
      this.logger.log({ job: 'weeklyFanout', status: 'awaiting_onboarding' });
      return;
    }
    if (!(await this.hasApiKey())) {
      this.logger.warn('weeklyFanout: skipping — Anthropic API key not configured');
      return;
    }
    this.logger.log('weeklyFanout: not yet implemented (Phase 4/5 will wire this)');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/connectors/connectors.module.ts \
        apps/backend/src/connectors/connector-scheduler.service.ts
git commit -m "feat: add API key gate to ConnectorSchedulerService"
```

---

### Task 10: Env cleanup

**Files:**
- Modify: `apps/backend/src/config/env.schema.ts`
- Modify: `.env.example`

- [ ] **Step 1: Remove the three fields from `env.schema.ts`**

Replace the full contents of `apps/backend/src/config/env.schema.ts`:

```ts
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
```

- [ ] **Step 2: Update `.env.example`**

Replace the Anthropic section in `.env.example`. Remove these three lines:

```
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL_FAST=claude-sonnet-4-6
CLAUDE_MODEL_DEEP=claude-opus-4-7
```

And replace with:

```
# Anthropic — configure per-user via /settings/ai in the UI
```

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/config/env.schema.ts .env.example
git commit -m "feat: remove ANTHROPIC_API_KEY, CLAUDE_MODEL_FAST, CLAUDE_MODEL_DEEP from env"
```

---

### Task 11: Frontend API hooks

**Files:**
- Create: `apps/frontend/src/api/hooks/settings.ts`

- [ ] **Step 1: Create the hooks file**

Create `apps/frontend/src/api/hooks/settings.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../client';
import type { UserSettingsDto, UpdateUserSettingsRequest } from '@kuros/shared';

export function useUserSettings() {
  return useQuery<UserSettingsDto>({
    queryKey: ['me', 'settings'],
    queryFn: () => apiGet<UserSettingsDto>('/api/me/settings'),
    staleTime: 30_000,
  });
}

export function useUpdateUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserSettingsRequest) =>
      apiPatch<UserSettingsDto>('/api/me/settings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'settings'] }),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/api/hooks/settings.ts
git commit -m "feat: add useUserSettings and useUpdateUserSettings hooks"
```

---

### Task 12: AiSettingsPage

**Files:**
- Create: `apps/frontend/src/pages/AiSettingsPage.tsx`

- [ ] **Step 1: Create the page**

Create `apps/frontend/src/pages/AiSettingsPage.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Snackbar,
  TextField,
  Typography,
} from '@mui/material';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import { useUserSettings, useUpdateUserSettings } from '../api/hooks/settings';

const schema = z.object({
  anthropicApiKey: z.string().optional(),
  claudeModelFast: z.string().min(1, 'Required'),
  claudeModelDeep: z.string().min(1, 'Required'),
});
type FormValues = z.infer<typeof schema>;

export function AiSettingsPage() {
  const { data: settings, isLoading } = useUserSettings();
  const { mutateAsync, isPending, error } = useUpdateUserSettings();
  const [saved, setSaved] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { anthropicApiKey: '', claudeModelFast: '', claudeModelDeep: '' },
  });

  useEffect(() => {
    if (settings) {
      reset({
        anthropicApiKey: '',
        claudeModelFast: settings.claudeModelFast,
        claudeModelDeep: settings.claudeModelDeep,
      });
    }
  }, [settings, reset]);

  if (isLoading) return null;

  async function onSubmit(values: FormValues) {
    const payload: { anthropicApiKey?: string; claudeModelFast: string; claudeModelDeep: string } = {
      claudeModelFast: values.claudeModelFast,
      claudeModelDeep: values.claudeModelDeep,
    };
    if (values.anthropicApiKey && values.anthropicApiKey.length > 0) {
      payload.anthropicApiKey = values.anthropicApiKey;
    }
    await mutateAsync(payload);
    reset({ anthropicApiKey: '', claudeModelFast: values.claudeModelFast, claudeModelDeep: values.claudeModelDeep });
    setSaved(true);
  }

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', mt: 4, p: 2 }}>
      <Typography variant="h5" fontWeight={700} gutterBottom>
        AI Settings
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleSubmit(onSubmit)}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}
      >
        <TextField
          label="Anthropic API Key"
          type={showKey ? 'text' : 'password'}
          {...register('anthropicApiKey')}
          placeholder={settings?.hasAnthropicKey ? 'sk-ant-••••••••' : 'sk-ant-...'}
          error={!!errors.anthropicApiKey}
          helperText={
            errors.anthropicApiKey?.message ??
            (settings?.hasAnthropicKey ? 'Leave blank to keep existing key' : undefined)
          }
          fullWidth
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowKey((v) => !v)} edge="end" aria-label="toggle key visibility">
                  {showKey ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label="Fast model"
          {...register('claudeModelFast')}
          error={!!errors.claudeModelFast}
          helperText={errors.claudeModelFast?.message ?? 'Used for summaries and extraction (e.g. claude-sonnet-4-6)'}
          fullWidth
        />
        <TextField
          label="Deep model"
          {...register('claudeModelDeep')}
          error={!!errors.claudeModelDeep}
          helperText={errors.claudeModelDeep?.message ?? 'Used for insights (e.g. claude-opus-4-7)'}
          fullWidth
        />
        <Button
          type="submit"
          variant="contained"
          disabled={isPending}
          sx={{ alignSelf: 'flex-start' }}
        >
          {isPending ? <CircularProgress size={20} /> : 'Save'}
        </Button>
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        message="Settings saved"
      />
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/AiSettingsPage.tsx
git commit -m "feat: add AiSettingsPage"
```

---

### Task 13: Frontend route and nav entry

**Files:**
- Modify: `apps/frontend/src/routes.tsx`
- Modify: `apps/frontend/src/layout/nav-config.ts`

- [ ] **Step 1: Add the route in `routes.tsx`**

Add the import at the top alongside the other page imports:

```ts
import { AiSettingsPage } from './pages/AiSettingsPage';
```

Add the route inside the `children` array, after `{ path: 'settings/profile', element: <ProfilePage /> }`:

```ts
{ path: 'settings/ai', element: <AiSettingsPage /> },
```

- [ ] **Step 2: Add the nav item in `nav-config.ts`**

Add the import at the top:

```ts
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
```

In the `Settings` group items array, add after the Profile entry:

```ts
{ label: 'AI', to: '/settings/ai', icon: SmartToyOutlinedIcon },
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/routes.tsx apps/frontend/src/layout/nav-config.ts
git commit -m "feat: add /settings/ai route and nav entry"
```

---

### Task 14: Run the migration

- [ ] **Step 1: Run the migration against the database**

```bash
pnpm --filter @kuros/backend run migration:run
```

Expected output includes: `Migration UserSettings1700000000001 has been executed successfully.`

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
pnpm --filter @kuros/shared build && \
/home/rohit/github/kuros-manager/apps/backend/node_modules/.bin/tsc \
  -p /home/rohit/github/kuros-manager/apps/backend/tsconfig.build.json --noEmit
```

Expected: exits 0 with no errors.
