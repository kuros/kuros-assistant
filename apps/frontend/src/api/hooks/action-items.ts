import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActionItemDto, UpdateActionItemRequest } from '@kuros/shared';
import { api } from '../client';

export interface ActionItemsFilter {
  status?: string;
  from?: string;
  to?: string;
}

export function useActionItems(filter: ActionItemsFilter) {
  return useQuery({
    queryKey: ['action-items', filter],
    queryFn: () => api<ActionItemDto[]>('/api/action-items', { query: filter }),
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
