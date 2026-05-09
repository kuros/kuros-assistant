import { Controller, Get, Query } from '@nestjs/common';
import type { SummariesResponse } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { SummariesService } from './summaries.service';

@Controller('api/summaries')
export class SummariesController {
  constructor(private readonly service: SummariesService) {}

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
}
