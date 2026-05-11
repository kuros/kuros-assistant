import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from '../client';
import type { MeDto, UpdateMeRequest } from '@kuros/shared';

export function useMe() {
  return useQuery<MeDto>({
    queryKey: ['me'],
    queryFn: () => apiGet<MeDto>('/api/me'),
    staleTime: 30_000,
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateMeRequest) => apiPatch<MeDto>('/api/me', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
}
