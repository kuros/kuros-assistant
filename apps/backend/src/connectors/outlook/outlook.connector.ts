import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connector, type ConnectorTestResult, type SyncResult } from '../connector.interface';
import { ConnectorRegistry } from '../connector.registry';
import { ConnectorEntity } from '../../entities/connector.entity';
import { outlookConfigSchema, type OutlookConfigParsed } from './outlook.types';
import { OutlookAuthService } from './outlook.auth';
import { OutlookClient } from './outlook.client';

@Injectable()
export class OutlookConnector extends Connector implements OnModuleInit {
  readonly kind = 'outlook' as const;

  constructor(
    private readonly registry: ConnectorRegistry,
    private readonly auth: OutlookAuthService,
    @InjectRepository(ConnectorEntity) private readonly connectors: Repository<ConnectorEntity>,
  ) {
    super();
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  private parse(cfg: unknown): OutlookConfigParsed {
    const r = outlookConfigSchema.safeParse(cfg);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
    return r.data;
  }

  private async loadConfig(connectorId: string): Promise<OutlookConfigParsed> {
    const row = await this.connectors.findOneByOrFail({ id: connectorId });
    return this.parse(row.config);
  }

  async validateConfig(cfg: unknown): Promise<void> {
    this.parse(cfg);
  }

  async test(connectorId: string): Promise<ConnectorTestResult> {
    const cfg = await this.loadConfig(connectorId);
    try {
      const tokenResult = await this.auth.getAccessToken({
        connectorId,
        tenantId: cfg.tenantId,
        clientId: cfg.clientId,
        tokenCachePath: cfg.cachedTokenFilePath,
      });
      return { ok: true, message: `Authenticated as ${tokenResult.account?.username ?? 'unknown'}` };
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

  async listTargets(connectorId: string): Promise<string[]> {
    const cfg = await this.loadConfig(connectorId);
    return cfg.monitoredAddresses;
  }

  async labelForTarget(connectorId: string, targetId: string): Promise<string> {
    const cfg = await this.loadConfig(connectorId);
    return cfg.teamLabels[targetId] ?? targetId;
  }

  async syncTarget(args: {
    connectorId: string;
    targetId: string;
    sinceCursor: string | null;
  }): Promise<SyncResult> {
    const cfg = await this.loadConfig(args.connectorId);
    const tokenResult = await this.auth.getAccessToken({
      connectorId: args.connectorId,
      tenantId: cfg.tenantId,
      clientId: cfg.clientId,
      tokenCachePath: cfg.cachedTokenFilePath,
    });
    const client = new OutlookClient(tokenResult.accessToken);
    const { messages, deltaLink } = await client.messagesSince(args.sinceCursor, [args.targetId]);

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
