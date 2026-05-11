import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import type { SummariesResponse, SummaryDto } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { SummariesService } from './summaries.service';
import { ConnectorSchedulerService } from '../connectors/connector-scheduler.service';

@Controller('api/summaries')
export class SummariesController {
  constructor(
    private readonly service: SummariesService,
    private readonly scheduler: ConnectorSchedulerService,
  ) {}

  @Get('daily')
  daily(
    @CurrentUser() user: AuthenticatedUser,
    @Query('date') date?: string,
    @Query('connectorId') connectorId?: string,
    @Query('targetId') targetId?: string,
  ): Promise<SummariesResponse> {
    return this.service.query({ userId: user.id, kind: 'daily', date, connectorId, targetId });
  }

  @Get('weekly')
  weekly(
    @CurrentUser() user: AuthenticatedUser,
    @Query('isoWeek') isoWeek?: string,
    @Query('connectorId') connectorId?: string,
    @Query('targetId') targetId?: string,
  ): Promise<SummariesResponse> {
    return this.service.query({ userId: user.id, kind: 'weekly', isoWeek, connectorId, targetId });
  }

  @Post('daily/generate')
  async generateDaily(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { date: string },
  ): Promise<{ ok: true }> {
    await this.scheduler.generateDailySummariesForDate(user.id, body.date);
    return { ok: true };
  }

  @Post('daily/regenerate')
  async regenerateDaily(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { date: string; connectorId: string; targetId: string },
  ): Promise<SummaryDto> {
    try {
      const entity = await this.scheduler.generateDailySummaryFor({
        userId: user.id,
        connectorId: body.connectorId,
        targetId: body.targetId,
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
