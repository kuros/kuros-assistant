import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsightEntity } from '../entities/insight.entity';
import { SummaryEntity } from '../entities/summary.entity';
import type { InsightDto, InsightResponse, InsightScope } from '@kuros/shared';
import { ClaudeService } from '../claude/claude.service';
import { insightsPrompt } from '../claude/prompts';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { paths } from '../storage/path-builder';
import { Between } from 'typeorm';

@Injectable()
export class InsightsService {
  constructor(
    @InjectRepository(InsightEntity) private readonly insights: Repository<InsightEntity>,
    @InjectRepository(SummaryEntity) private readonly summaries: Repository<SummaryEntity>,
    private readonly claude: ClaudeService,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  private toDto(e: InsightEntity): InsightDto {
    return {
      id: e.id,
      scope: e.scope,
      scopeRef: e.scopeRef,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      filePath: e.filePath,
      modelUsed: e.modelUsed,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async get(args: {
    userId: string;
    scope: InsightScope;
    scopeRef: string;
    from: string;
    to: string;
  }): Promise<InsightResponse> {
    const row = await this.insights.findOne({
      where: {
        userId: args.userId,
        scope: args.scope,
        scopeRef: args.scopeRef,
        periodStart: args.from,
        periodEnd: args.to,
      },
    });
    if (!row) throw new NotFoundException('Insight not generated');
    const markdown = await this.storage.read(row.filePath);
    return { insight: this.toDto(row), markdown };
  }

  async generate(args: {
    userId: string;
    scope: InsightScope;
    scopeRef: string;
    scopeLabel: string;
    from: string;
    to: string;
  }): Promise<InsightDto> {
    const summaries = await this.summaries.find({
      where: {
        userId: args.userId,
        periodStart: Between(args.from, args.to),
      },
      order: { periodStart: 'ASC' },
    });

    const corpusParts: string[] = [];
    for (const s of summaries) {
      try {
        const md = await this.storage.read(s.filePath);
        corpusParts.push(`--- ${s.kind} ${s.periodStart} ${s.targetId} ---\n${md}`);
      } catch {
        // skip missing files
      }
    }
    const corpus = corpusParts.join('\n\n');

    const { text, modelUsed } = await this.claude.summarize(args.userId, {
      system: insightsPrompt.system({
        scopeLabel: args.scopeLabel,
        periodStart: args.from,
        periodEnd: args.to,
      }),
      user: insightsPrompt.user({
        scopeLabel: args.scopeLabel,
        periodStart: args.from,
        periodEnd: args.to,
        corpus,
      }),
      model: 'deep',
    });

    const filePath = paths.insight(
      args.userId,
      args.scope,
      args.scopeRef,
      new Date(args.from),
      new Date(args.to),
    );
    await this.storage.write(filePath, text);

    const existing = await this.insights.findOne({
      where: {
        userId: args.userId,
        scope: args.scope,
        scopeRef: args.scopeRef,
        periodStart: args.from,
        periodEnd: args.to,
      },
    });
    const entity = existing
      ? Object.assign(existing, { filePath, modelUsed })
      : this.insights.create({
          userId: args.userId,
          scope: args.scope,
          scopeRef: args.scopeRef,
          periodStart: args.from,
          periodEnd: args.to,
          filePath,
          modelUsed,
        });
    return this.toDto(await this.insights.save(entity));
  }
}
