import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaginatedResponse, RiskDto, UpdateRiskRequest } from '@kuros/shared';
import { api, type ApiOptions } from '../client';

export interface RisksFilter {
  status?: string;
  severity?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useRisks(filter: RisksFilter) {
  return useQuery({
    queryKey: ['risks', filter],
    queryFn: () => api<PaginatedResponse<RiskDto>>('/api/risks', { query: filter as ApiOptions['query'] }),
  });
}

export function useUpdateRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRiskRequest }) =>
      api<RiskDto>(`/api/risks/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }),
  });
}
