import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GenerateInsightRequest, InsightDto, InsightResponse } from '@kuros/shared';
import { api } from '../client';

export interface InsightArgs {
  scope: 'person' | 'team';
  scopeId: string;
  from: string;
  to: string;
}

export function useInsight(args: InsightArgs | null) {
  return useQuery({
    queryKey: args ? ['insights', args.scope, args.scopeId, { from: args.from, to: args.to }] : ['insights', 'idle'],
    queryFn: () =>
      api<InsightResponse>(`/api/insights/${args!.scope}/${args!.scopeId}`, {
        query: { from: args!.from, to: args!.to },
      }),
    enabled: !!args,
    retry: false,
  });
}

export function useGenerateInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scope, scopeId, body }: { scope: 'person' | 'team'; scopeId: string; body: GenerateInsightRequest }) =>
      api<InsightDto>(`/api/insights/${scope}/${scopeId}/generate`, { method: 'POST', body }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['insights', vars.scope, vars.scopeId] });
    },
  });
}
