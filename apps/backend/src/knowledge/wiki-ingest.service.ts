import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import type { Subscription } from 'rxjs';
import type {
  IngestPhase,
  IngestionBatchDto,
  IngestionItemDto,
  IngestionProgressDto,
  WikiIngestionDto,
  WikiStatusDto,
} from '@kuros/shared';
import { SummaryEntity } from '../entities/summary.entity';
import { ConnectorEntity } from '../entities/connector.entity';
import { WikiIngestionEntity } from '../entities/wiki-ingestion.entity';
import { ClaudeService } from '../claude/claude.service';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { ConnectorSchedulerService } from '../connectors/connector-scheduler.service';
import { SummaryEventsService } from '../events/summary-events';
import { STORAGE, type StorageService } from '../storage/storage.service';
import {
  ENTITY_DIRS,
  WikiStore,
  normalizePagePath,
  pageTypeFor,
  shortHash,
  slugify,
  type WikiPage,
} from './wiki-store';
import {
  ingestPlanPrompt,
  ingestPlanSchema,
  ingestWritePrompt,
  ingestWriteSchema,
  type IngestSource,
} from './prompts/ingest.prompt';
import { HighlightsService } from './highlights.service';

const MAX_PLANNED_PAGES = 12;
/** A day with more pending summaries than this is split over several ingests. */
const MAX_SOURCES_PER_INGEST = 10;
/** Character budget for all of a day's summaries in one prompt. */
const MAX_DAY_SOURCE_CHARS = 80_000;
const MAX_EXISTING_BODY_CHARS = 12_000;
const MAX_ATTEMPTS = 3;
const HIGHLIGHTS_SETTLE_MS = 3 * 60 * 1000;

@Injectable()
export class WikiIngestService implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap {
  private readonly logger = new Logger(WikiIngestService.name);
  private readonly draining = new Set<string>();
  private readonly rerun = new Set<string>();
  /** Live, in-memory view of each user's worker, for the progress UI. */
  private readonly live = new Map<string, LiveProgress>();
  /** Most recent batch per user (running or finished). */
  private readonly batches = new Map<string, IngestionBatchDto>();
  private sub?: Subscription;

  constructor(
    private readonly store: WikiStore,
    private readonly claude: ClaudeService,
    private readonly registry: ConnectorRegistry,
    private readonly scheduler: ConnectorSchedulerService,
    private readonly events: SummaryEventsService,
    private readonly highlights: HighlightsService,
    @Inject(STORAGE) private readonly storage: StorageService,
    @InjectRepository(SummaryEntity) private readonly summaries: Repository<SummaryEntity>,
    @InjectRepository(ConnectorEntity) private readonly connectors: Repository<ConnectorEntity>,
    @InjectRepository(WikiIngestionEntity) private readonly ingestions: Repository<WikiIngestionEntity>,
  ) {}

  onModuleInit(): void {
    this.sub = this.events.saved$.subscribe((e) => {
      this.enqueueMany(e.userId, e.summaryIds, e.labels).catch((err) =>
        this.logger.error(`enqueue failed for summaries ${e.summaryIds.join(',')}: ${errMsg(err)}`),
      );
    });
  }

  onModuleDestroy(): void {
    this.sub?.unsubscribe();
  }

  /**
   * Rows left "running" by a previous process will never finish: put them back in the queue
   * and resume right away, rather than waiting for the safety-net cron.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ingestions.update({ status: 'running' }, { status: 'pending' });
      await this.resumeAll();
    } catch (err) {
      this.logger.warn(`could not resume ingestion queue: ${errMsg(err)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Queue management
  // ---------------------------------------------------------------------------

  /**
   * Queues summaries (normally one day's worth, emitted together) and kicks the worker once,
   * after all rows are saved, so the whole day is ingested in a single pass.
   */
  async enqueueMany(userId: string, summaryIds: string[], labels: Record<string, string> = {}): Promise<void> {
    if (summaryIds.length === 0) return;
    // Only daily summaries feed the wiki (weekly summaries are retired; old rows are ignored).
    const summaries = await this.summaries.find({ where: { id: In(summaryIds), userId, kind: 'daily' } });
    if (summaries.length === 0) return;
    const existing = new Map(
      (await this.ingestions.find({ where: { userId, summaryId: In(summaries.map((x) => x.id)) } })).map(
        (r) => [r.summaryId, r] as const,
      ),
    );
    await this.ingestions.save(
      summaries.map((summary) => {
        const row = existing.get(summary.id) ?? this.ingestions.create({ userId, summaryId: summary.id, pagesTouched: [] });
        row.kind = summary.kind;
        row.periodDate = summary.periodStart;
        row.status = 'pending';
        row.attempts = 0;
        row.error = null;
        if (labels[summary.id]) row.sourceLabel = labels[summary.id];
        return row;
      }),
    );
    this.kick(userId);
  }

