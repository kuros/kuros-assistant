import { useQuery } from '@tanstack/react-query';
import type { SummariesResponse } from '@kuros/shared';
import { api } from '../client';

export interface DailyQueryArgs {
  date?: string;
  connectorId?: string;
  targetId?: string;
}
export interface WeeklyQueryArgs {
  isoWeek?: string;
  connectorId?: string;
  targetId?: string;
}

export function useDailySummaries(args: DailyQueryArgs) {
  return useQuery({
    queryKey: ['summaries', 'daily', args],
    queryFn: () => api<SummariesResponse>('/api/summaries/daily', { query: args }),
  });
}

export function useWeeklySummaries(args: WeeklyQueryArgs) {
  return useQuery({
    queryKey: ['summaries', 'weekly', args],
    queryFn: () => api<SummariesResponse>('/api/summaries/weekly', { query: args }),
  });
}
