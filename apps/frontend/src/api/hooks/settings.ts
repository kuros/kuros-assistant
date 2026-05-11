import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from '../client';
import type { UserSettingsDto, UpdateUserSettingsRequest } from '@kuros/shared';

export function useUserSettings() {
  return useQuery<UserSettingsDto>({
    queryKey: ['me', 'settings'],
    queryFn: () => apiGet<UserSettingsDto>('/api/me/settings'),
    staleTime: 30_000,
  });
}

export function useUpdateUserSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateUserSettingsRequest) =>
      apiPatch<UserSettingsDto>('/api/me/settings', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me', 'settings'] }),
  });
}

export function useTestApiKey() {
  return useMutation({
    mutationFn: (apiKey?: string) =>
      apiPost<{ ok: boolean; error?: string }>('/api/me/settings/test-key', { apiKey }),
  });
}
