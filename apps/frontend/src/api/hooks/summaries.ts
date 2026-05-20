import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SummariesResponse, SummaryDto } from '@kuros/shared';
import { api, type ApiOptions } from '../client';

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
    queryFn: () => api<SummariesResponse>('/api/summaries/daily', { query: args as ApiOptions['query'] }),
  });
}

export function useWeeklySummaries(args: WeeklyQueryArgs) {
  return useQuery({
    queryKey: ['summaries', 'weekly', args],
    queryFn: () => api<SummariesResponse>('/api/summaries/weekly', { query: args as ApiOptions['query'] }),
  });
}

export function useGenerateDailySummaries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string }) =>
      api<{ ok: true }>('/api/summaries/daily/generate', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['summaries', 'daily'] }),
  });
}

export function useGenerateWeeklySummaries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { isoWeek: string }) =>
      api<{ ok: true }>('/api/summaries/weekly/generate', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['summaries', 'weekly'] }),
  });
}

export function useRegenerateDailySummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; connectorId: string; targetId: string }) =>
      api<SummaryDto>('/api/summaries/daily/regenerate', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['summaries', 'daily'] }),
  });
}
