import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import type {
  ChatConversationDetailDto,
  ChatConversationDto,
  ChatMessageDto,
  ChatResponse,
} from '@kuros/shared';
import { ChatConversationEntity } from '../entities/chat-conversation.entity';
import { ChatMessageEntity } from '../entities/chat-message.entity';
import { ClaudeService } from '../claude/claude.service';
import { ConnectorSchedulerService } from '../connectors/connector-scheduler.service';
import { WikiStore, extractLinks, normalizePagePath, slugify, type WikiPage } from './wiki-store';
import { MAX_SELECTED_PAGES, queryAnswerPrompt, querySelectPrompt, querySelectSchema } from './prompts/query.prompt';

const HISTORY_MESSAGES = 12;
const MAX_PAGE_CHARS = 15_000;
const MAX_CONTEXT_CHARS = 100_000;

@Injectable()
export class KnowledgeChatService {
  private readonly logger = new Logger(KnowledgeChatService.name);

  constructor(
    private readonly store: WikiStore,
    private readonly claude: ClaudeService,
    private readonly scheduler: ConnectorSchedulerService,
    @InjectRepository(ChatConversationEntity) private readonly conversations: Repository<ChatConversationEntity>,
    @InjectRepository(ChatMessageEntity) private readonly messages: Repository<ChatMessageEntity>,
  ) {}

  // ---------------------------------------------------------------------------
  // Conversations
  // ---------------------------------------------------------------------------

  async listConversations(userId: string): Promise<ChatConversationDto[]> {
    const rows = await this.conversations.find({ where: { userId }, order: { updatedAt: 'DESC' }, take: 100 });
    return rows.map(toConversationDto);
  }