  /** Queue every summary (optionally within a date range) that has never been ingested. */
  async backfill(userId: string, from?: string, to?: string): Promise<{ queued: number }> {
    const where: Record<string, unknown> = { userId, kind: 'daily' };
    if (from && to) where.periodStart = Between(from, to);
    else if (from) where.periodStart = MoreThanOrEqual(from);
    else if (to) where.periodStart = LessThanOrEqual(to);
    const all = await this.summaries.find({
      where,
      select: ['id', 'kind', 'periodStart', 'periodEnd', 'connectorId', 'targetId'],
    });
    const existing = new Set(
      (await this.ingestions.find({ where: { userId }, select: ['summaryId'] })).map((r) => r.summaryId),
    );
    const missing = all.filter((s) => !existing.has(s.id));

    // Resolve readable source names once per channel/mailbox/project (not per summary), so the
    // progress UI shows "#eng" instead of a raw channel id while the batch runs.
    const labels = new Map<string, string>();
    const connectorRows = new Map(
      (await this.connectors.find({ where: { userId } })).map((c) => [c.id, c] as const),
    );
    for (const key of new Set(missing.map((s) => `${s.connectorId}|${s.targetId}`))) {
      const [connectorId, targetId] = key.split('|');
      labels.set(key, await this.resolveLabel(connectorRows.get(connectorId) ?? null, targetId));
    }

    if (missing.length) {
      await this.ingestions.save(
        missing.map((s) =>
          this.ingestions.create({
            userId,
            summaryId: s.id,
            kind: s.kind,
            periodDate: s.kind === 'daily' ? s.periodStart : s.periodEnd,
            status: 'pending',
            sourceLabel: labels.get(`${s.connectorId}|${s.targetId}`) ?? null,
            pagesTouched: [],
          }),
        ),
      );
    }
    this.kick(userId);
    return { queued: missing.length };
  }

  async retryFailed(userId: string): Promise<{ queued: number }> {
    const res = await this.ingestions.update({ userId, status: 'failed' }, { status: 'pending', attempts: 0, error: null });
    this.kick(userId);
    return { queued: res.affected ?? 0 };
  }

  /** Safety net: retries transient failures and anything stuck, e.g. after a restart. */
  @Cron('*/10 * * * *')
  async resumeAll(): Promise<void> {
    await this.ingestions.update({ status: 'failed', attempts: LessThan(MAX_ATTEMPTS) }, { status: 'pending' });
    const rows = await this.ingestions
      .createQueryBuilder('i')
      .select('DISTINCT i.user_id', 'userId')
      .where('i.status = :s', { s: 'pending' })
      .getRawMany<{ userId: string }>();
    for (const r of rows) this.kick(r.userId);
  }

  private kick(userId: string): void {
    if (this.draining.has(userId)) {
      this.rerun.add(userId);
      return;
    }
    this.draining.add(userId);
    this.batches.set(userId, { startedAt: new Date().toISOString(), finishedAt: null, total: 0, completed: 0, failed: 0 });
    this.live.set(userId, { phase: 'starting', phaseStartedAt: new Date(), current: null, settleUntil: null, highlightsDates: [] });
    void this.drain(userId).catch((err) => {
      this.logger.error(`wiki drain crashed for ${userId}: ${errMsg(err)}`);
      this.finishBatch(userId);
    });
  }

