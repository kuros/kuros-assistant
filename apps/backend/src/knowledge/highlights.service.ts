import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { DailyHighlightsDto, RiskSeverity } from '@kuros/shared';
import { SummaryEntity } from '../entities/summary.entity';
import { ActionItemEntity } from '../entities/action-item.entity';
import { RiskEntity } from '../entities/risk.entity';
import { WikiIngestionEntity } from '../entities/wiki-ingestion.entity';
import { ClaudeService } from '../claude/claude.service';
import { ConnectorSchedulerService } from '../connectors/connector-scheduler.service';
import { ENTITY_DIRS, WikiStore, extractLinks, normalizePagePath, type WikiPage } from './wiki-store';
import { highlightsPrompt, highlightsSchema, type HighlightsExtraction } from './prompts/highlights.prompt';

interface StoredHighlights extends HighlightsExtraction {
  date: string;
  generatedAt: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class HighlightsService {
  constructor(
    private readonly store: WikiStore,
    private readonly claude: ClaudeService,
    private readonly scheduler: ConnectorSchedulerService,
    @InjectRepository(SummaryEntity) private readonly summaries: Repository<SummaryEntity>,
    @InjectRepository(ActionItemEntity) private readonly actionItems: Repository<ActionItemEntity>,
    @InjectRepository(RiskEntity) private readonly risks: Repository<RiskEntity>,
    @InjectRepository(WikiIngestionEntity) private readonly ingestions: Repository<WikiIngestionEntity>,
  ) {}

  private assertDate(date: string): void {
    if (!DATE_RE.test(date)) throw new BadRequestException(`Invalid date: ${date}`);
  }

  private async sourcePagesFor(userId: string, date: string, pages?: WikiPage[]): Promise<WikiPage[]> {
    const all = pages ?? (await this.store.listPages(userId));
    return all
      .filter((p) => p.meta.path.startsWith(`sources/daily/${date}/`))
      .sort((a, b) => a.meta.title.localeCompare(b.meta.title));
  }

  async get(userId: string, date: string): Promise<DailyHighlightsDto> {
    this.assertDate(date);
    const raw = await this.store.readRaw(userId, `daily/${date}.json`);
    const stored: StoredHighlights | null = raw ? (JSON.parse(raw) as StoredHighlights) : null;

    const dailies = await this.summaries.find({ where: { userId, kind: 'daily', periodStart: date } });
    const summaryIds = dailies.map((s) => s.id);
    const [ingestRows, actionCount, riskRows, sourcePages] = await Promise.all([
      summaryIds.length ? this.ingestions.find({ where: { userId, summaryId: In(summaryIds) } }) : [],
      summaryIds.length ? this.actionItems.count({ where: { userId, sourceSummaryId: In(summaryIds) } }) : 0,
      summaryIds.length ? this.risks.find({ where: { userId, sourceSummaryId: In(summaryIds) } }) : [],
      this.sourcePagesFor(userId, date),
    ]);

    const risks: Record<RiskSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const r of riskRows) risks[r.severity]++;

    const pagesTouched = new Set<string>();
    let lastIngest = 0;
    for (const r of ingestRows) {
      if (r.status !== 'done') continue;
      r.pagesTouched.forEach((p) => pagesTouched.add(p));
      lastIngest = Math.max(lastIngest, r.updatedAt.getTime());
    }
    const pending = ingestRows.filter((r) => r.status === 'pending' || r.status === 'running').length;
    const notQueued = summaryIds.length - ingestRows.length;
    const generatedAt = stored?.generatedAt ?? null;

    return {
      date,
      generatedAt,
      stale: !!generatedAt && lastIngest > new Date(generatedAt).getTime(),
      headline: stored?.headline ?? null,
      highlights: stored?.highlights ?? [],
      themes: stored?.themes ?? [],
      people: (stored?.people ?? []).map((p) => ({ name: p.name, page: p.page ?? null, note: p.note })),
      followUps: stored?.followUps ?? [],
      stats: {
        sources: dailies.length,
        items: dailies.reduce((n, s) => n + s.itemCount, 0),
        pagesTouched: pagesTouched.size,
        actionItems: actionCount,
        risks,
        pendingIngestion: pending + notQueued,
      },
      sourcePages: sourcePages.map((p) => ({ path: p.meta.path, title: p.meta.title, summary: p.meta.summary })),
    };
  }