  async getConversation(userId: string, id: string): Promise<ChatConversationDetailDto> {
    const conv = await this.conversations.findOne({ where: { id, userId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    const msgs = await this.messages.find({ where: { conversationId: id }, order: { createdAt: 'ASC' } });
    return { ...toConversationDto(conv), messages: msgs.map(toMessageDto) };
  }

  async deleteConversation(userId: string, id: string): Promise<void> {
    await this.conversations.delete({ id, userId });
  }

  // ---------------------------------------------------------------------------
  // Ask (the gist's "query" operation)
  // ---------------------------------------------------------------------------

  async chat(userId: string, args: { conversationId?: string; message: string }): Promise<ChatResponse> {
    const question = args.message.trim();
    if (!question) throw new BadRequestException('Message is empty');

    let conv: ChatConversationEntity | null = null;
    if (args.conversationId) {
      conv = await this.conversations.findOne({ where: { id: args.conversationId, userId } });
      if (!conv) throw new NotFoundException('Conversation not found');
    } else {
      conv = await this.conversations.save(
        this.conversations.create({ userId, title: question.replace(/\s+/g, ' ').slice(0, 120) }),
      );
    }

    const prior = (
      await this.messages.find({
        where: { conversationId: conv.id },
        order: { createdAt: 'DESC' },
        take: HISTORY_MESSAGES,
      })
    ).reverse();
    const history = prior
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${truncate(m.content, 2000)}`)
      .join('\n\n');

    const userMsg = await this.messages.save(
      this.messages.create({ conversationId: conv.id, userId, role: 'user', content: question, citations: [] }),
    );

    const today = new Date().toISOString().slice(0, 10);
    const [userCtx, schema, index, pages] = await Promise.all([
      this.scheduler.loadUserContext(userId),
      this.store.readSchema(userId),
      this.store.readIndexForPrompt(userId),
      this.store.listPages(userId),
    ]);
    const byPath = new Map(pages.map((p) => [p.meta.path, p]));

    // Retrieval: keyword search over the wiki, then let the LLM pick from index + hits.
    const lastUserTurns = prior.filter((m) => m.role === 'user').slice(-2).map((m) => m.content);
    const hits = await this.store.search(userId, [question, ...lastUserTurns].join(' '), 15, pages);
    let selected: WikiPage[] = [];
    if (pages.length > 0) {
      try {
        const { data } = await this.claude.extractStructured(userId, {
          system: querySelectPrompt.system({ userCtx, today }),
          user: querySelectPrompt.user({
            index,
            searchHits: hits.map((h) => `- [[${h.meta.path}|${h.meta.title}]] — ${h.meta.summary}`).join('\n'),
            history,
            question,
          }),
          schema: querySelectSchema,
          toolName: querySelectPrompt.toolName,
          toolDescription: querySelectPrompt.toolDescription,
          toolInputSchema: querySelectPrompt.toolInputSchema as Record<string, unknown>,
          model: 'deep',
          maxTokens: 1024,
        });
        const seen = new Set<string>();
        for (const raw of data.pages) {
          const p = normalizePagePath(raw);
          const page = p ? byPath.get(p) : undefined;
          if (page && !seen.has(page.meta.path)) {
            seen.add(page.meta.path);
            selected.push(page);
          }
        }
      } catch (err) {
        this.logger.warn(`page selection failed, falling back to keyword hits: ${errMsg(err)}`);
      }
      if (selected.length === 0) selected = hits.slice(0, 6);
      selected = selected.slice(0, MAX_SELECTED_PAGES);
    }

    let budget = MAX_CONTEXT_CHARS;
    const blocks: string[] = [];
    for (const p of selected) {
      if (budget <= 0) break;
      const body = truncate(p.body, Math.min(MAX_PAGE_CHARS, budget));
      budget -= body.length;
      blocks.push(
        `<page path="${p.meta.path}" title="${p.meta.title}" updated="${p.meta.updated?.slice(0, 10) ?? 'unknown'}">\n${body}\n</page>`,
      );
    }

    const { text } = await this.claude.summarize(userId, {
      system: queryAnswerPrompt.system({ userCtx, today, schema }),
      user: queryAnswerPrompt.user({ pages: blocks.join('\n\n'), history, question }),
      model: 'deep',
      maxTokens: 4096,
    });

    const citations = extractLinks(text).filter((p) => byPath.has(p));
    const assistantMsg = await this.messages.save(
      this.messages.create({ conversationId: conv.id, userId, role: 'assistant', content: text, citations }),
    );
    conv.updatedAt = new Date();
    conv = await this.conversations.save(conv);

    await this.store
      .appendLog(userId, 'query', question.replace(/\s+/g, ' ').slice(0, 120), [
        `read: ${selected.map((p) => `[[${p.meta.path}]]`).join(', ') || '(nothing relevant)'}`,
      ])
      .catch(() => undefined);

    return {
      conversation: toConversationDto(conv),
      userMessage: toMessageDto(userMsg),
      assistantMessage: toMessageDto(assistantMsg),
    };
  }

  /** Files an answer back into the wiki as answers/<date>-<slug>, so explorations compound. */
  async fileAnswer(userId: string, messageId: string): Promise<ChatMessageDto> {
    const msg = await this.messages.findOne({ where: { id: messageId, userId } });
    if (!msg || msg.role !== 'assistant') throw new NotFoundException('Assistant message not found');
    if (msg.filedTo) return toMessageDto(msg);

    const question = await this.messages.findOne({
      where: { conversationId: msg.conversationId, role: 'user', createdAt: LessThan(msg.createdAt) },
      order: { createdAt: 'DESC' },
    });
    const q = question?.content.replace(/\s+/g, ' ').trim() ?? 'Answer';
    const date = msg.createdAt.toISOString().slice(0, 10);
    const path = `answers/${date}-${slugify(q, 50)}`;

    await this.store.withLock(userId, async () => {
      const now = new Date().toISOString();
      const firstLine =
        msg.content
          .split('\n')
          .map((l) => l.replace(/[#>*_`[\]|]/g, '').trim())
          .find((l) => l.length > 0) ?? q;
      await this.store.writePage(userId, {
        meta: {
          path,
          title: q.length > 120 ? `${q.slice(0, 119)}…` : q,
          type: 'answer',
          summary: firstLine.slice(0, 200),
          created: now,
          updated: now,
          sources: msg.citations,
          tags: [],
        },
        body: `# ${q}\n\n_Asked ${date}._\n\n${msg.content}`,
      });
      await this.store.rebuildIndex(userId);
      await this.store.appendLog(userId, 'file-answer', q.slice(0, 120), [`page: [[${path}]]`]);
    });

    msg.filedTo = path;
    return toMessageDto(await this.messages.save(msg));
  }
}

function toConversationDto(c: ChatConversationEntity): ChatConversationDto {
  return {
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toMessageDto(m: ChatMessageEntity): ChatMessageDto {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    citations: m.citations ?? [],
    filedTo: m.filedTo,
    createdAt: m.createdAt.toISOString(),
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '\n…(truncated)' : s;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
