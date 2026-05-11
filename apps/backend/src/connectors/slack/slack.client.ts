import { WebClient } from '@slack/web-api';

export interface SlackUserInfo {
  id: string;
  name: string;
  email?: string;
}

export interface SlackHistoryItem {
  ts: string;
  user?: string;
  text?: string;
  thread_ts?: string;
}

export class SlackClient {
  private readonly web: WebClient;
  private readonly userCache = new Map<string, SlackUserInfo>();
  private readonly channelCache = new Map<string, string>();

  constructor(token: string) {
    this.web = new WebClient(token);
  }

  async authTest(): Promise<{ teamId: string; userId: string }> {
    const r = await this.web.auth.test();
    return {
      teamId: (r.team_id as string | undefined) ?? '',
      userId: (r.user_id as string | undefined) ?? '',
    };
  }

  async channelName(channelId: string): Promise<string> {
    const cached = this.channelCache.get(channelId);
    if (cached) return cached;
    const r = await this.web.conversations.info({ channel: channelId });
    const name = `#${(r.channel as { name?: string } | undefined)?.name ?? channelId}`;
    this.channelCache.set(channelId, name);
    return name;
  }

  async historySince(
    channelId: string,
    oldestTs?: string,
  ): Promise<{ messages: SlackHistoryItem[]; latestTs: string | undefined }> {
    const messages: SlackHistoryItem[] = [];
    let cursor: string | undefined;
    let latestTs: string | undefined;
    do {
      const r = await this.web.conversations.history({
        channel: channelId,
        oldest: oldestTs,
        limit: 200,
        cursor,
      });
      const batch = (r.messages ?? []) as SlackHistoryItem[];
      for (const m of batch) {
        if (!m.ts) continue;
        messages.push(m);
        if (!latestTs || Number(m.ts) > Number(latestTs)) latestTs = m.ts;
      }
      cursor = r.response_metadata?.next_cursor || undefined;
    } while (cursor);
    return { messages, latestTs };
  }

  async userInfo(userId: string): Promise<SlackUserInfo> {
    const cached = this.userCache.get(userId);
    if (cached) return cached;
    const r = await this.web.users.info({ user: userId });
    const u = r.user as { name?: string; profile?: { email?: string } } | undefined;
    const info: SlackUserInfo = {
      id: userId,
      name: u?.name ?? userId,
      email: u?.profile?.email,
    };
    this.userCache.set(userId, info);
    return info;
  }
}
