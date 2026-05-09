import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ConnectorDto,
  CreateConnectorRequest,
  UpdateConnectorRequest,
  TestConnectorResponse,
  SyncConnectorRequest,
  SyncConnectorResponse,
} from '@kuros/shared';
import { api } from '../client';

export const connectorsKeys = {
  all: ['connectors'] as const,
  detail: (id: string) => ['connectors', id] as const,
};

export function useConnectors() {
  return useQuery({
    queryKey: connectorsKeys.all,
    queryFn: () => api<ConnectorDto[]>('/api/connectors'),
  });
}

export function useConnector(id: string | null) {
  return useQuery({
    queryKey: id ? connectorsKeys.detail(id) : connectorsKeys.all,
    queryFn: () => api<ConnectorDto>(`/api/connectors/${id}`),
    enabled: !!id,
  });
}

export function useCreateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateConnectorRequest) =>
      api<ConnectorDto>('/api/connectors', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: connectorsKeys.all }),
  });
}

export function useUpdateConnector(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateConnectorRequest) =>
      api<ConnectorDto>(`/api/connectors/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectorsKeys.all });
      qc.invalidateQueries({ queryKey: connectorsKeys.detail(id) });
    },
  });
}

export function useDeleteConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/connectors/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: connectorsKeys.all }),
  });
}

export function useTestConnector() {
  return useMutation({
    mutationFn: (id: string) =>
      api<TestConnectorResponse>(`/api/connectors/${id}/test`, { method: 'POST' }),
  });
}

export function useSyncConnector() {
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SyncConnectorRequest }) =>
      api<SyncConnectorResponse>(`/api/connectors/${id}/sync`, { method: 'POST', body }),
  });
}
