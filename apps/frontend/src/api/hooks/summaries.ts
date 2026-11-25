import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MissingSummariesDto, SummariesResponse, SummaryBackfillJobDto, SummaryDto } from '@kuros/shared';
import { api, type ApiOptions } from '../client';

export interface DailyQueryArgs {
  date?: string;
  connectorId?: string;
  targetId?: string;
}
export function useDailySummaries(args: DailyQueryArgs) {
  return useQuery({
    queryKey: ['summaries', 'daily', args],
    queryFn: () => api<SummariesResponse>('/api/summaries/daily', { query: args as ApiOptions['query'] }),
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

export function useRegenerateDailySummary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; connectorId: string }) =>
      api<SummaryDto>('/api/summaries/daily/regenerate', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['summaries', 'daily'] }),
  });
}

/** Preview of days with synced data but no summary. Free: no LLM calls. */
export function useMissingSummaries(days: number, enabled: boolean, connectorIds?: string[]) {
  return useQuery({
    queryKey: ['summaries', 'missing', days, connectorIds ?? 'all'],
    queryFn: () =>
      api<MissingSummariesDto>('/api/summaries/missing', {
        query: { days, connectorIds: connectorIds?.length ? connectorIds.join(',') : undefined },
      }),
    placeholderData: (prev) => prev,
    enabled: enabled && days >= 1,
  });
}

export function useSummaryBackfill() {
  return useQuery({
    queryKey: ['summary-backfill'],
    queryFn: async () => (await api<{ job: SummaryBackfillJobDto | null }>('/api/summaries/backfill')).job,
    refetchInterval: (q) => {
      const st = q.state.data?.status;
      return st === 'running' || st === 'cancelling' ? 2000 : 15000;
    },
  });
}

export function useStartSummaryBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { days: number; connectorIds?: string[] }) =>
      api<SummaryBackfillJobDto>('/api/summaries/backfill', { method: 'POST', body: args }),
    onSuccess: (job) => qc.setQueryData(['summary-backfill'], job),
  });
}

export function useCancelSummaryBackfill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api<{ job: SummaryBackfillJobDto | null }>('/api/summaries/backfill/cancel', { method: 'POST' })).job,
    onSuccess: (job) => qc.setQueryData(['summary-backfill'], job),
  });
}