  /** Synthesises the day's highlights from that day's wiki source pages and writes `daily/<date>`. */
  async generate(userId: string, date: string): Promise<DailyHighlightsDto> {
    this.assertDate(date);
    await this.store.withLock(userId, async () => {
      const pages = await this.store.listPages(userId);
      const byPath = new Map(pages.map((p) => [p.meta.path, p]));
      const sources = await this.sourcePagesFor(userId, date, pages);
      if (sources.length === 0) {
        throw new BadRequestException(
          `No ingested sources for ${date}. Generate daily summaries and let the knowledge base ingest them first.`,
        );
      }

      const linked = new Map<string, number>();
      for (const s of sources) {
        for (const l of extractLinks(s.body)) {
          if ((ENTITY_DIRS as readonly string[]).includes(l.split('/')[0]) && byPath.has(l)) {
            linked.set(l, (linked.get(l) ?? 0) + 1);
          }
        }
      }
      const entityPages = [...linked.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([p]) => byPath.get(p)!);

      // Only summaries already folded into the wiki, so every highlight is traceable to a source page.
      const dailies = await this.summaries.find({ where: { userId, kind: 'daily', periodStart: date } });
      const ingested = dailies.length
        ? await this.ingestions.find({
            where: { userId, status: 'done', summaryId: In(dailies.map((s) => s.id)) },
            select: ['summaryId'],
          })
        : [];
      const ids = ingested.map((r) => r.summaryId);
      const [items, risks] = ids.length
        ? await Promise.all([
            this.actionItems.find({ where: { userId, sourceSummaryId: In(ids) } }),
            this.risks.find({ where: { userId, sourceSummaryId: In(ids) } }),
          ])
        : [[], []];

      const userCtx = await this.scheduler.loadUserContext(userId);
      const { data } = await this.claude.extractStructured(userId, {
        system: highlightsPrompt.system(userCtx),
        user: highlightsPrompt.user({
          date,
          sources: sources
            .map((s) => `<page path="${s.meta.path}" title="${s.meta.title}">\n${truncate(s.body, 8000)}\n</page>`)
            .join('\n\n'),
          entityPages: entityPages
            .map((s) => `<page path="${s.meta.path}" title="${s.meta.title}">\n${truncate(s.body, 3000)}\n</page>`)
            .join('\n\n'),
          actionItems: items.map((i) => `- ${i.title}${i.dueDate ? ` (due ${i.dueDate})` : ''}`).join('\n'),
          risks: risks.map((r) => `- [${r.severity}] ${r.title}`).join('\n'),
        }),
        schema: highlightsSchema,
        toolName: highlightsPrompt.toolName,
        toolDescription: highlightsPrompt.toolDescription,
        toolInputSchema: highlightsPrompt.toolInputSchema as Record<string, unknown>,
        model: 'deep',
        maxTokens: 4096,
      });

      const validLink = (p: string | null | undefined): string | null => {
        const n = p ? normalizePagePath(p) : null;
        return n && byPath.has(n) ? n : null;
      };
      const cleaned: StoredHighlights = {
        headline: data.headline,
        highlights: data.highlights.map((h) => ({
          ...h,
          links: (h.links ?? []).map(validLink).filter((x): x is string => !!x),
        })),
        themes: data.themes ?? [],
        people: (data.people ?? []).map((p) => ({ ...p, page: validLink(p.page) })),
        followUps: data.followUps ?? [],
        date,
        generatedAt: new Date().toISOString(),
      };

      await this.store.writeRaw(userId, `daily/${date}.json`, JSON.stringify(cleaned, null, 2));
      const prev = await this.store.readPage(userId, `daily/${date}`);
      await this.store.writePage(userId, {
        meta: {
          path: `daily/${date}`,
          title: `Highlights ${date}`,
          type: 'daily',
          summary: cleaned.headline,
          created: prev?.meta.created ?? cleaned.generatedAt,
          updated: cleaned.generatedAt,
          sources: sources.map((s) => s.meta.path),
          tags: cleaned.themes.slice(0, 8),
        },
        body: renderDailyPage(cleaned, sources),
      });
      await this.store.rebuildIndex(userId);
      await this.store.appendLog(userId, 'highlights', date, [`page: [[daily/${date}]]`]);
    });
    return this.get(userId, date);
  }
}

function renderDailyPage(h: StoredHighlights, sources: WikiPage[]): string {
  const lines: string[] = [`# Highlights — ${h.date}`, '', `> ${h.headline}`, ''];
  if (h.highlights.length) {
    lines.push('## Highlights', '');
    for (const x of h.highlights) {
      const refs = x.links.map((l) => `[[${l}]]`).join(' ');
      lines.push(`- **${x.title}** _(${x.category}, ${x.importance})_ — ${x.detail}${refs ? ` ${refs}` : ''}`);
    }
    lines.push('');
  }
  if (h.people.length) {
    lines.push('## People', '');
    for (const p of h.people) lines.push(`- ${p.page ? `[[${p.page}|${p.name}]]` : p.name} — ${p.note}`);
    lines.push('');
  }
  if (h.followUps.length) {
    lines.push('## Follow-ups', '', ...h.followUps.map((f) => `- [ ] ${f}`), '');
  }
  if (h.themes.length) lines.push('## Themes', '', h.themes.map((t) => `\`${t}\``).join(' · '), '');
  lines.push('## Sources', '', ...sources.map((s) => `- [[${s.meta.path}|${s.meta.title}]] — ${s.meta.summary}`));
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
}
