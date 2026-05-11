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
    isoWeek?: string;
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
    targetId: string;
}
export interface RegenerateWeeklyRequest {
    isoWeek: string;
    connectorId: string;
    targetId: string;
}
