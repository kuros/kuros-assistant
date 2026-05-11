import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { RiskEntity } from '../entities/risk.entity';
import type { PaginatedResponse, RiskDto, RiskSeverity, RiskStatus } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { IsIn, IsOptional, IsString } from 'class-validator';

class UpdateRiskDto {
  @IsOptional()
  @IsString()
  @IsIn(['open', 'mitigated', 'accepted', 'closed'])
  status?: RiskStatus;

  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: RiskSeverity;
}

@Controller('api/risks')
export class RisksController {
  constructor(@InjectRepository(RiskEntity) private readonly repo: Repository<RiskEntity>) {}

  private toDto(e: RiskEntity): RiskDto {
    return {
      id: e.id,
      sourceSummaryId: e.sourceSummaryId,
      title: e.title,
      detail: e.detail,
      severity: e.severity,
      status: e.status,
      filePath: e.filePath,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ): Promise<PaginatedResponse<RiskDto>> {
    const where: FindOptionsWhere<RiskEntity> = { userId: user.id };
    if (status) {
      const list = status.split(',') as RiskStatus[];
      where.status = list.length > 1 ? In(list) : list[0];
    }
    if (severity) {
      const list = severity.split(',') as RiskSeverity[];
      where.severity = list.length > 1 ? In(list) : list[0];
    }
    if (from && to) where.createdAt = Between(new Date(from), new Date(to));
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '200', 10) || 200));
    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data: rows.map((r) => this.toDto(r)), total, page, limit };
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRiskDto,
  ): Promise<RiskDto> {
    const row = await this.repo.findOneOrFail({ where: { id, userId: user.id } });
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.severity !== undefined) row.severity = dto.severity;
    return this.toDto(await this.repo.save(row));
  }
}
