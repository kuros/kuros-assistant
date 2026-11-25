import { format, getISOWeek, getISOWeekYear } from 'date-fns';
import type { ConnectorKind, InsightScope } from '@kuros/shared';

export const formatISODate = (d: Date): string => format(d, 'yyyy-MM-dd');

export const formatISOWeek = (d: Date): string => {
  const year = getISOWeekYear(d);
  const week = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
};

export const paths = {
  rawJsonl: (userId: string, kind: ConnectorKind, targetId: string, day: Date) =>
    `users/${userId}/${kind}/raw/${targetId}/${formatISODate(day)}.jsonl`,
  dailySummary: (userId: string, kind: ConnectorKind, targetId: string, day: Date) =>
    `users/${userId}/${kind}/daily/${targetId}/${formatISODate(day)}.md`,
  insight: (
    userId: string,
    scope: InsightScope,
    scopeRef: string,
    periodStart: Date,
    periodEnd: Date,
  ) =>
    `users/${userId}/insights/${scope}/${scopeRef}/${formatISODate(periodStart)}_${formatISODate(periodEnd)}.md`,
  actionItems: (userId: string, day: Date) =>
    `users/${userId}/action-items/${formatISODate(day)}.md`,
  risks: (userId: string, day: Date) => `users/${userId}/risks/${formatISODate(day)}.md`,
  outlookTokenCache: (userId: string, connectorId: string) =>
    `users/${userId}/outlook/tokens/${connectorId}.json`,
};
