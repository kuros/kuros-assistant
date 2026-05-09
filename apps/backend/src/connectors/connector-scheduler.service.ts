import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorEntity } from '../entities/connector.entity';
import { ConnectorSyncStateEntity } from '../entities/connector-sync-state.entity';
import { ConnectorRegistry } from './connector.registry';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { Inject } from '@nestjs/common';
import { paths } from '../storage/path-builder';
import type { RawItem } from './connector.interface';

@Injectable()
export class ConnectorSchedulerService {
  private readonly logger = new Logger(ConnectorSchedulerService.name);
  private readonly mutex = new Map<string, boolean>();

  constructor(
    @InjectRepository(ConnectorEntity)
    private readonly connectors: Repository<ConnectorEntity>,
    @InjectRepository(ConnectorSyncStateEntity)
    private readonly syncStates: Repository<ConnectorSyncStateEntity>,
    private readonly registry: ConnectorRegistry,
    @Inject(STORAGE) private readonly storage: StorageService,
  ) {}

  private async withMutex<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (this.mutex.get(key)) {
      this.logger.warn(`Skipping ${key}: previous run still in progress`);
      return undefined;
    }
    this.mutex.set(key, true);
    try {
      return await fn();
    } finally {
      this.mutex.set(key, false);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAll(): Promise<void> {
    await this.withMutex('syncAll', async () => {
      const rows = await this.connectors.find({ where: { status: 'active' } });
      for (const c of rows) {
        try {
          await this.runSyncForConnector(c);
        } catch (err) {
          this.logger.error(
            `syncAll connector ${c.id} (${c.kind}) failed: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    });
  }

  async runSyncForConnector(c: ConnectorEntity, onlyTargetId?: string): Promise<number> {
    const connector = this.registry.get(c.kind);
    const targets = onlyTargetId ? [onlyTargetId] : await connector.listTargets(c.id);
    let total = 0;

    for (const targetId of targets) {
      const state = await this.syncStates.findOne({
        where: { connectorId: c.id, targetId },
      });
      const sinceCursor = state?.cursor ?? null;

      const started = Date.now();
      try {
        const result = await connector.syncTarget({ connectorId: c.id, targetId, sinceCursor });
        await this.persistRawItems(c, targetId, result.items);

        await this.syncStates.upsert(
          {
            connectorId: c.id,
            targetId,
            cursor: result.newCursor ?? state?.cursor ?? null,
            lastRunAt: new Date(),
            lastItemAt:
              result.items.length > 0
                ? result.items[result.items.length - 1]?.timestamp ?? null
                : (state?.lastItemAt ?? null),
          },
          ['connectorId', 'targetId'],
        );

        total += result.items.length;
        this.logger.log(
          `sync ok connector=${c.id} target=${targetId} items=${result.items.length} dur=${Date.now() - started}ms`,
        );
      } catch (err) {
        this.logger.error(
          `sync fail connector=${c.id} target=${targetId} dur=${Date.now() - started}ms: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return total;
  }

  private async persistRawItems(c: ConnectorEntity, targetId: string, items: RawItem[]): Promise<void> {
    if (items.length === 0) return;
    const byDay = new Map<string, RawItem[]>();
    for (const item of items) {
      const day = item.timestamp.toISOString().slice(0, 10);
      const list = byDay.get(day) ?? [];
      list.push(item);
      byDay.set(day, list);
    }
    for (const [day, list] of byDay) {
      const relPath = paths.rawJsonl(c.userId, c.kind, targetId, new Date(`${day}T00:00:00Z`));
      const lines = list.map((it) => JSON.stringify(it)).join('\n') + '\n';
      await this.storage.append(relPath, lines);
    }
  }

  // Daily summary fan-out at 23:30 every day.
  @Cron('30 23 * * *')
  async dailyFanout(): Promise<void> {
    this.logger.log('dailyFanout: not yet implemented (Phase 4/5 will wire this)');
  }

  // Weekly summary at 06:00 on Mondays.
  @Cron('0 6 * * 1')
  async weeklyFanout(): Promise<void> {
    this.logger.log('weeklyFanout: not yet implemented (Phase 4/5 will wire this)');
  }
}
