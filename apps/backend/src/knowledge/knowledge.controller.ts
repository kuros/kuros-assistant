import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import type {
  ChatConversationDetailDto,
  ChatConversationDto,
  ChatMessageDto,
  ChatResponse,
  DailyHighlightsDto,
  IngestionProgressDto,
  WikiGraphDto,
  WikiPageDto,
  WikiPageMeta,
  WikiStatusDto,
} from '@kuros/shared';
import { CurrentUser, AuthenticatedUser } from '../common/auth/current-user.decorator';
import { WikiStore, normalizePagePath } from './wiki-store';
import { WikiIngestService } from './wiki-ingest.service';
import { HighlightsService } from './highlights.service';
import { KnowledgeChatService } from './knowledge-chat.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

class ChatBody {
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}

class DateBody {
  @Matches(DATE)
  date!: string;
}

class BackfillBody {
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @IsOptional()
  @Matches(DATE)
  to?: string;
}

@Controller('api/knowledge')
export class KnowledgeController {
  constructor(
    private readonly store: WikiStore,
    private readonly ingest: WikiIngestService,
    private readonly highlights: HighlightsService,
    private readonly chatService: KnowledgeChatService,
  ) {}

  // --- wiki browsing --------------------------------------------------------

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser): Promise<WikiStatusDto> {
    return this.ingest.status(user.id);
  }

  @Get('pages')
  async pages(@CurrentUser() user: AuthenticatedUser): Promise<WikiPageMeta[]> {
    const pages = await this.store.listPages(user.id);
    return pages.map((p) => p.meta).sort((a, b) => a.path.localeCompare(b.path));
  }

  @Get('page')
  async page(@CurrentUser() user: AuthenticatedUser, @Query('path') rawPath: string): Promise<WikiPageDto> {
    const path = normalizePagePath(rawPath ?? '');
    if (!path) throw new NotFoundException(`Invalid page path: ${rawPath}`);
    const all = await this.store.listPages(user.id);
    const page = all.find((p) => p.meta.path === path);
    if (!page) throw new NotFoundException(`Page not found: ${path}`);
    return { ...page.meta, body: page.body, backlinks: await this.store.backlinks(user.id, path, all) };
  }

  @Get('graph')
  graph(@CurrentUser() user: AuthenticatedUser): Promise<WikiGraphDto> {
    return this.store.graph(user.id);
  }

  @Get('special/:name')
  async special(
    @CurrentUser() user: AuthenticatedUser,
    @Param('name') name: string,
  ): Promise<{ name: string; content: string }> {
    const file = ({ index: 'index.md', log: 'log.md', schema: 'SCHEMA.md' } as Record<string, string>)[name];
    if (!file) throw new NotFoundException(`Unknown page: ${name}`);
    await this.store.ensureInitialized(user.id);
    return { name, content: (await this.store.readRaw(user.id, file)) ?? '' };
  }

  // --- ingestion ------------------------------------------------------------

  @Get('ingest/progress')
  progress(@CurrentUser() user: AuthenticatedUser): Promise<IngestionProgressDto> {
    return this.ingest.progress(user.id);
  }

  @Post('ingest/backfill')
  backfill(@CurrentUser() user: AuthenticatedUser, @Body() body: BackfillBody): Promise<{ queued: number }> {
    return this.ingest.backfill(user.id, body.from, body.to);
  }

  @Post('ingest/retry-failed')
  retryFailed(@CurrentUser() user: AuthenticatedUser): Promise<{ queued: number }> {
    return this.ingest.retryFailed(user.id);
  }

  // --- highlights -----------------------------------------------------------

  @Get('highlights')
  getHighlights(@CurrentUser() user: AuthenticatedUser, @Query('date') date: string): Promise<DailyHighlightsDto> {
    return this.highlights.get(user.id, date);
  }

  @Post('highlights/generate')
  generateHighlights(@CurrentUser() user: AuthenticatedUser, @Body() body: DateBody): Promise<DailyHighlightsDto> {
    return this.highlights.generate(user.id, body.date);
  }

  // --- chat -----------------------------------------------------------------

  @Get('conversations')
  conversations(@CurrentUser() user: AuthenticatedUser): Promise<ChatConversationDto[]> {
    return this.chatService.listConversations(user.id);
  }

  @Get('conversations/:id')
  conversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChatConversationDetailDto> {
    return this.chatService.getConversation(user.id, id);
  }

  @Delete('conversations/:id')
  async deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.chatService.deleteConversation(user.id, id);
    return { ok: true };
  }

  @Post('chat')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() body: ChatBody): Promise<ChatResponse> {
    return this.chatService.chat(user.id, body);
  }

  @Post('messages/:id/file')
  fileAnswer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ChatMessageDto> {
    return this.chatService.fileAnswer(user.id, id);
  }
}
