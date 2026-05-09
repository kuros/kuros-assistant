import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorEntity } from '../entities/connector.entity';
import type { ConnectorDto, ConnectorKind, ConnectorConfig } from '@kuros/shared';
import { ConnectorRegistry } from './connector.registry';
import { CreateConnectorDto } from './dto/create-connector.dto';
import { UpdateConnectorDto } from './dto/update-connector.dto';

const SECRET_KEYS = new Set(['botToken', 'appToken', 'clientSecret', 'cachedTokenFilePath']);

function redactConfig(cfg: Record<string, unknown>): Partial<ConnectorConfig> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cfg)) {
    out[k] = SECRET_KEYS.has(k) && typeof v === 'string' && v.length > 0 ? '***' : v;
  }
  return out as Partial<ConnectorConfig>;
}

@Injectable()
export class ConnectorsService {
  constructor(
    @InjectRepository(ConnectorEntity)
    private readonly repo: Repository<ConnectorEntity>,
    private readonly registry: ConnectorRegistry,
  ) {}

  toDto(e: ConnectorEntity): ConnectorDto {
    return {
      id: e.id,
      kind: e.kind,
      name: e.name,
      status: e.status,
      lastError: e.lastError,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      config: redactConfig(e.config),
    };
  }

  async list(userId: string): Promise<ConnectorDto[]> {
    const rows = await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async getRaw(userId: string, id: string): Promise<ConnectorEntity> {
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Connector not found: ${id}`);
    return row;
  }

  async get(userId: string, id: string): Promise<ConnectorDto> {
    return this.toDto(await this.getRaw(userId, id));
  }

  async create(userId: string, dto: CreateConnectorDto): Promise<ConnectorDto> {
    const connector = this.registry.get(dto.kind as ConnectorKind);
    await connector.validateConfig(dto.config);
    const entity = this.repo.create({
      userId,
      kind: dto.kind,
      name: dto.name,
      config: dto.config as unknown as Record<string, unknown>,
      status: 'active',
      lastError: null,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(userId: string, id: string, dto: UpdateConnectorDto): Promise<ConnectorDto> {
    const row = await this.getRaw(userId, id);
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.config !== undefined) {
      row.config = { ...row.config, ...(dto.config as Record<string, unknown>) };
      const connector = this.registry.get(row.kind);
      await connector.validateConfig(row.config);
    }
    const saved = await this.repo.save(row);
    return this.toDto(saved);
  }

  async remove(userId: string, id: string): Promise<void> {
    const row = await this.getRaw(userId, id);
    await this.repo.remove(row);
  }

  async setError(id: string, message: string): Promise<void> {
    await this.repo.update({ id }, { status: 'error', lastError: message });
  }

  async clearError(id: string): Promise<void> {
    await this.repo.update({ id }, { status: 'active', lastError: null });
  }
}
