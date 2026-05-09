import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConnectorEntity } from '../entities/connector.entity';
import { ConnectorSyncStateEntity } from '../entities/connector-sync-state.entity';
import { UserEntity } from '../entities/user.entity';
import { ConnectorRegistry } from './connector.registry';
import { STORAGE, type StorageService } from '../storage/storage.service';
import { paths } from '../storage/path-builder';
import type { RawItem } from './connector.interface';
import { SINGLE_USER_ID } from '@kuros/shared';
import { UserSettingsService } from '../me/user-settings.service';

@Injectable()
export class ConnectorSchedulerService {
  private readonly logger = new Logger(ConnectorSchedulerService.name);
  private readonly mutex = new Map<string, boolean>();

  constructor(
    @InjectRepository(ConnectorEntity)
    private readonly connectors: Repository<ConnectorEntity>,
    @InjectRepository(ConnectorSyncStateEntity)
    private readonly syncStates: Repository<ConnectorSyncStateEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly registry: ConnectorRegistry,
    @Inject(STORAGE) private readonly storage: StorageService,
    private readonly userSettings: UserSettingsService,
  ) {}

  private async isOnboarded(): Promise<boolean> {
    const user = await this.users.findOne({ where: { id: SINGLE_USER_ID } });
    return user?.onboarded ?? false;
  }

  private async hasApiKey(): Promise<boolean> {
    const key = await this.userSettings.getRawApiKey(SINGLE_USER_ID);
    return key != null && key.length > 0;
  }

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
    if (!(await this.isOnboarded())) {
      this.logger.log({ job: 'syncAll', status: 'awaiting_onboarding' });
      return;
    }
    if (!(await this.hasApiKey())) {
      this.logger.warn('syncAll: skipping — Anthropic API key not configured');
      return;
    }
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

  @Cron('30 23 * * *')
  async dailyFanout(): Promise<void> {
    if (!(await this.isOnboarded())) {
      this.logger.log({ job: 'dailyFanout', status: 'awaiting_onboarding' });
      return;
    }
    if (!(await this.hasApiKey())) {
      this.logger.warn('dailyFanout: skipping — Anthropic API key not configured');
      return;
    }
    this.logger.log('dailyFanout: not yet implemented (Phase 4/5 will wire this)');
  }

  @Cron('0 6 * * 1')
  async weeklyFanout(): Promise<void> {
    if (!(await this.isOnboarded())) {
      this.logger.log({ job: 'weeklyFanout', status: 'awaiting_onboarding' });
      return;
    }
    if (!(await this.hasApiKey())) {
      this.logger.warn('weeklyFanout: skipping — Anthropic API key not configured');
      return;
    }
    this.logger.log('weeklyFanout: not yet implemented (Phase 4/5 will wire this)');
  }
}
