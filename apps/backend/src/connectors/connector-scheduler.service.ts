import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { toZonedTime } from 'date-fns-tz';
import { format, startOfISOWeek, endOfISOWeek, subWeeks } from 'date-fns';
import { ConnectorEntity } from '../entities/connector.entity';
import { ConnectorSyncStateEntity } from '../entities/connector-sync-state.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { UserEntity } from '../entities/user.entity';
import { PersonEntity } from '../entities/person.entity';
import { TeamEntity } from '../entities/team.entity';
import { TeamMemberEntity } from '../entities/team-member.entity';
import { ConnectorRegistry } from './connector.registry';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { paths, formatISODate, formatISOWeek } from '../storage/path-builder';
import type { RawItem } from './connector.interface';
import { SINGLE_USER_ID } from '@kuros/shared';
import { UserSettingsService } from '../me/user-settings.service';
import { ClaudeService } from '../claude/claude.service';
import { PostSummaryPipeline } from './post-summary.pipeline';
import {
  dailySummaryPrompt,
  weeklySummaryPrompt,
  type UserContext,
} from '../claude/prompts';

@Injectable()
export class ConnectorSchedulerService {
  private readonly logger = new Logger(ConnectorSchedulerService.name);
  private readonly mutex = new Map<string, boolean>();

