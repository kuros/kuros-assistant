export type WikiPageType = 'source' | 'person' | 'team' | 'project' | 'topic' | 'daily' | 'answer';

export interface WikiPageMeta {
  /** Path relative to the wiki root, without `.md`, e.g. `people/jane-doe`. */
  path: string;
  title: string;
  type: WikiPageType;
  summary: string;
  created: string | null;
  updated: string | null;
  sources: string[];
  tags: string[];
}

export interface WikiPageDto extends WikiPageMeta {
  body: string;
  /** Pages that link to this one. */
  backlinks: string[];
}

export type WikiIngestionStatus = 'pending' | 'running' | 'done' | 'failed';

export interface WikiIngestionDto {
  id: string;
  summaryId: string;
  kind: 'daily' | 'weekly';
  /** Day for daily summaries; last day of the week for weekly ones. */
  periodDate: string;
  status: WikiIngestionStatus;
  sourcePage: string | null;
  pagesTouched: string[];
  error: string | null;
  attempts: number;
  updatedAt: string;
}

export interface WikiStatusDto {
  pageCount: number;
  counts: Record<WikiIngestionStatus, number>;
  /** Summaries that exist but have never been queued for ingestion. */
  notQueued: number;
  recentLog: string[];
  recentFailures: WikiIngestionDto[];
}

export type HighlightImportance = 'high' | 'medium' | 'low';
export type HighlightCategory =
  | 'decision'
  | 'progress'
  | 'blocker'
  | 'people'
  | 'announcement'
  | 'request'
  | 'other';

export interface DailyHighlight {
  title: string;
  detail: string;
  importance: HighlightImportance;
  category: HighlightCategory;
  /** Wiki page paths that back this highlight. */
  links: string[];
}

export interface DailyHighlightsDto {
  date: string;
  generatedAt: string | null;
  /** True when sources for the date were ingested after the highlights were generated. */
  stale: boolean;
  headline: string | null;
  highlights: DailyHighlight[];
  themes: string[];
  people: Array<{ name: string; page: string | null; note: string }>;
  followUps: string[];
  stats: {
    sources: number;
    items: number;
    pagesTouched: number;
    actionItems: number;
    risks: Record<'low' | 'medium' | 'high' | 'critical', number>;
    pendingIngestion: number;
  };
  sourcePages: Array<{ path: string; title: string; summary: string }>;
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessageDto {
  id: string;
  role: ChatRole;
  content: string;
  citations: string[];
  filedTo: string | null;
  createdAt: string;
}

export interface ChatConversationDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversationDetailDto extends ChatConversationDto {
  messages: ChatMessageDto[];
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
}

export interface ChatResponse {
  conversation: ChatConversationDto;
  userMessage: ChatMessageDto;
  assistantMessage: ChatMessageDto;
}

export interface WikiGraphNode {
  /** Page path; for unresolved links, the path that was linked to. */
  id: string;
  title: string;
  type: WikiPageType;
  summary: string;
  /** In + out link count. */
  degree: number;
  /** A link target with no page yet (Obsidian's "unresolved" nodes). */
  missing: boolean;
}

export interface WikiGraphLink {
  source: string;
  target: string;
}

export interface WikiGraphDto {
  nodes: WikiGraphNode[];
  links: WikiGraphLink[];
}

/** What the ingest worker is doing right now. */
export type IngestPhase = 'starting' | 'planning' | 'writing' | 'saving' | 'settling' | 'highlights';

export interface IngestionItemDto {
  id: string;
  summaryId: string;
  /** Source label, e.g. "#eng" or "Inbox"; falls back to connector + target before first ingest. */
  label: string;
  connectorKind: string | null;
  kind: 'daily' | 'weekly';
  periodDate: string;
  status: WikiIngestionStatus;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  pagesTouched: number;
  sourcePage: string | null;
  error: string | null;
}

export interface IngestionBatchDto {
  startedAt: string;
  finishedAt: string | null;
  /** completed + failed + still queued. Grows if more summaries are queued mid-batch. */
  total: number;
  completed: number;
  failed: number;
}

export interface IngestionProgressDto {
  active: boolean;
  phase: IngestPhase | null;
  phaseStartedAt: string | null;
  /** The day being ingested (label joins all of its sources). */
  current: IngestionItemDto | null;
  /** How many summaries the current day's ingest covers. */
  currentSources: number;
  /** While settling: when highlights generation will start if nothing new arrives. */
  settleUntil: string | null;
  /** Dates whose highlights are being (re)generated. */
  highlightsDates: string[];
  /** The running batch, or the most recent finished one. */
  batch: IngestionBatchDto | null;
  /** Summaries waiting. */
  queued: number;
  /** Distinct days waiting; each day is one ingest. */
  queuedDays: number;
  /** Average duration of one day's ingest. */
  avgDayMs: number | null;
  etaMs: number | null;
  upNext: IngestionItemDto[];
  recent: IngestionItemDto[];
}
