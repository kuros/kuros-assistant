import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connector, type ConnectorTestResult, type SyncResult } from '../connector.interface';
import { ConnectorRegistry } from '../connector.registry';
import { ConnectorEntity } from '../../entities/connector.entity';
import { outlookPersonalConfigSchema, type OutlookPersonalConfigParsed } from './outlook-personal.types';
import { OutlookPersonalAuthService } from './outlook-personal.auth';
import { OutlookPersonalClient } from './outlook-personal.client';

const DEFAULT_START_DAYS = 7;

@Injectable()
export class OutlookPersonalConnector extends Connector implements OnModuleInit {
  readonly kind = 'outlook-personal' as const;

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly auth: OutlookPersonalAuthService,
    @InjectRepository(ConnectorEntity) private readonly connectors: Repository<ConnectorEntity>,
  ) {
    super();
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  private parse(cfg: unknown): OutlookPersonalConfigParsed {
    const r = outlookPersonalConfigSchema.safeParse(cfg);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
    return r.data;
  }

  private async loadConfig(connectorId: string): Promise<OutlookPersonalConfigParsed> {
    const row = await this.connectors.findOneByOrFail({ id: connectorId });
    return this.parse(row.config);
  }

  // Token cache is stored under a well-known path derived from the connector ID
  // so users never have to think about it.
  private tokenCachePath(connectorId: string): string {
    return `outlook-personal/${connectorId}.token.json`;
  }

  private resolveStartDate(cfg: OutlookPersonalConfigParsed): string {
    if (cfg.startDate) {
      return cfg.startDate.includes('T') ? cfg.startDate : `${cfg.startDate}T00:00:00Z`;
    }
    return new Date(Date.now() - DEFAULT_START_DAYS * 24 * 60 * 60 * 1000).toISOString();
  }

  async validateConfig(cfg: unknown): Promise<void> {
    this.parse(cfg);
  }

  async test(connectorId: string): Promise<ConnectorTestResult> {
    const cfg = await this.loadConfig(connectorId);
    try {
      const tokenResult = await this.auth.getAccessToken({
        connectorId,
        clientId: cfg.clientId,
        tokenCachePath: this.tokenCachePath(connectorId),
      });
      return { ok: true, message: `Authenticated as ${tokenResult.account?.username ?? cfg.emailAddress}` };
    } catch (err) {
      const pending = this.auth.takePendingDeviceCode(connectorId);
      if (pending) {
        return {
          ok: false,
          message: 'Device-code authentication pending. Complete the prompt and retry.',
          deviceCode: pending,
        };
      }
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // Single target: the user's own inbox, keyed by their email address
  async listTargets(connectorId: string): Promise<string[]> {
    const cfg = await this.loadConfig(connectorId);
    return [cfg.emailAddress];
  }

  async labelForTarget(_connectorId: string, targetId: string): Promise<string> {
    return targetId;
  }

  async syncTarget(args: {
    connectorId: string;
    targetId: string;
    sinceCursor: string | null;
  }): Promise<SyncResult> {
    const cfg = await this.loadConfig(args.connectorId);
    const tokenResult = await this.auth.getAccessToken({
      connectorId: args.connectorId,
      clientId: cfg.clientId,
      tokenCachePath: this.tokenCachePath(args.connectorId),
    });

    const startDate = this.resolveStartDate(cfg);
    const client = new OutlookPersonalClient(tokenResult.accessToken);
    const { messages, deltaLink } = await client.messagesSince(args.sinceCursor, startDate);

    const items = messages.map((m) => ({
      id: m.id,
      timestamp: new Date(m.receivedDateTime),
      author: m.from?.emailAddress
        ? {
            id: m.from.emailAddress.address ?? '',
            name: m.from.emailAddress.name,
            email: m.from.emailAddress.address,
          }
        : undefined,
      text: `Subject: ${m.subject}\n\n${m.bodyPreview}`,
      metadata: {
        recipients: (m.toRecipients ?? [])
          .map((r) => r.emailAddress?.address)
          .filter((x): x is string => !!x),
      },
    }));

    return { items, newCursor: deltaLink ?? args.sinceCursor ?? undefined };
  }
}
