/** 'weekly' is legacy: weekly summaries are no longer generated, but old rows may still exist. */
export type SummaryKind = 'daily' | 'weekly';

export interface SummaryDto {
  id: string;
  connectorId: string;
  targetId: string;
  kind: SummaryKind;
  periodStart: string;
  periodEnd: string;
  filePath: string;
  itemCount: number;
  modelUsed: string;
  createdAt: string;
}

export interface SummariesQuery {
  date?: string;
  connectorId?: string;
  targetId?: string;
}

export interface SummariesResponse {
  summaries: SummaryDto[];
  markdownByPath: Record<string, string>;
}

export interface RegenerateDailyRequest {
  date: string;
  connectorId: string;
}

/** One connector-day that has synced data but no daily summary yet (one combined summary will be made). */
export interface MissingSummaryItem {
  date: string;
  connectorId: string;
  connectorName: string;
  connectorKind: string;
  /** Channel / project names with data that day. */
  sources: string[];
  rawItems: number;
}

export interface MissingSummariesDto {
  /** Inclusive window, in the user's timezone. Today is excluded (it's still in progress). */
  from: string;
  to: string;
  days: number;
  maxDays: number;
  items: MissingSummaryItem[];
  /** Per-connector totals across the window, to choose which connectors to include. */
  connectors: Array<{ connectorId: string; connectorName: string; connectorKind: string; summaries: number; rawItems: number }>;
  /** Connectors included in `items` / the estimate (all active ones unless narrowed). */
  includedConnectorIds: string[];
  missingDays: number;
  totalRawItems: number;
  /** Rough LLM call count: per summary (summarise + extraction) and per day (wiki plan, wiki write, highlights). */
  estimatedLlmCalls: number;
}

export type SummaryBackfillStatus = 'running' | 'cancelling' | 'done' | 'cancelled' | 'failed';

export interface SummaryBackfillResult {
  item: MissingSummaryItem;
  ok: boolean;
  error: string | null;
  durationMs: number;
}

export interface SummaryBackfillJobDto {
  status: SummaryBackfillStatus;
  days: number;
  connectorIds: string[];
  from: string;
  to: string;
  startedAt: string;
  finishedAt: string | null;
  total: number;
  completed: number;
  failed: number;
  current: MissingSummaryItem | null;
  currentStartedAt: string | null;
  /** Why the job stopped early (e.g. repeated failures). */
  error: string | null;
  /** Most recent first. */
  results: SummaryBackfillResult[];
}

/**
 * targetId of a combined daily summary covering every channel/project of a connector for a day.
 * (Older summaries were one per target; those keep their real target id.)
 */
export const COMBINED_TARGET_ID = '_all';
