import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, In, Repository } from 'typeorm';
import { ActionItemEntity } from '../entities/action-item.entity';
import type { ActionItemDto, ActionItemStatus } from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { IsIn, IsOptional, IsString } from 'class-validator';

class UpdateActionItemDto {
  @IsOptional()
  @IsString()
  @IsIn(['open', 'in_progress', 'done', 'dismissed'])
  status?: ActionItemStatus;

  @IsOptional()
  @IsString()
  dueDate?: string | null;
}

@Controller('api/action-items')
export class ActionItemsController {
  constructor(
    @InjectRepository(ActionItemEntity) private readonly repo: Repository<ActionItemEntity>,
  ) {}

  private toDto(e: ActionItemEntity): ActionItemDto {
    return {
      id: e.id,
      sourceSummaryId: e.sourceSummaryId,
      title: e.title,
      detail: e.detail,
      dueDate: e.dueDate,
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
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ActionItemDto[]> {
    const where: FindOptionsWhere<ActionItemEntity> = { userId: user.id };
    if (status) {
      const list = status.split(',') as ActionItemStatus[];
      where.status = list.length > 1 ? In(list) : list[0];
    }
    if (from && to) where.dueDate = Between(from, to);
    const rows = await this.repo.find({ where, order: { createdAt: 'DESC' } });
    return rows.map((r) => this.toDto(r));
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateActionItemDto,
  ): Promise<ActionItemDto> {
    const row = await this.repo.findOneOrFail({ where: { id, userId: user.id } });
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.dueDate !== undefined) row.dueDate = dto.dueDate;
    return this.toDto(await this.repo.save(row));
  }
}
