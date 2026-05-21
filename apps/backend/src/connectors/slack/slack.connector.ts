import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connector, type ConnectorTestResult, type SyncResult, type RawItem } from '../connector.interface';
import { ConnectorRegistry } from '../connector.registry';
import { ConnectorEntity } from '../../entities/connector.entity';
import { slackConfigSchema, type SlackConfigParsed } from './slack.types';
import { SlackClient, type SlackHistoryItem } from './slack.client';

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
    const client = new SlackClient(cfg.token);
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
    const client = new SlackClient(cfg.token);
    return client.channelName(targetId);
  }

  async syncTarget(args: {
    connectorId: string;
    targetId: string;
    sinceCursor: string | null;
  }): Promise<SyncResult> {
    const cfg = await this.loadConfig(args.connectorId);
    const client = new SlackClient(cfg.token);

    const cursorTs = args.sinceCursor;
    const cursorNum = cursorTs ? Number(cursorTs) : 0;

    // conversations.history only returns parents whose own ts > oldest — it
    // never reflects replies added to older parents. To detect "thread got a
    // new reply since last run" we widen the fetch to a rolling window so the
    // older parents come back with their up-to-date latest_reply field.
    const REPLY_REFRESH_WINDOW_DAYS = 30;
    const windowStartSec = Math.floor(
      (Date.now() - REPLY_REFRESH_WINDOW_DAYS * 86400 * 1000) / 1000,
    );
    const oldest =
      cursorTs === null
        ? undefined
        : Math.min(cursorNum, windowStartSec).toString();

    const { messages } = await client.historySince(args.targetId, oldest);

    const toItem = async (m: SlackHistoryItem, parentTs?: string): Promise<RawItem> => {
      const author = m.user ? await client.userInfo(m.user) : undefined;
      return {
        id: m.ts,
        timestamp: new Date(Number(m.ts.split('.')[0]) * 1000),
        author: author ? { id: author.id, name: author.name, email: author.email } : undefined,
        text: m.text ?? '',
        metadata: {
          thread_ts: m.thread_ts ?? parentTs,
          is_reply: parentTs !== undefined,
        },
      };
    };

    // Parents we have not seen before.
    const newParents = messages.filter((m) => Number(m.ts) > cursorNum);
    const parentItems = await Promise.all(newParents.map((m) => toItem(m)));

    // Threads whose latest_reply is newer than the cursor — i.e. somebody
    // replied since the last sync. Skip threads with no reply activity to
    // avoid hammering conversations.replies on every run.
    const threadsWithNewReplies = messages.filter(
      (m) =>
        (m.reply_count ?? 0) > 0 &&
        m.latest_reply !== undefined &&
        Number(m.latest_reply) > cursorNum,
    );

    const replyBatches = await Promise.all(
      threadsWithNewReplies.map(async (m) => {
        try {
          const replies = await client.threadReplies(args.targetId, m.ts);
          const newReplies = replies.filter((r) => Number(r.ts) > cursorNum);
          return Promise.all(newReplies.map((r) => toItem(r, m.ts)));
        } catch {
          return [];
        }
      }),
    );

    const items: RawItem[] = [...parentItems, ...replyBatches.flat()];

    // Advance cursor to the max ts of anything emitted (parents OR replies),
    // so the next sync skips what we just processed.
    let newCursor: string | undefined = cursorTs ?? undefined;
    let newCursorNum = cursorNum;
    for (const it of items) {
      const ts = Number(it.id);
      if (ts > newCursorNum) {
        newCursorNum = ts;
        newCursor = it.id;
      }
    }

    return { items, newCursor };
  }
}
