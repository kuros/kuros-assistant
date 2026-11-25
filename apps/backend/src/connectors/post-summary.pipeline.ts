import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ActionItemEntity } from '../entities/action-item.entity';
import { RiskEntity } from '../entities/risk.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { ClaudeService } from '../claude/claude.service';
import { extractionPrompt, extractionSchema, type UserContext } from '../claude/prompts';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { paths } from '../storage/path-builder';

@Injectable()
export class PostSummaryPipeline {
  private readonly logger = new Logger(PostSummaryPipeline.name);

  constructor(
    private readonly claude: ClaudeService,
    @InjectRepository(ActionItemEntity) private readonly actionItems: Repository<ActionItemEntity>,
    @InjectRepository(RiskEntity) private readonly risks: Repository<RiskEntity>,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  /**
   * Extracts action items and risks from a freshly written summary in one LLM call.
   *
   * `replacedSummaryIds` are summaries this one supersedes (a regenerate, or old per-channel
   * summaries folded into a combined one). Items they produced that are still untouched
   * ('open') are removed first so a re-run doesn't duplicate them; anything the user has
   * already triaged is kept.
   */
  async run(args: {
    summary: SummaryEntity;
    sourceLabel: string;
    period: string;
    userId: string;
    day: Date;
    userCtx: UserContext;
    replacedSummaryIds?: string[];
  }): Promise<void> {
    const markdown = await this.storage.read(args.summary.filePath);

    const stale = [...new Set([args.summary.id, ...(args.replacedSummaryIds ?? [])])];
    await this.actionItems.delete({ userId: args.userId, sourceSummaryId: In(stale), status: 'open' });
    await this.risks.delete({ userId: args.userId, sourceSummaryId: In(stale), status: 'open' });

    try {
      const { data } = await this.claude.extractStructured(args.userId, {
        system: extractionPrompt.system(args.userCtx),
        user: extractionPrompt.user({
          sourceLabel: args.sourceLabel,
          period: args.period,
          summaryMarkdown: markdown,
        }),
        schema: extractionSchema,
        toolName: extractionPrompt.toolName,
        toolDescription: extractionPrompt.toolDescription,
        toolInputSchema: extractionPrompt.toolInputSchema as Record<string, unknown>,
        maxTokens: 4096,
      });
      if (data.actionItems.length) {
        await this.actionItems.save(
          data.actionItems.map((item) =>
            this.actionItems.create({
              userId: args.userId,
              sourceSummaryId: args.summary.id,
              title: item.title,
              detail: item.detail ?? null,
              dueDate: item.dueDate ?? null,
              status: 'open',
              filePath: paths.actionItems(args.userId, args.day),
            }),
          ),
        );
      }
      if (data.risks.length) {
        await this.risks.save(
          data.risks.map((r) =>
            this.risks.create({
              userId: args.userId,
              sourceSummaryId: args.summary.id,
              title: r.title,
              detail: r.detail ?? null,
              severity: r.severity,
              status: 'open',
              filePath: paths.risks(args.userId, args.day),
            }),
          ),
        );
      }
    } catch (err) {
      this.logger.error(`action item / risk extraction failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