  private async drain(userId: string): Promise<void> {
    const touchedDays = new Set<string>();
    for (;;) {
      for (;;) {
        const next = await this.ingestions.findOne({
          where: { userId, status: 'pending' },
          order: { periodDate: 'ASC', createdAt: 'ASC' },
        });
        if (!next) break;
        // Everything pending for that day goes into one ingest (one plan + one write call).
        const dayRows = await this.ingestions.find({
          where: { userId, status: 'pending', periodDate: next.periodDate },
          order: { createdAt: 'ASC' },
          take: MAX_SOURCES_PER_INGEST,
        });
        await this.ingestDay(dayRows);
        if (dayRows[0].status === 'done') touchedDays.add(next.periodDate);
      }
      if (this.rerun.delete(userId)) continue;

      if (touchedDays.size > 0) {
        // Summaries arrive one at a time during the nightly fan-out; wait for the burst to
        // finish so each day's highlights are synthesised once, from all of its sources.
        this.setLive(userId, { phase: 'settling', current: null, settleUntil: new Date(Date.now() + HIGHLIGHTS_SETTLE_MS) });
        if (await this.waitForMoreWork(userId, HIGHLIGHTS_SETTLE_MS)) continue;
        const days = [...touchedDays].sort();
        this.setLive(userId, { phase: 'highlights', settleUntil: null, highlightsDates: days });
        for (const day of days) {
          try {
            await this.highlights.generate(userId, day);
          } catch (err) {
            this.logger.warn(`highlights for ${day} failed: ${errMsg(err)}`);
          }
        }
        touchedDays.clear();
        if (this.rerun.delete(userId)) continue;
      }

      // Synchronous check-and-release so an enqueue racing with the end of the loop is never lost.
      this.finishBatch(userId);
      return;
    }
  }

