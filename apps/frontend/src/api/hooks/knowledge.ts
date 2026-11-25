import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatConversationDetailDto,
  ChatConversationDto,
  ChatMessageDto,
  ChatResponse,
  DailyHighlightsDto,
  IngestionProgressDto,
  WikiGraphDto,
  WikiPageDto,
  WikiPageMeta,
  WikiStatusDto,
} from '@kuros/shared';
import { api, apiDelete, apiGet, apiPost } from '../client';

export function useWikiStatus(opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: ['knowledge', 'status'],
    queryFn: () => apiGet<WikiStatusDto>('/api/knowledge/status'),
    // Poll while ingestion is in flight so progress shows up without a refresh.
    refetchInterval: (q) => {
      const c = q.state.data?.counts;
      return opts.poll && c && c.pending + c.running > 0 ? 5000 : false;
    },
  });
}

export function useWikiPages() {
  return useQuery({
    queryKey: ['knowledge', 'pages'],
    queryFn: () => apiGet<WikiPageMeta[]>('/api/knowledge/pages'),
  });
}

export function useWikiPage(path: string | null) {
  return useQuery({
    queryKey: ['knowledge', 'page', path],
    queryFn: () => apiGet<WikiPageDto>('/api/knowledge/page', { path }),
    enabled: !!path,
    retry: false,
  });
}

export function useWikiSpecial(name: 'index' | 'log' | 'schema' | null) {
  return useQuery({
    queryKey: ['knowledge', 'special', name],
    queryFn: () => apiGet<{ name: string; content: string }>(`/api/knowledge/special/${name}`),
    enabled: !!name,
  });
}

function useInvalidateKnowledge() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['ingestion-progress'] });
    return qc.invalidateQueries({ queryKey: ['knowledge'] });
  };
}

export function useBackfillWiki() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: (body: { from?: string; to?: string } = {}) =>
      apiPost<{ queued: number }>('/api/knowledge/ingest/backfill', body),
    onSuccess: invalidate,
  });
}

export function useRetryFailedIngestion() {
  const invalidate = useInvalidateKnowledge();
  return useMutation({
    mutationFn: () => apiPost<{ queued: number }>('/api/knowledge/ingest/retry-failed'),
    onSuccess: invalidate,
  });
}

export function useDailyHighlights(date: string) {
  return useQuery({
    queryKey: ['knowledge', 'highlights', date],
    queryFn: () => apiGet<DailyHighlightsDto>('/api/knowledge/highlights', { date }),
    refetchInterval: (q) => ((q.state.data?.stats.pendingIngestion ?? 0) > 0 ? 8000 : false),
  });
}

export function useGenerateHighlights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date: string) => apiPost<DailyHighlightsDto>('/api/knowledge/highlights/generate', { date }),
    onSuccess: (data) => {
      qc.setQueryData(['knowledge', 'highlights', data.date], data);
      void qc.invalidateQueries({ queryKey: ['knowledge', 'pages'] });
    },
  });
}

export function useConversations() {
  return useQuery({
    queryKey: ['knowledge', 'conversations'],
    queryFn: () => apiGet<ChatConversationDto[]>('/api/knowledge/conversations'),
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: ['knowledge', 'conversation', id],
    queryFn: () => apiGet<ChatConversationDetailDto>(`/api/knowledge/conversations/${id}`),
    enabled: !!id,
  });
}

export function useSendChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { conversationId?: string; message: string }) =>
      apiPost<ChatResponse>('/api/knowledge/chat', body),
    onSuccess: (res) => {
      qc.setQueryData<ChatConversationDetailDto>(['knowledge', 'conversation', res.conversation.id], (prev) => ({
        ...res.conversation,
        messages: [...(prev?.messages ?? []), res.userMessage, res.assistantMessage],
      }));
      void qc.invalidateQueries({ queryKey: ['knowledge', 'conversations'] });
    },
  });
}

export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete<{ ok: true }>(`/api/knowledge/conversations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knowledge', 'conversations'] }),
  });
}

export function useFileAnswer(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) =>
      api<ChatMessageDto>(`/api/knowledge/messages/${messageId}/file`, { method: 'POST' }),
    onSuccess: (msg) => {
      qc.setQueryData<ChatConversationDetailDto>(['knowledge', 'conversation', conversationId], (prev) =>
        prev ? { ...prev, messages: prev.messages.map((m) => (m.id === msg.id ? msg : m)) } : prev,
      );
      void qc.invalidateQueries({ queryKey: ['knowledge', 'pages'] });
    },
  });
}

export function useWikiGraph() {
  return useQuery({
    queryKey: ['knowledge', 'graph'],
    queryFn: () => apiGet<WikiGraphDto>('/api/knowledge/graph'),
  });
}

export function useIngestionProgress() {
  return useQuery({
    queryKey: ['ingestion-progress'],
    queryFn: () => apiGet<IngestionProgressDto>('/api/knowledge/ingest/progress'),
    // Fast while the worker runs; a slow heartbeat otherwise so nightly/background runs get noticed.
    refetchInterval: (q) => (q.state.data?.active ? 2000 : 15000),
    refetchIntervalInBackground: false,
  });
}
