import { BadRequestException, ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { toZonedTime } from 'date-fns-tz';
import { addDays, format } from 'date-fns';
import type {
  MissingSummariesDto,
  MissingSummaryItem,
  SummaryBackfillJobDto,
  SummaryBackfillResult,
} from '@kuros/shared';
import { ConnectorEntity } from '../entities/connector.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { UserEntity } from '../entities/user.entity';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { ConnectorSchedulerService, type SavedDailySummary } from '../connectors/connector-scheduler.service';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { paths } from '../storage/path-builder';

/** Hard server-side ceiling on the look-back window, whatever the client asks for. */
export const MAX_BACKFILL_DAYS = 60;
/** LLM calls per generated summary: summarise + one action-item/risk extraction. */
const CALLS_PER_SUMMARY = 2;
/** LLM calls per day: wiki plan + wiki write (one ingest per day) + daily highlights. */
const CALLS_PER_DAY = 3;
/** Stop the job after this many failures in a row (bad API key, CLI missing, rate limited…). */
const MAX_CONSECUTIVE_FAILURES = 3;
const FAILURE_BACKOFF_MS = 30_000;
const MAX_RESULTS = 20;

interface Job extends SummaryBackfillJobDto {
  queue: MissingSummaryItem[];
}

/**
 * Generates daily summaries for past days that have synced data but no summary — e.g. days the
 * app wasn't running at the nightly cron. Gated by a look-back window so token spend is bounded
 * and visible up front (preview) before anything runs.
 */
@Injectable()
export class SummaryBackfillService {
  private readonly logger = new Logger(SummaryBackfillService.name);
  private readonly jobs = new Map<string, Job>();

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly scheduler: ConnectorSchedulerService,
    @Inject(STORAGE) private readonly storage: StorageService,
    @InjectRepository(ConnectorEntity) private readonly connectors: Repository<ConnectorEntity>,
    @InjectRepository(SummaryEntity) private readonly summaries: Repository<SummaryEntity>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
  ) {}

  private validateDays(days: number): number {
    if (!Number.isInteger(days) || days < 1 || days > MAX_BACKFILL_DAYS) {
      throw new BadRequestException(`days must be an integer between 1 and ${MAX_BACKFILL_DAYS}`);
    }
    return days;
  }

  /** Window [today - days, yesterday] in the user's timezone. */
  private async window(userId: string, days: number): Promise<{ from: string; to: string; dates: string[] }> {
    const user = await this.users.findOne({ where: { id: userId } });
    const today = toZonedTime(new Date(), user?.timezone ?? 'UTC');
    const dates: string[] = [];
    for (let i = days; i >= 1; i--) dates.push(format(addDays(today, -i), 'yyyy-MM-dd'));
    return { from: dates[0], to: dates[dates.length - 1], dates };
  }

  /**
   * Connector-days in the window with synced data but no daily summary at all (old per-channel
   * summaries count as present). One combined summary per connector-day will be generated.
   */
  async findMissing(userId: string, rawDays: number, connectorIds?: string[]): Promise<MissingSummariesDto> {
    const days = this.validateDays(rawDays);
    const { from, to, dates } = await this.window(userId, days);
    const all: MissingSummaryItem[] = [];

    const active = await this.connectors.find({ where: { userId, status: 'active' } });
    for (const c of active) {
      const connector = this.registry.get(c.kind);
      let targets: string[];
      try {
        // De-dupe: a channel listed twice in a connector's config would otherwise be counted twice.
        targets = [...new Set(await connector.listTargets(c.id))];
      } catch (err) {
        this.logger.warn(`listTargets failed for ${c.id}: ${err instanceof Error ? err.message : err}`);
        continue;
      }
      const summarised = new Set(
        (
          await this.summaries.find({
            where: { userId, connectorId: c.id, kind: 'daily', periodStart: Between(from, to) },
            select: ['periodStart'],
          })
        ).map((r) => r.periodStart),
      );
      const labels = new Map<string, string>();

      for (const date of dates) {
        if (summarised.has(date)) continue;
        const sources: string[] = [];
        let rawItems = 0;
        for (const targetId of targets) {
          const rawPath = paths.rawJsonl(userId, c.kind, targetId, new Date(`${date}T00:00:00.000Z`));
          if (!(await this.storage.exists(rawPath))) continue;
          const n = countUniqueItems(await this.storage.read(rawPath));
          if (n === 0) continue;
          if (!labels.has(targetId)) {
            labels.set(targetId, await connector.labelForTarget(c.id, targetId).catch(() => targetId));
          }
          sources.push(labels.get(targetId)!);
          rawItems += n;
        }
        if (rawItems === 0) continue;
        all.push({ date, connectorId: c.id, connectorName: c.name, connectorKind: c.kind, sources, rawItems });
      }
    }

    const connectors = active.map((c) => {
      const mine = all.filter((i) => i.connectorId === c.id);
      return {
        connectorId: c.id,
        connectorName: c.name,
        connectorKind: c.kind,
        summaries: mine.length,
        rawItems: mine.reduce((n, i) => n + i.rawItems, 0),
      };
    });
    const included =
      connectorIds && connectorIds.length > 0
        ? active.filter((c) => connectorIds.includes(c.id)).map((c) => c.id)
        : active.map((c) => c.id);
    const items = all
      .filter((i) => included.includes(i.connectorId))
      .sort((x, y) => x.date.localeCompare(y.date) || x.connectorName.localeCompare(y.connectorName));
    const missingDays = new Set(items.map((i) => i.date)).size;

    return {
      from,
      to,
      days,
      maxDays: MAX_BACKFILL_DAYS,
      items,
      connectors,
      includedConnectorIds: included,
      missingDays,
      totalRawItems: items.reduce((n, i) => n + i.rawItems, 0),
      estimatedLlmCalls: items.length * CALLS_PER_SUMMARY + missingDays * CALLS_PER_DAY,
    };
  }

  async start(userId: string, days: number, connectorIds?: string[]): Promise<SummaryBackfillJobDto> {
    const running = this.jobs.get(userId);
    if (running && (running.status === 'running' || running.status === 'cancelling')) {
      throw new ConflictException('A summary backfill is already running');
    }
    const preview = await this.findMissing(userId, days, connectorIds);
    if (preview.items.length === 0) {
      throw new BadRequestException(`No missing daily summaries between ${preview.from} and ${preview.to}`);
    }
    const job: Job = {
      status: 'running',
      days: preview.days,
      connectorIds: preview.includedConnectorIds,
      from: preview.from,
      to: preview.to,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      total: preview.items.length,
      completed: 0,
      failed: 0,
      current: null,
      currentStartedAt: null,
      error: null,
      results: [],
      queue: [...preview.items],
    };
    this.jobs.set(userId, job);
    void this.run(userId, job).catch((err) => {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = new Date().toISOString();
      job.current = null;
    });
    return toDto(job);
  }

  cancel(userId: string): SummaryBackfillJobDto | null {
    const job = this.jobs.get(userId);
    if (job?.status === 'running') job.status = 'cancelling';
    return job ? toDto(job) : null;
  }

  status(userId: string): SummaryBackfillJobDto | null {
    const job = this.jobs.get(userId);
    return job ? toDto(job) : null;
  }

  private async run(userId: string, job: Job): Promise<void> {
    let consecutiveFailures = 0;
    // Summaries of the day being processed; handed to the knowledge base together once the
    // day is complete so the wiki ingests each day in a single pass.
    let dayBatch: SavedDailySummary[] = [];
    let batchDate: string | null = null;
    const flush = () => {
      this.scheduler.emitSummaries(userId, dayBatch);
      dayBatch = [];
    };

    while (job.queue.length > 0) {
      if (job.status === 'cancelling') {
        job.status = 'cancelled';
        break;
      }
      const item = job.queue.shift()!;
      if (batchDate !== item.date) {
        flush();
        batchDate = item.date;
      }
      job.current = item;
      job.currentStartedAt = new Date().toISOString();
      const started = Date.now();
      let result: SummaryBackfillResult;
      try {
        // Combined summary + action items/risks for this connector-day.
        const saved = await this.scheduler.generateDailySummaryFor({
          userId,
          connectorId: item.connectorId,
          date: item.date,
          emit: false,
        });
        dayBatch.push(saved);
        job.completed++;
        consecutiveFailures = 0;
        result = { item, ok: true, error: null, durationMs: Date.now() - started };
      } catch (err) {
        job.failed++;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        result = { item, ok: false, error: message.slice(0, 500), durationMs: Date.now() - started };
        this.logger.error(`backfill ${item.date} ${item.connectorName} failed: ${message}`);
      }
      job.results.unshift(result);
      job.results.length = Math.min(job.results.length, MAX_RESULTS);
      job.current = null;
      job.currentStartedAt = null;

      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        job.status = 'failed';
        job.error = `Stopped after ${MAX_CONSECUTIVE_FAILURES} failures in a row. Last error: ${result.error}`;
        break;
      }
      if (!result.ok && job.queue.length > 0) await sleepUnlessCancelled(job, FAILURE_BACKOFF_MS);
    }
    flush();
    if (job.status === 'running') job.status = 'done';
    if (job.status === 'cancelling') job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    job.queue = [];
  }
}

function toDto(job: Job): SummaryBackfillJobDto {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { queue, ...dto } = job;
  return { ...dto, results: [...dto.results] };
}

/** Raw files are append-only JSONL with re-synced copies of items; count distinct ids. */
function countUniqueItems(raw: string): number {
  const ids = new Set<string>();
  let anon = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      const id = (JSON.parse(line) as { id?: unknown }).id;
      if (typeof id === 'string' || typeof id === 'number') ids.add(String(id));
      else anon++;
    } catch {
      anon++;
    }
  }
  return ids.size + anon;
}

async function sleepUnlessCancelled(job: Job, ms: number): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline && job.status === 'running') {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
