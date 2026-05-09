import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActionItemEntity } from '../entities/action-item.entity';
import { RiskEntity } from '../entities/risk.entity';
import { SummaryEntity } from '../entities/summary.entity';
import { ClaudeService } from '../claude/claude.service';
import {
  actionItemsPrompt,
  actionItemsSchema,
  risksPrompt,
  risksSchema,
} from '../claude/prompts';
import { Inject } from '@nestjs/common';
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

  async run(args: {
    summary: SummaryEntity;
    sourceLabel: string;
    period: string;
    userId: string;
    day: Date;
  }): Promise<void> {
    const markdown = await this.storage.read(args.summary.filePath);

    try {
      const { data: ai } = await this.claude.extractStructured(args.userId, {
        system: actionItemsPrompt.system,
        user: actionItemsPrompt.user({
          sourceLabel: args.sourceLabel,
          period: args.period,
          summaryMarkdown: markdown,
        }),
        schema: actionItemsSchema,
        toolName: actionItemsPrompt.toolName,
        toolDescription: actionItemsPrompt.toolDescription,
        toolInputSchema: actionItemsPrompt.toolInputSchema as Record<string, unknown>,
      });
      for (const item of ai.items) {
        await this.actionItems.save(
          this.actionItems.create({
            userId: args.userId,
            sourceSummaryId: args.summary.id,
            title: item.title,
            detail: item.detail ?? null,
            dueDate: item.dueDate ?? null,
            status: 'open',
            filePath: paths.actionItems(args.userId, args.day),
          }),
        );
      }
    } catch (err) {
      this.logger.error(`action-item extraction failed: ${err instanceof Error ? err.message : err}`);
    }

    try {
      const { data: rk } = await this.claude.extractStructured(args.userId, {
        system: risksPrompt.system,
        user: risksPrompt.user({
          sourceLabel: args.sourceLabel,
          period: args.period,
          summaryMarkdown: markdown,
        }),
        schema: risksSchema,
        toolName: risksPrompt.toolName,
        toolDescription: risksPrompt.toolDescription,
        toolInputSchema: risksPrompt.toolInputSchema as Record<string, unknown>,
      });
      for (const r of rk.risks) {
        await this.risks.save(
          this.risks.create({
            userId: args.userId,
            sourceSummaryId: args.summary.id,
            title: r.title,
            detail: r.detail ?? null,
            severity: r.severity,
            status: 'open',
            filePath: paths.risks(args.userId, args.day),
          }),
        );
      }
    } catch (err) {
      this.logger.error(`risk extraction failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
