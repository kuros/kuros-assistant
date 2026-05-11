import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePersonRequest, PersonDto, UpdatePersonRequest } from '@kuros/shared';
import { api } from '../client';

export function usePeople() {
  return useQuery({
    queryKey: ['people'],
    queryFn: () => api<PersonDto[]>('/api/people'),
  });
}

export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreatePersonRequest) =>
      api<PersonDto>('/api/people', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }),
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdatePersonRequest }) =>
      api<PersonDto>(`/api/people/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }),
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/people/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['people'] }),
  });
}
