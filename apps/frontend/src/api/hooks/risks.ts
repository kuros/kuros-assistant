import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RiskDto, UpdateRiskRequest } from '@kuros/shared';
import { api } from '../client';

export interface RisksFilter {
  status?: string;
  severity?: string;
  from?: string;
  to?: string;
}

export function useRisks(filter: RisksFilter) {
  return useQuery({
    queryKey: ['risks', filter],
    queryFn: () => api<RiskDto[]>('/api/risks', { query: filter }),
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