  constructor(
    @InjectRepository(ConnectorEntity)
    private readonly connectors: Repository<ConnectorEntity>,
    @InjectRepository(ConnectorSyncStateEntity)
    private readonly syncStates: Repository<ConnectorSyncStateEntity>,
    @InjectRepository(SummaryEntity)
    private readonly summaries: Repository<SummaryEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(PersonEntity)
    private readonly people: Repository<PersonEntity>,
    @InjectRepository(TeamEntity)
    private readonly teams: Repository<TeamEntity>,
    @InjectRepository(TeamMemberEntity)
    private readonly teamMembers: Repository<TeamMemberEntity>,
    private readonly registry: ConnectorRegistry,
    @Inject(STORAGE) private readonly storage: StorageService,
    private readonly userSettings: UserSettingsService,
    private readonly claude: ClaudeService,
    private readonly postSummaryPipeline: PostSummaryPipeline,
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

  async loadUserContext(userId: string): Promise<UserContext> {
    const user = await this.users.findOne({ where: { id: userId } });
    const teamRows = await this.teams.find({ where: { userId } });

    const teamsWithMembers = await Promise.all(
      teamRows.map(async (team) => {
        const members = await this.teamMembers.find({ where: { teamId: team.id } });
        const memberNames = await Promise.all(
          members.map(async (m) => {
            const person = await this.people.findOne({ where: { id: m.personId } });
            return person?.name ?? null;
          }),
        );
        return {
          name: team.name,
          description: team.description,
          memberNames: memberNames.filter((n): n is string => n !== null),
        };
      }),
    );

    return {
      name: user?.name ?? 'User',
      email: user?.email ?? null,
      teams: teamsWithMembers,
    };
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
    await this.withMutex('dailyFanout', async () => {
      const user = await this.users.findOne({ where: { id: SINGLE_USER_ID } });
      const tz = user?.timezone ?? 'UTC';
      const zonedNow = toZonedTime(new Date(), tz);
      const todayStr = format(zonedNow, 'yyyy-MM-dd');
      const today = new Date(`${todayStr}T00:00:00.000Z`);

      const userCtx = await this.loadUserContext(SINGLE_USER_ID);
      const rows = await this.connectors.find({ where: { status: 'active' } });
      for (const c of rows) {
        try {
          await this.runDailySummaryForConnector(c, today, todayStr, userCtx);
        } catch (err) {
          this.logger.error(
            `dailyFanout connector ${c.id} (${c.kind}) failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    });
  }

  private async runDailySummaryForConnector(
    c: ConnectorEntity,
    day: Date,
    dateStr: string,
    userCtx: UserContext,
  ): Promise<void> {
    const connector = this.registry.get(c.kind);
    const targets = await connector.listTargets(c.id);

    for (const targetId of targets) {
      const started = Date.now();
      try {
        const rawPath = paths.rawJsonl(c.userId, c.kind, targetId, day);
        if (!(await this.storage.exists(rawPath))) {
          this.logger.log({ job: 'dailyFanout', connectorId: c.id, targetId, date: dateStr, status: 'no_data' });
          continue;
        }

        const raw = await this.storage.read(rawPath);
        const items: RawItem[] = raw
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as RawItem);

        if (items.length === 0) continue;

        const sourceLabel = await connector.labelForTarget(c.id, targetId);
        const { text, modelUsed } = await this.claude.summarize(c.userId, {
          system: dailySummaryPrompt.system({ date: dateStr, sourceLabel, userCtx }),
          user: dailySummaryPrompt.user({
            userCtx,
            sourceLabel,
            date: dateStr,
            items: items.map((it) => it.text).join('\n\n---\n\n'),
          }),
        });

        const filePath = paths.dailySummary(c.userId, c.kind, targetId, day);
        await this.storage.write(filePath, text);

        let summary = await this.summaries.findOne({
          where: { userId: c.userId, connectorId: c.id, targetId, kind: 'daily', periodStart: dateStr },
        });
        if (!summary) {
          summary = this.summaries.create({
            userId: c.userId,
            connectorId: c.id,
            targetId,
            kind: 'daily',
            periodStart: dateStr,
            periodEnd: dateStr,
          });
        }
        summary.filePath = filePath;
        summary.itemCount = items.length;
        summary.modelUsed = modelUsed;
        const saved = await this.summaries.save(summary);

        await this.postSummaryPipeline.run({
          summary: saved,
          sourceLabel,
          period: dateStr,
          userId: c.userId,
          day,
          userCtx,
        });

        this.logger.log({
          job: 'dailyFanout', connectorId: c.id, targetId, date: dateStr,
          items: items.length, durationMs: Date.now() - started, ok: true,
        });
      } catch (err) {
        this.logger.error({
          job: 'dailyFanout', connectorId: c.id, targetId, date: dateStr,
          durationMs: Date.now() - started, ok: false,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
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
    await this.withMutex('weeklyFanout', async () => {
      const lastWeekDate = subWeeks(new Date(), 1);
      const weekStart = startOfISOWeek(lastWeekDate);
      const weekEnd = endOfISOWeek(lastWeekDate);
      const isoWeek = formatISOWeek(lastWeekDate);
      const weekStartStr = formatISODate(weekStart);
      const weekEndStr = formatISODate(weekEnd);

      const userCtx = await this.loadUserContext(SINGLE_USER_ID);
      const rows = await this.connectors.find({ where: { status: 'active' } });
      for (const c of rows) {
        try {
          await this.runWeeklySummaryForConnector(c, isoWeek, weekStartStr, weekEndStr, weekStart, userCtx);
        } catch (err) {
          this.logger.error(
            `weeklyFanout connector ${c.id} (${c.kind}) failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    });
  }

  private async runWeeklySummaryForConnector(
    c: ConnectorEntity,
    isoWeek: string,
    weekStartStr: string,
    weekEndStr: string,
    weekStart: Date,
    userCtx: UserContext,
  ): Promise<void> {
    const connector = this.registry.get(c.kind);
    const targets = await connector.listTargets(c.id);

    for (const targetId of targets) {
      const started = Date.now();
      try {
        const dailySummaries = await this.summaries.find({
          where: {
            userId: c.userId,
            connectorId: c.id,
            targetId,
            kind: 'daily',
            periodStart: Between(weekStartStr, weekEndStr),
          },
          order: { periodStart: 'ASC' },
        });

        if (dailySummaries.length === 0) {
          this.logger.log({ job: 'weeklyFanout', connectorId: c.id, targetId, week: isoWeek, status: 'no_dailies' });
          continue;
        }

        const markdowns = await Promise.all(
          dailySummaries.map(async (s) => {
            try { return await this.storage.read(s.filePath); } catch { return ''; }
          }),
        );
        const dailiesText = markdowns.filter(Boolean).join('\n\n---\n\n');

        const sourceLabel = await connector.labelForTarget(c.id, targetId);
        const { text, modelUsed } = await this.claude.summarize(c.userId, {
          system: weeklySummaryPrompt.system({ isoWeek, sourceLabel, userCtx }),
          user: weeklySummaryPrompt.user({
            userCtx,
            sourceLabel,
            isoWeek,
            periodStart: weekStartStr,
            periodEnd: weekEndStr,
            dailies: dailiesText,
          }),
        });

        const filePath = paths.weeklySummary(c.userId, c.kind, targetId, isoWeek);
        await this.storage.write(filePath, text);

        let summary = await this.summaries.findOne({
          where: { userId: c.userId, connectorId: c.id, targetId, kind: 'weekly', periodStart: weekStartStr },
        });
        if (!summary) {
          summary = this.summaries.create({
            userId: c.userId,
            connectorId: c.id,
            targetId,
            kind: 'weekly',
            periodStart: weekStartStr,
            periodEnd: weekEndStr,
          });
        }
        summary.filePath = filePath;
        summary.itemCount = dailySummaries.reduce((acc, s) => acc + s.itemCount, 0);
        summary.modelUsed = modelUsed;
        await this.summaries.save(summary);

        this.logger.log({
          job: 'weeklyFanout', connectorId: c.id, targetId, week: isoWeek,
          dailies: dailySummaries.length, durationMs: Date.now() - started, ok: true,
        });
      } catch (err) {
        this.logger.error({
          job: 'weeklyFanout', connectorId: c.id, targetId, week: isoWeek,
          durationMs: Date.now() - started, ok: false,
          error: err instanceof Error ? err.message : err,
        });
      }
    }
  }

  async generateDailySummariesForDate(userId: string, date: string): Promise<void> {
    const userCtx = await this.loadUserContext(userId);
    const day = new Date(`${date}T00:00:00.000Z`);
    const rows = await this.connectors.find({ where: { userId, status: 'active' } });
    for (const c of rows) {
      try {
        await this.runDailySummaryForConnector(c, day, date, userCtx);
      } catch (err) {
        this.logger.error(
          `generateDailySummariesForDate connector=${c.id} date=${date}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async generateDailySummaryFor(args: {
    userId: string;
    connectorId: string;
    targetId: string;
    date: string;
  }): Promise<SummaryEntity> {
    const c = await this.connectors.findOne({ where: { id: args.connectorId, userId: args.userId } });
    if (!c) throw new Error(`Connector not found: ${args.connectorId}`);

    const userCtx = await this.loadUserContext(args.userId);
    const day = new Date(`${args.date}T00:00:00.000Z`);

    const connector = this.registry.get(c.kind);
    const rawPath = paths.rawJsonl(args.userId, c.kind, args.targetId, day);
    if (!(await this.storage.exists(rawPath))) {
      throw new Error(`No raw data for date=${args.date} target=${args.targetId}`);
    }

    const raw = await this.storage.read(rawPath);
    const items: RawItem[] = raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RawItem);

    const sourceLabel = await connector.labelForTarget(c.id, args.targetId);
    const { text, modelUsed } = await this.claude.summarize(args.userId, {
      system: dailySummaryPrompt.system({ date: args.date, sourceLabel, userCtx }),
      user: dailySummaryPrompt.user({
        userCtx,
        sourceLabel,
        date: args.date,
        items: items.map((it) => it.text).join('\n\n---\n\n'),
      }),
    });

    const filePath = paths.dailySummary(args.userId, c.kind, args.targetId, day);
    await this.storage.write(filePath, text);

    let summary = await this.summaries.findOne({
      where: { userId: args.userId, connectorId: c.id, targetId: args.targetId, kind: 'daily', periodStart: args.date },
    });
    if (!summary) {
      summary = this.summaries.create({
        userId: args.userId,
        connectorId: c.id,
        targetId: args.targetId,
        kind: 'daily',
        periodStart: args.date,
        periodEnd: args.date,
      });
    }
    summary.filePath = filePath;
    summary.itemCount = items.length;
    summary.modelUsed = modelUsed;
    const saved = await this.summaries.save(summary);

    await this.postSummaryPipeline.run({
      summary: saved,
      sourceLabel,
      period: args.date,
      userId: args.userId,
      day,
      userCtx,
    });

    return saved;
  }
}
