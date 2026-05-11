import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTeamRequest, TeamDto, UpdateTeamRequest } from '@kuros/shared';
import { api } from '../client';

export function useTeams() {
  return useQuery({
    queryKey: ['teams'],
    queryFn: () => api<TeamDto[]>('/api/teams'),
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTeamRequest) => api<TeamDto>('/api/teams', { method: 'POST', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTeamRequest }) =>
      api<TeamDto>(`/api/teams/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
  });
}
