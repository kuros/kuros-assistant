import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionItemDto, PaginatedResponse, UpdateActionItemRequest } from '@kuros/shared';
import { api, type ApiOptions } from '../client';

export interface ActionItemsFilter {
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export function useActionItems(filter: ActionItemsFilter) {
  return useQuery({
    queryKey: ['action-items', filter],
    queryFn: () => api<PaginatedResponse<ActionItemDto>>('/api/action-items', { query: filter as ApiOptions['query'] }),
  });
}

export function useUpdateActionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateActionItemRequest }) =>
      api<ActionItemDto>(`/api/action-items/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action-items'] }),
  });
}
