import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SummaryEntity } from '../entities/summary.entity';
import { STORAGE, type StorageService } from '../storage/storage.service';
import type { SummariesResponse, SummaryDto, SummaryKind } from '@kuros/shared';

@Injectable()
export class SummariesService {
  constructor(
    @InjectRepository(SummaryEntity) private readonly repo: Repository<SummaryEntity>,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  private toDto(e: SummaryEntity): SummaryDto {
    return {
      id: e.id,
      connectorId: e.connectorId,
      targetId: e.targetId,
      kind: e.kind,
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      filePath: e.filePath,
      itemCount: e.itemCount,
      modelUsed: e.modelUsed,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async query(args: {
    userId: string;
    kind: SummaryKind;
    date?: string;
    connectorId?: string;
    targetId?: string;
  }): Promise<SummariesResponse> {
    const where: Record<string, unknown> = { userId: args.userId, kind: args.kind };
    if (args.connectorId) where.connectorId = args.connectorId;
    if (args.targetId) where.targetId = args.targetId;
    if (args.kind === 'daily' && args.date) where.periodStart = args.date;

    const rows = await this.repo.find({ where, order: { periodStart: 'DESC' } });

    const markdownByPath: Record<string, string> = {};
    for (const r of rows) {
      try {
        markdownByPath[r.filePath] = await this.storage.read(r.filePath);
      } catch {
        markdownByPath[r.filePath] = '';
      }
    }
    return {
      summaries: rows.map((r) => this.toDto(r)),
      markdownByPath,
    };
  }

  async getById(userId: string, id: string): Promise<SummaryEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Summary not found: ${id}`);
    return row;
  }
}