  /** Resolves true as soon as new work is enqueued for the user, false after `ms` of quiet. */
  private async waitForMoreWork(userId: string, ms: number): Promise<boolean> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5000));
      if (this.rerun.delete(userId)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Ingest one day of summaries (the gist's "ingest" operation, batched per day)
  // ---------------------------------------------------------------------------

  private async ingestDay(rows: WikiIngestionEntity[]): Promise<void> {
    const userId = rows[0].userId;
    const started = new Date();
    for (const row of rows) {
      row.status = 'running';
      row.attempts += 1;
      row.startedAt = started;
      row.finishedAt = null;
    }
    await this.ingestions.save(rows);
    this.setLive(userId, { phase: 'starting', current: rows, settleUntil: null, highlightsDates: [] });

    try {
      const result = await this.store.withLock(userId, () => this.ingestDayLocked(rows));
      for (const row of rows) {
        row.status = 'done';
        row.error = null;
        row.sourcePage = result.sourcePaths.get(row.id) ?? null;
        row.pagesTouched = result.pagesTouched;
      }
      this.logger.log({
        job: 'wikiIngest',
        date: rows[0].periodDate,
        sources: rows.length,
        pages: result.pagesTouched.length,
        durationMs: Date.now() - started.getTime(),
        ok: true,
      });
    } catch (err) {
      const message = errMsg(err).slice(0, 2000);
      for (const row of rows) {
        row.status = 'failed';
        row.error = message;
      }
      this.logger.error({ job: 'wikiIngest', date: rows[0].periodDate, ok: false, error: message });
    }
    const finished = new Date();
    for (const row of rows) row.finishedAt = finished;
    await this.ingestions.save(rows);
    const batch = this.batches.get(userId);
    if (batch) {
      if (rows[0].status === 'done') batch.completed += rows.length;
      else batch.failed += rows.length;
    }
  }

  private async ingestDayLocked(
    rows: WikiIngestionEntity[],
  ): Promise<{ sourcePaths: Map<string, string>; pagesTouched: string[] }> {
    const userId = rows[0].userId;
    const period = rows[0].periodDate;

    // Load each summary as a source; budget the day's total so one huge source can't crowd out the rest.
    const perSourceBudget = Math.max(8_000, Math.floor(MAX_DAY_SOURCE_CHARS / rows.length));
    const sources: Array<IngestSource & { row: WikiIngestionEntity; summary: SummaryEntity }> = [];
    for (const row of rows) {
      const summary = await this.summaries.findOne({ where: { id: row.summaryId, userId } });
      if (!summary) continue;
      const markdown = (await this.storage.read(summary.filePath).catch(() => '')).trim();
      if (!markdown) continue;
      const connector = await this.connectors.findOne({ where: { id: summary.connectorId } });
      const label = row.sourceLabel ?? (await this.resolveLabel(connector, summary.targetId));
      if (row.sourceLabel !== label) {
        row.sourceLabel = label;
        // Persist now so the progress UI shows a readable name while this day runs.
        await this.ingestions.update(row.id, { sourceLabel: label });
      }
      const path = `sources/daily/${summary.periodStart}/${connector?.kind ?? 'source'}-${slugify(label, 40)}-${shortHash(
        `${summary.connectorId}:${summary.targetId}`,
      )}`;
      sources.push({ row, summary, path, label, markdown: truncate(markdown, perSourceBudget) });
    }
    if (sources.length === 0) throw new Error('None of the summaries for this day could be read');

    await this.store.ensureInitialized(userId);
    const [schema, index, userCtx] = await Promise.all([
      this.store.readSchema(userId),
      this.store.readIndexForPrompt(userId),
      this.scheduler.loadUserContext(userId),
    ]);
    const promptSources: IngestSource[] = sources.map(({ path, label, markdown }) => ({ path, label, markdown }));

    // Step 1: plan which pages the day's sources touch.
    this.setLive(userId, { phase: 'planning' });
    const { data: plan } = await this.claude.extractStructured(userId, {
      system: ingestPlanPrompt.system({ schema, userCtx }),
      user: ingestPlanPrompt.user({ index, period, sources: promptSources }),
      schema: ingestPlanSchema,
      toolName: ingestPlanPrompt.toolName,
      toolDescription: ingestPlanPrompt.toolDescription,
      toolInputSchema: ingestPlanPrompt.toolInputSchema as Record<string, unknown>,
      model: 'deep',
      maxTokens: 4096,
    });

    const planned: Array<{ path: string; title: string; existing: WikiPage | null }> = [];
    const seen = new Set<string>();
    for (const p of plan.pages) {
      const path = canonicalEntityPath(p.path);
      if (!path || seen.has(path)) continue;
      seen.add(path);
      planned.push({ path, title: p.title, existing: await this.store.readPage(userId, path) });
      if (planned.length >= MAX_PLANNED_PAGES) break;
    }

    // Step 2: write every source page + the full new body of every planned page.
    this.setLive(userId, { phase: 'writing' });
    const { data: written } = await this.claude.extractStructured(userId, {
      system: ingestWritePrompt.system({ schema, userCtx, today: new Date().toISOString().slice(0, 10) }),
      user: ingestWritePrompt.user({
        index,
        period,
        sources: promptSources,
        pages: planned.map((p) => ({
          path: p.path,
          title: p.existing?.meta.title ?? p.title,
          existingBody: p.existing ? truncate(p.existing.body, MAX_EXISTING_BODY_CHARS) : null,
        })),
      }),
      schema: ingestWriteSchema,
      toolName: ingestWritePrompt.toolName,
      toolDescription: ingestWritePrompt.toolDescription,
      toolInputSchema: ingestWritePrompt.toolInputSchema as Record<string, unknown>,
      model: 'deep',
      maxTokens: 24_000,
    });

    this.setLive(userId, { phase: 'saving' });
    const now = new Date().toISOString();
    const plannedByPath = new Map(planned.map((p) => [p.path, p]));
    const allSourcePaths = sources.map((src) => src.path);
    const touched: string[] = [];

    for (const page of written.pages) {
      const path = canonicalEntityPath(page.path);
      const plannedPage = path ? plannedByPath.get(path) : undefined;
      if (!path || !plannedPage || touched.includes(path)) continue;
      const prev = plannedPage.existing?.meta;
      // Credit the sources the page actually cites; fall back to all of today's sources.
      const cited = allSourcePaths.filter((sp) => page.body.includes(sp));
      await this.store.writePage(userId, {
        meta: {
          path,
          title: page.title,
          type: pageTypeFor(path),
          summary: page.summary,
          created: prev?.created ?? now,
          updated: now,
          sources: unique([...(cited.length ? cited : allSourcePaths), ...(prev?.sources ?? [])]).slice(0, 200),
          tags: unique([...(prev?.tags ?? []), ...(page.tags ?? [])]).slice(0, 12),
        },
        body: page.body,
      });
      touched.push(path);
    }

    const planBySource = new Map(plan.sources.map((x) => [x.path.replace(/\.md$/, ''), x]));
    const bodyBySource = new Map(written.sources.map((x) => [x.path.replace(/\.md$/, ''), x.body]));
    const sourcePaths = new Map<string, string>();
    for (const src of sources) {
      const meta = planBySource.get(src.path);
      const prev = await this.store.readPage(userId, src.path);
      await this.store.writePage(userId, {
        meta: {
          path: src.path,
          title: meta?.title ?? `${src.label} — ${period}`,
          type: 'source',
          summary: meta?.summary ?? `Daily summary of ${src.label} for ${period}.`,
          created: prev?.meta.created ?? now,
          updated: now,
          sources: [src.summary.filePath],
          tags: meta?.tags ?? [],
        },
        // If the model skipped a digest, keep the raw summary so the page is never empty.
        body: bodyBySource.get(src.path) ?? src.markdown,
      });
      sourcePaths.set(src.row.id, src.path);
    }

    await this.store.rebuildIndex(userId);
    await this.store.appendLog(userId, 'ingest', `${period} (${sources.map((x) => x.label).join(', ')})`, [
      `sources: ${allSourcePaths.map((p) => `[[${p}]]`).join(', ')}`,
      touched.length ? `pages: ${touched.map((p) => `[[${p}]]`).join(', ')}` : 'pages: (none)',
      ...(written.contradictions ?? []).map((c) => `contradiction: ${c}`),
    ]);

    return { sourcePaths, pagesTouched: touched };
  }

  private async resolveLabel(connector: ConnectorEntity | null, targetId: string): Promise<string> {
    if (!connector) return targetId;
    try {
      return await this.registry.get(connector.kind).labelForTarget(connector.id, targetId);
    } catch {
      return `${connector.name} ${targetId}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Progress
  // ---------------------------------------------------------------------------

  private setLive(userId: string, patch: Partial<Omit<LiveProgress, 'phaseStartedAt'>>): void {
    const prev = this.live.get(userId);
    if (!prev) return;
    const phaseChanged = patch.phase !== undefined && patch.phase !== prev.phase;
    this.live.set(userId, { ...prev, ...patch, phaseStartedAt: phaseChanged ? new Date() : prev.phaseStartedAt });
  }

  private finishBatch(userId: string): void {
    this.draining.delete(userId);
    this.live.delete(userId);
    const batch = this.batches.get(userId);
    if (batch) {
      batch.finishedAt = new Date().toISOString();
      batch.total = batch.completed + batch.failed;
    }
  }

  async progress(userId: string): Promise<IngestionProgressDto> {
    const live = this.draining.has(userId) ? this.live.get(userId) ?? null : null;
    const [queued, [daysRow], upNext, recent, [avgRow]] = await Promise.all([
      this.ingestions.count({ where: { userId, status: 'pending' } }),
      this.ingestions.query(
        `SELECT COUNT(DISTINCT period_date)::int AS n FROM wiki_ingestions WHERE user_id = $1 AND status = 'pending'`,
        [userId],
      ) as Promise<Array<{ n: number }>>,
      this.loadItems(userId, `i.status = 'pending'`, 'i.period_date ASC, i.created_at ASC', 5),
      this.loadItems(userId, `i.status IN ('done', 'failed') AND i.finished_at IS NOT NULL`, 'i.finished_at DESC', 8),
      // A day's rows share one start/finish, so average over distinct ingests, not rows.
      this.ingestions.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (t.finished_at - t.started_at)) * 1000) AS avg
           FROM (SELECT DISTINCT started_at, finished_at FROM wiki_ingestions
                  WHERE user_id = $1 AND status = 'done' AND started_at IS NOT NULL AND finished_at IS NOT NULL
                  ORDER BY finished_at DESC LIMIT 20) t`,
        [userId],
      ) as Promise<Array<{ avg: string | null }>>,
    ]);
    const queuedDays = Number(daysRow?.n ?? 0);

    let current: IngestionItemDto | null = null;
    const running = live?.current?.length ?? 0;
    if (live?.current?.length) {
      const items = await this.loadItems(userId, `i.id = ANY($2::uuid[])`, 'i.created_at', running, [
        live.current.map((r) => r.id),
      ]);
      if (items.length) {
        current = { ...items[0], label: items.map((i) => i.label).join(' + ') };
      }
    }

    const batch = this.batches.get(userId) ?? null;
    const batchDto = batch
      ? { ...batch, total: batch.finishedAt ? batch.total : batch.completed + batch.failed + queued + running }
      : null;
    const avgDayMs = avgRow?.avg ? Math.round(Number(avgRow.avg)) : null;
    let etaMs: number | null = null;
    if (live && avgDayMs) {
      const elapsedCurrent = current?.startedAt ? Date.now() - new Date(current.startedAt).getTime() : 0;
      etaMs = queuedDays * avgDayMs + Math.max(0, (running ? avgDayMs : 0) - elapsedCurrent);
      if (live.settleUntil) etaMs += Math.max(0, live.settleUntil.getTime() - Date.now());
    }

    return {
      active: !!live,
      phase: live?.phase ?? null,
      phaseStartedAt: live?.phaseStartedAt.toISOString() ?? null,
      current,
      currentSources: running,
      settleUntil: live?.settleUntil?.toISOString() ?? null,
      highlightsDates: live?.highlightsDates ?? [],
      batch: batchDto,
      queued,
      queuedDays,
      avgDayMs,
      etaMs,
      upNext,
      recent,
    };
  }

  private async loadItems(
    userId: string,
    where: string,
    orderBy: string,
    limit: number,
    extraParams: unknown[] = [],
  ): Promise<IngestionItemDto[]> {
    const rows = await this.ingestions.query(
      `SELECT i.id, i.summary_id, i.kind, i.period_date::text AS period_date, i.status, i.source_label,
              i.source_page, i.pages_touched, i.error, i.started_at, i.finished_at,
              s.target_id, c.name AS connector_name, c.kind AS connector_kind
         FROM wiki_ingestions i
         LEFT JOIN summaries s ON s.id = i.summary_id
         LEFT JOIN connectors c ON c.id = s.connector_id
        WHERE i.user_id = $1 AND ${where}
        ORDER BY ${orderBy}
        LIMIT ${Number(limit)}`,
      [userId, ...extraParams],
    );
    return (rows as RawItemRow[]).map((r) => {
      const startedAt = r.started_at ? new Date(r.started_at) : null;
      const finishedAt = r.finished_at ? new Date(r.finished_at) : null;
      return {
        id: r.id,
        summaryId: r.summary_id,
        label: r.source_label ?? ([r.connector_name, r.target_id].filter(Boolean).join(' · ') || 'Summary'),
        connectorKind: r.connector_kind,
        kind: r.kind,
        periodDate: r.period_date,
        status: r.status,
        startedAt: startedAt?.toISOString() ?? null,
        finishedAt: finishedAt?.toISOString() ?? null,
        durationMs: startedAt && finishedAt ? finishedAt.getTime() - startedAt.getTime() : null,
        pagesTouched: Array.isArray(r.pages_touched) ? r.pages_touched.length : 0,
        sourcePage: r.source_page,
        error: r.error,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  async status(userId: string): Promise<WikiStatusDto> {
    const grouped = await this.ingestions
      .createQueryBuilder('i')
      .select('i.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('i.user_id = :userId', { userId })
      .groupBy('i.status')
      .getRawMany<{ status: WikiIngestionDto['status']; count: number }>();
    const counts: WikiStatusDto['counts'] = { pending: 0, running: 0, done: 0, failed: 0 };
    let tracked = 0;
    for (const g of grouped) {
      counts[g.status] = Number(g.count);
      tracked += Number(g.count);
    }
    const totalSummaries = await this.summaries.count({ where: { userId, kind: 'daily' } });
    const failures = await this.ingestions.find({
      where: { userId, status: In(['failed']) },
      order: { updatedAt: 'DESC' },
      take: 5,
    });
    const pages = await this.store.listPages(userId);
    return {
      pageCount: pages.length,
      counts,
      notQueued: Math.max(0, totalSummaries - tracked),
      recentLog: await this.store.recentLog(userId, 20),
      recentFailures: failures.map(toIngestionDto),
    };
  }
}

interface LiveProgress {
  phase: IngestPhase;
  phaseStartedAt: Date;
  /** The rows (one day's summaries) being ingested. */
  current: WikiIngestionEntity[] | null;
  settleUntil: Date | null;
  highlightsDates: string[];
}

interface RawItemRow {
  id: string;
  summary_id: string;
  kind: 'daily' | 'weekly';
  period_date: string;
  status: WikiIngestionDto['status'];
  source_label: string | null;
  source_page: string | null;
  pages_touched: string[] | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  target_id: string | null;
  connector_name: string | null;
  connector_kind: string | null;
}

export function toIngestionDto(e: WikiIngestionEntity): WikiIngestionDto {
  return {
    id: e.id,
    summaryId: e.summaryId,
    kind: e.kind,
    periodDate: e.periodDate,
    status: e.status,
    sourcePage: e.sourcePage,
    pagesTouched: e.pagesTouched ?? [],
    error: e.error,
    attempts: e.attempts,
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** Entity pages may only live in people/teams/projects/topics, with a slugged final segment. */
function canonicalEntityPath(raw: string): string | null {
  const cleaned = raw.trim().replace(/^\/+/, '').replace(/\.md$/i, '').toLowerCase();
  const [dir, ...rest] = cleaned.split('/');
  if (!(ENTITY_DIRS as readonly string[]).includes(dir) || rest.length === 0) return null;
  return normalizePagePath(`${dir}/${slugify(rest.join('-'))}`);
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
