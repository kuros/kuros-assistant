import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connector, type ConnectorTestResult, type SyncResult } from '../connectors/connector.interface';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { ConnectorEntity } from '../entities/connector.entity';
import { slackConfigSchema, type SlackConfigParsed } from './slack.types';
import { SlackClient } from './slack.client';

@Injectable()
export class SlackConnector extends Connector implements OnModuleInit {
  readonly kind = 'slack' as const;

  constructor(
    private readonly registry: ConnectorRegistry,
    @InjectRepository(ConnectorEntity) private readonly connectors: Repository<ConnectorEntity>,
  ) {
    super();
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  private parse(cfg: unknown): SlackConfigParsed {
    const r = slackConfigSchema.safeParse(cfg);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
    return r.data;
  }

  private async loadConfig(connectorId: string): Promise<SlackConfigParsed> {
    const row = await this.connectors.findOneByOrFail({ id: connectorId });
    return this.parse(row.config);
  }

  async validateConfig(cfg: unknown): Promise<void> {
    this.parse(cfg);
  }

  async test(connectorId: string): Promise<ConnectorTestResult> {
    const cfg = await this.loadConfig(connectorId);
    const client = new SlackClient(cfg.botToken);
    try {
      const r = await client.authTest();
      return { ok: true, message: `Connected to team ${r.teamId} as user ${r.userId}` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async listTargets(connectorId: string): Promise<string[]> {
    const cfg = await this.loadConfig(connectorId);
    return cfg.channelIds;
  }

  async labelForTarget(connectorId: string, targetId: string): Promise<string> {
    const cfg = await this.loadConfig(connectorId);
    const client = new SlackClient(cfg.botToken);
    return client.channelName(targetId);
  }

  async syncTarget(args: {
    connectorId: string;
    targetId: string;
    sinceCursor: string | null;
  }): Promise<SyncResult> {
    const cfg = await this.loadConfig(args.connectorId);
    const client = new SlackClient(cfg.botToken);
    const { messages, latestTs } = await client.historySince(
      args.targetId,
      args.sinceCursor ?? undefined,
    );

    const items = await Promise.all(
      messages.map(async (m) => {
        const author = m.user ? await client.userInfo(m.user) : undefined;
        return {
          id: m.ts,
          timestamp: new Date(Number(m.ts.split('.')[0]) * 1000),
          author: author ? { id: author.id, name: author.name, email: author.email } : undefined,
          text: m.text ?? '',
          metadata: { thread_ts: m.thread_ts },
        };
      }),
    );

    return { items, newCursor: latestTs ?? args.sinceCursor ?? undefined };
  }
}
