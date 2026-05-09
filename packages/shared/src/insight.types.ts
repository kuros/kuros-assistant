export type InsightScope = 'person' | 'team' | 'channel';

export interface InsightDto {
  id: string;
  scope: InsightScope;
  scopeRef: string;
  periodStart: string;
  periodEnd: string;
  filePath: string;
  modelUsed: string;
  createdAt: string;
}

export interface GenerateInsightRequest {
  from: string;
  to: string;
}

export interface InsightResponse {
  insight: InsightDto;
  markdown: string;
}
