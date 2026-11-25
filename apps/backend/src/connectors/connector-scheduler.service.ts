import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';
import { ConnectorEntity } from '../entities/connector.entity';
import { ConnectorSyncStateEntity } from '../entities/connector-sync-state.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { UserEntity } from '../entities/user.entity';
import { PersonEntity } from '../entities/person.entity';
import { TeamEntity } from '../entities/team.entity';
import { TeamMemberEntity } from '../entities/team-member.entity';
import { ConnectorRegistry } from './connector.registry';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { paths } from '../storage/path-builder';
import type { RawItem } from './connector.interface';
import { COMBINED_TARGET_ID, SINGLE_USER_ID } from '@kuros/shared';
import { UserSettingsService } from '../me/user-settings.service';
import { ClaudeService } from '../claude/claude.service';
import { PostSummaryPipeline } from './post-summary.pipeline';
import { SummaryEventsService } from '../events/summary-events';
import {
  dailySummaryPrompt,
  type UserContext,
} from '../claude/prompts';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    private readonly summaryEvents: SummaryEventsService,
  ) {}

  private async isOnboarded(): Promise<boolean> {
    const user = await this.users.findOne({ where: { id: SINGLE_USER_ID } });
    return user?.onboarded ?? false;
  }

  private async hasApiKey(): Promise<boolean> {
    const key = await this.userSettings.getRawApiKey(SINGLE_USER_ID);
    return key != null && key.length > 0;
  }

  private async isAiConfigured(): Promise<boolean> {
    const provider = await this.userSettings.getProvider(SINGLE_USER_ID);
    if (provider === 'claude_code') return true;
    return this.hasApiKey();
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
    if (!(await this.isAiConfigured())) {
      this.logger.warn('syncAll: skipping — AI provider not configured (set API key or switch to Claude Code in AI Settings)');
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

  private dedupeLatestById(items: RawItem[]): RawItem[] {
    // Same issue can be appended on multiple syncs the same day; keep newest by timestamp.
    const latest = new Map<string, RawItem>();
    for (const it of items) {
      const prev = latest.get(it.id);
      if (!prev || new Date(it.timestamp).getTime() > new Date(prev.timestamp).getTime()) {
        latest.set(it.id, it);
      }
    }
    this.logger.log(`Initial count: ${items.length} items, deduped count: ${latest.size}`);
    return Array.from(latest.values());
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

  @Cron('30 20 * * *')
  async dailyFanout(): Promise<void> {
    if (!(await this.isOnboarded())) {
      this.logger.log({ job: 'dailyFanout', status: 'awaiting_onboarding' });
      return;
    }
    if (!(await this.isAiConfigured())) {
      this.logger.warn('dailyFanout: skipping — AI provider not configured (set API key or switch to Claude Code in AI Settings)');
      return;
    }
    await this.withMutex('dailyFanout', async () => {
      const user = await this.users.findOne({ where: { id: SINGLE_USER_ID } });
      const tz = user?.timezone ?? 'UTC';
      const todayStr = format(toZonedTime(new Date(), tz), 'yyyy-MM-dd');
      await this.generateDailySummariesForDate(SINGLE_USER_ID, todayStr, { waitOnError: true });
    });
  }

  /**
   * Summarises every active connector of the user for one day, then hands the day's summaries
   * to the knowledge base as one batch (so the wiki ingests the day in a single pass).
   */
  async generateDailySummariesForDate(
    userId: string,
    date: string,
    opts: { waitOnError?: boolean } = {},
  ): Promise<void> {
    const userCtx = await this.loadUserContext(userId);
    const rows = await this.connectors.find({ where: { userId, status: 'active' } });
    const saved: SavedDailySummary[] = [];
    for (const c of rows) {
      const started = Date.now();
      try {
        const r = await this.summarizeConnectorDay(c, date, userCtx);
        if (r) saved.push(r);
        this.logger.log({
          job: 'dailySummary', connectorId: c.id, date, ok: true,
          status: r ? 'summarised' : 'no_data', durationMs: Date.now() - started,
        });
      } catch (err) {
        this.logger.error({
          job: 'dailySummary', connectorId: c.id, date, ok: false, durationMs: Date.now() - started,
          error: err instanceof Error ? err.message : err,
        });
        if (opts.waitOnError) {
          // Back off before the next connector in case we were rate limited.
          await wait(60000);
        }
      }
    }
    this.emitSummaries(userId, saved);
  }

  /**
   * (Re)generates one connector's combined summary for a day. With `emit: false` the caller is
   * responsible for handing it to the knowledge base (the backfill batches a whole day).
   */
  async generateDailySummaryFor(args: {
    userId: string;
    connectorId: string;
    date: string;
    emit?: boolean;
  }): Promise<SavedDailySummary> {
    const c = await this.connectors.findOne({ where: { id: args.connectorId, userId: args.userId } });
    if (!c) throw new Error(`Connector not found: ${args.connectorId}`);
    const userCtx = await this.loadUserContext(args.userId);
    const r = await this.summarizeConnectorDay(c, args.date, userCtx);
    if (!r) throw new Error(`No synced data for ${c.name} on ${args.date}`);
    if (args.emit ?? true) this.emitSummaries(args.userId, [r]);
    return r;
  }

  emitSummaries(userId: string, saved: SavedDailySummary[]): void {
    this.summaryEvents.emitSaved({
      userId,
      summaryIds: saved.map((r) => r.summary.id),
      labels: Object.fromEntries(saved.map((r) => [r.summary.id, r.sourceLabel])),
    });
  }

  /**
   * One combined daily summary per connector: every channel/project with data that day goes
   * into a single LLM call (as labelled sections), instead of one call per target. Small
   * channels no longer pay the full per-call overhead, and cross-channel topics get merged.
   *
   * Supersedes any older per-target summaries of that connector-day. Returns null if no data.
   */
  private async summarizeConnectorDay(
    c: ConnectorEntity,
    dateStr: string,
    userCtx: UserContext,
  ): Promise<SavedDailySummary | null> {
    const day = new Date(`${dateStr}T00:00:00.000Z`);
    const connector = this.registry.get(c.kind);
    // De-dupe: a target listed twice in config would otherwise be summarised (and paid for) twice.
    const targets = [...new Set(await connector.listTargets(c.id))];

    const sections: Array<{ label: string; items: RawItem[] }> = [];
    for (const targetId of targets) {
      const rawPath = paths.rawJsonl(c.userId, c.kind, targetId, day);
      if (!(await this.storage.exists(rawPath))) continue;
      const raw = await this.storage.read(rawPath);
      const items = this.dedupeLatestById(
        raw
          .split('\n')
          .filter((l) => l.trim())
          .map((line) => JSON.parse(line) as RawItem),
      );
      if (items.length === 0) continue;
      const label = await connector.labelForTarget(c.id, targetId).catch(() => targetId);
      sections.push({ label, items });
    }
    if (sections.length === 0) return null;

    const multi = sections.length > 1;
    const sourceLabel = multi ? c.name : sections[0].label;
    const itemsText = sections
      .map((sec) => {
        const body = sec.items.map((it) => it.text).join('\n\n---\n\n');
        return multi ? `## Source: ${sec.label} (${sec.items.length} items)\n\n${body}` : body;
      })
      .join('\n\n');
    const itemCount = sections.reduce((n, sec) => n + sec.items.length, 0);

    const { text, modelUsed } = await this.claude.summarize(c.userId, {
      system: dailySummaryPrompt.system({
        date: dateStr,
        sourceLabel,
        userCtx,
        sources: sections.map((sec) => sec.label),
      }),
      user: dailySummaryPrompt.user({ userCtx, sourceLabel, date: dateStr, items: itemsText }),
    });

    const filePath = paths.dailySummary(c.userId, c.kind, COMBINED_TARGET_ID, day);
    await this.storage.write(filePath, text);

    let summary = await this.summaries.findOne({
      where: { userId: c.userId, connectorId: c.id, targetId: COMBINED_TARGET_ID, kind: 'daily', periodStart: dateStr },
    });
    if (!summary) {
      summary = this.summaries.create({
        userId: c.userId,
        connectorId: c.id,
        targetId: COMBINED_TARGET_ID,
        kind: 'daily',
        periodStart: dateStr,
        periodEnd: dateStr,
      });
    }
    summary.filePath = filePath;
    summary.itemCount = itemCount;
    summary.modelUsed = modelUsed;
    const saved = await this.summaries.save(summary);

    // Older per-channel summaries of this day are replaced by the combined one.
    const superseded = await this.summaries.find({
      where: { userId: c.userId, connectorId: c.id, kind: 'daily', periodStart: dateStr, targetId: Not(COMBINED_TARGET_ID) },
      select: ['id'],
    });

    await this.postSummaryPipeline.run({
      summary: saved,
      sourceLabel,
      period: dateStr,
      userId: c.userId,
      day,
      userCtx,
      replacedSummaryIds: superseded.map((r) => r.id),
    });

    if (superseded.length) {
      // Action items/risks keep existing (FK is SET NULL); their markdown files stay on disk.
      await this.summaries.delete({ id: In(superseded.map((r) => r.id)) });
    }
    return { summary: saved, sourceLabel };
  }
}

export interface SavedDailySummary {
  summary: SummaryEntity;
  sourceLabel: string;
}
