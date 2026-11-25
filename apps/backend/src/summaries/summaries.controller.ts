import { Body, Controller, Get, NotFoundException, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { MissingSummariesDto, SummariesResponse, SummaryBackfillJobDto, SummaryDto } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { SummariesService } from './summaries.service';
import { ConnectorSchedulerService } from '../connectors/connector-scheduler.service';
import { MAX_BACKFILL_DAYS, SummaryBackfillService } from './summary-backfill.service';

class BackfillBody {
  @IsInt()
  @Min(1)
  @Max(MAX_BACKFILL_DAYS)
  days!: number;

  /** Limit to these connectors (default: all active). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  connectorIds?: string[];
}

@Controller('api/summaries')
export class SummariesController {
  constructor(
    private readonly service: SummariesService,
    private readonly scheduler: ConnectorSchedulerService,
    private readonly backfill: SummaryBackfillService,
  ) {}

  /** Preview: days in the window with synced data but no daily summary. No LLM calls. */
  @Get('missing')
  missing(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days', ParseIntPipe) days: number,
    @Query('connectorIds') connectorIds?: string,
  ): Promise<MissingSummariesDto> {
    return this.backfill.findMissing(user.id, days, connectorIds ? connectorIds.split(',').filter(Boolean) : undefined);
  }

  @Get('backfill')
  backfillStatus(@CurrentUser() user: AuthenticatedUser): { job: SummaryBackfillJobDto | null } {
    return { job: this.backfill.status(user.id) };
  }

  @Post('backfill')
  startBackfill(@CurrentUser() user: AuthenticatedUser, @Body() body: BackfillBody): Promise<SummaryBackfillJobDto> {
    return this.backfill.start(user.id, body.days, body.connectorIds);
  }

  @Post('backfill/cancel')
  cancelBackfill(@CurrentUser() user: AuthenticatedUser): { job: SummaryBackfillJobDto | null } {
    return { job: this.backfill.cancel(user.id) };
  }

  @Get('daily')
  daily(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
    @Query('connectorId') connectorId?: string,
    @Query('targetId') targetId?: string,
  ): Promise<SummariesResponse> {
    return this.service.query({ userId: user.id, kind: 'daily', date, connectorId, targetId });
  }

  @Post('daily/generate')
  async generateDaily(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { date: string },
  ): Promise<{ ok: true }> {
    await this.scheduler.generateDailySummariesForDate(user.id, body.date);
    return { ok: true };
  }

  /** Regenerates one connector's combined summary for a day (replacing any older per-channel ones). */
  @Post('daily/regenerate')
  async regenerateDaily(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { date: string; connectorId: string },
  ): Promise<SummaryDto> {
    try {
      const { summary: entity } = await this.scheduler.generateDailySummaryFor({
        userId: user.id,
        connectorId: body.connectorId,
        date: body.date,
      });
      return {
        id: entity.id,
        connectorId: entity.connectorId,
        targetId: entity.targetId,
        kind: entity.kind,
        periodStart: entity.periodStart,
        periodEnd: entity.periodEnd,
        filePath: entity.filePath,
        itemCount: entity.itemCount,
        modelUsed: entity.modelUsed,
        createdAt: entity.createdAt.toISOString(),
      };
    } catch (err) {
      throw new NotFoundException(err instanceof Error ? err.message : 'regenerate failed');
    }
  }
}
