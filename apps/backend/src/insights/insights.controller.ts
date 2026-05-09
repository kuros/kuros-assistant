import { Body, Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { InsightDto, InsightResponse } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { InsightsService } from './insights.service';
import { PersonEntity } from '../entities/person.entity';
import { TeamEntity } from '../entities/team.entity';
import { IsString, Matches } from 'class-validator';

class GenerateInsightDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
}

@Controller('api/insights')
export class InsightsController {
  constructor(
    private readonly service: InsightsService,
    @InjectRepository(PersonEntity) private readonly people: Repository<PersonEntity>,
    @InjectRepository(TeamEntity) private readonly teams: Repository<TeamEntity>,
  ) {}

  @Get('person/:personId')
  async getPerson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('personId') personId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<InsightResponse> {
    return this.service.get({ userId: user.id, scope: 'person', scopeRef: personId, from, to });
  }

  @Post('person/:personId/generate')
  async generatePerson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('personId') personId: string,
    @Body() dto: GenerateInsightDto,
  ): Promise<InsightDto> {
    const person = await this.people.findOne({ where: { id: personId, userId: user.id } });
    if (!person) throw new NotFoundException('Person not found');
    return this.service.generate({
      userId: user.id,
      scope: 'person',
      scopeRef: personId,
      scopeLabel: person.name,
      from: dto.from,
      to: dto.to,
    });
  }

  @Get('team/:teamId')
  async getTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ): Promise<InsightResponse> {
    return this.service.get({ userId: user.id, scope: 'team', scopeRef: teamId, from, to });
  }

  @Post('team/:teamId/generate')
  async generateTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('teamId') teamId: string,
    @Body() dto: GenerateInsightDto,
  ): Promise<InsightDto> {
    const team = await this.teams.findOne({ where: { id: teamId, userId: user.id } });
    if (!team) throw new NotFoundException('Team not found');
    return this.service.generate({
      userId: user.id,
      scope: 'team',
      scopeRef: teamId,
      scopeLabel: `Team ${team.name}`,
      from: dto.from,
      to: dto.to,
    });
  }
}
