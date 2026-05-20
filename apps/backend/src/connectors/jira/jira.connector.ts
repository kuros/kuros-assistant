import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Connector, type ConnectorTestResult, type SyncResult } from '../connector.interface';
import { ConnectorRegistry } from '../connector.registry';
import { ConnectorEntity } from '../../entities/connector.entity';
import { jiraConfigSchema, type JiraConfigParsed } from './jira.types';

type JiraDescription = { content?: { content?: { text?: string }[] }[] };
import { JiraClient, type JiraComment } from './jira.client';

function extractText(description: unknown): string {
  if (!description || typeof description !== 'object') return '';
  const doc = description as JiraDescription;
  return (doc.content ?? [])
    .flatMap((block) => block.content ?? [])
    .map((node) => node.text ?? '')
    .join(' ')
    .trim();
}

function formatComments(comments: JiraComment[]): string {
  if (comments.length === 0) return '';
  const lines = comments
    .map((c) => {
      const author = c.author?.displayName ?? c.author?.emailAddress ?? 'Unknown';
      const date = (c.created ?? '').slice(0, 10);
      const body = extractText(c.body);
      if (!body) return null;
      return `- ${author} (${date}): ${body}`;
    })
    .filter((l): l is string => l !== null);
  if (lines.length === 0) return '';
  return `Comments:\n${lines.join('\n')}`;
}

@Injectable()
export class JiraConnector extends Connector implements OnModuleInit {
  readonly kind = 'jira' as const;

  constructor(
    private readonly registry: ConnectorRegistry,
    @InjectRepository(ConnectorEntity) private readonly connectors: Repository<ConnectorEntity>,
  ) {
    super();
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  private parse(cfg: unknown): JiraConfigParsed {
    const r = jiraConfigSchema.safeParse(cfg);
    if (!r.success) throw new BadRequestException(r.error.issues.map((i) => i.message).join('; '));
    return r.data;
  }

  private async loadConfig(connectorId: string): Promise<JiraConfigParsed> {
    const row = await this.connectors.findOneByOrFail({ id: connectorId });
    return this.parse(row.config);
  }

  async validateConfig(cfg: unknown): Promise<void> {
    this.parse(cfg);
  }

  async test(connectorId: string): Promise<ConnectorTestResult> {
    const cfg = await this.loadConfig(connectorId);
    const client = new JiraClient(cfg.baseUrl, cfg.email, cfg.apiToken);
    try {
      const me = await client.myself();
      return { ok: true, message: `Connected as ${me.displayName} (${me.emailAddress})` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  async listTargets(connectorId: string): Promise<string[]> {
    const cfg = await this.loadConfig(connectorId);
    return cfg.projectKeys;
  }

  async labelForTarget(connectorId: string, targetId: string): Promise<string> {
    const cfg = await this.loadConfig(connectorId);
    const client = new JiraClient(cfg.baseUrl, cfg.email, cfg.apiToken);
    const project = await client.getProject(targetId);
    return `${project.name} (${project.key})`;
  }

  async syncTarget(args: {
    connectorId: string;
    targetId: string;
    sinceCursor: string | null;
  }): Promise<SyncResult> {
    const cfg = await this.loadConfig(args.connectorId);
    const client = new JiraClient(cfg.baseUrl, cfg.email, cfg.apiToken);

    // First sync (no cursor): fetch ALL issues in the project.
    // Subsequent syncs: start from the cursor date (JQL requires "YYYY-MM-DD").
    const jqlDate = args.sinceCursor ? args.sinceCursor.slice(0, 10) : null;

    const allIssues = await client.allIssuesSince(args.targetId, jqlDate);

    // Post-filter: skip records already processed in a previous sync.
    // The cursor is a full ISO timestamp so we can skip the already-seen portion
    // of the cursor date without re-processing it on every run.
    const cursorMs = args.sinceCursor ? new Date(args.sinceCursor).getTime() : 0;
    const newIssues = allIssues.filter(
      (i) => new Date(i.fields.updated).getTime() > cursorMs,
    );

    const items = await Promise.all(
      newIssues.map(async (issue) => {
        const f = issue.fields;
        const body = extractText(f.description);

        const MAX_COMMENTS = 5;
        let comments: JiraComment[] = f.comment?.comments ?? [];
        const total = f.comment?.total ?? comments.length;
        if (total > comments.length) {
          // Inline list was truncated by the search endpoint; fetch just the latest N.
          try {
            comments = await client.latestCommentsForIssue(issue.key, MAX_COMMENTS);
          } catch {
            // Fall back to the truncated inline list rather than failing the whole sync.
          }
        }
        // Inline comments come oldest-first, so the tail holds the most recent.
        comments = comments.slice(-MAX_COMMENTS);
        const commentBlock = formatComments(comments);

        const sections = [body, commentBlock].filter((s) => s.length > 0);
        const text = `[${issue.key}] ${f.summary}${sections.length > 0 ? `\n\n${sections.join('\n\n')}` : ''}`;

        return {
          id: issue.id,
          timestamp: new Date(f.updated),
          author: f.reporter
            ? {
                id: f.reporter.accountId,
                name: f.reporter.displayName,
                email: f.reporter.emailAddress,
              }
            : undefined,
          text,
          description: f.description,
          metadata: {
            key: issue.key,
            status: f.status.name,
            priority: f.priority?.name,
            assignee: f.assignee?.displayName,
            commentCount: comments.length,
          },
        };
      }),
    );

    // Use Date arithmetic (not string comparison) to find the true latest timestamp.
    // Jira returns offsets like "-0400" which can differ across records, making
    // lexicographic string comparison unreliable.
    const latestUpdated =
      newIssues.length > 0
        ? newIssues.reduce<string | null>(
            (max, i) =>
              max === null || new Date(i.fields.updated).getTime() > new Date(max).getTime()
                ? i.fields.updated
                : max,
            null,
          )
        : null;

    // Store the full ISO timestamp so the next sync can skip already-processed records
    const newCursor = latestUpdated ?? args.sinceCursor ?? undefined;
    return { items, newCursor };
  }
}
