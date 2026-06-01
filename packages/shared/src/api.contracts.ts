export interface HealthResponse {
  ok: true;
  version: string;
  uptimeSec: number;
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

export interface MeDto {
  id: string;
  email: string | null;
  timezone: string | null;
  name: string | null;
  onboarded: boolean;
}

export interface UpdateMeRequest {
  email?: string;
  timezone?: string;
  name?: string;
}

export type AiProvider = 'api' | 'claude_code';
export type ClaudeEffort = 'low' | 'medium' | 'high';

export interface UserSettingsDto {
  hasAnthropicKey: boolean;
  claudeModelFast: string;
  claudeModelDeep: string;
  claudeEffortFast: ClaudeEffort;
  claudeEffortDeep: ClaudeEffort;
  aiProvider: AiProvider;
}

export interface UpdateUserSettingsRequest {
  anthropicApiKey?: string;
  claudeModelFast?: string;
  claudeModelDeep?: string;
  claudeEffortFast?: ClaudeEffort;
  claudeEffortDeep?: ClaudeEffort;
  aiProvider?: AiProvider;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

