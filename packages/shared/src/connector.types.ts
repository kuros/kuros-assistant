import { z } from 'zod';

export type ConnectorKind = 'slack' | 'outlook' | 'outlook-personal' | 'jira';
export type ConnectorStatus = 'active' | 'paused' | 'error';

// ---- Zod schemas (shared so FE forms and BE validateConfig use the same schema) ----

export const SlackConnectorConfigSchema = z
  .object({
    token: z.string().regex(/^xox[bp]-/, 'must be a bot token (xoxb-) or user token (xoxp-)'),
    teamId: z.string().regex(/^T[A-Z0-9]+$/, 'expected Slack team id like T01234'),
    channelIds: z.array(z.string().regex(/^[CG][A-Z0-9]+$/)).min(1, 'select at least one channel'),
  })
  .strict();

export const OutlookConnectorConfigSchema = z
  .object({
    tenantId: z.string().min(1),
    clientId: z.string().uuid(),
    cachedTokenFilePath: z.string().min(1),
    monitoredAddresses: z.array(z.string().email()).min(1),
    teamLabels: z.record(z.string().email(), z.string().min(1).max(120)),
    folderId: z.string().min(1),
  })
  .strict();

export const OutlookPersonalConnectorConfigSchema = z
  .object({
    clientId: z.string().uuid(),
    emailAddress: z.string().email(),
    startDate: z.string().optional(),
  })
  .strict();

export const JiraConnectorConfigSchema = z
  .object({
    baseUrl: z.string().url(),
    email: z.string().email(),
    apiToken: z.string().min(1),
    projectKeys: z.array(z.string().min(1)).min(1, 'select at least one project'),
  })
  .strict();

// ---- TypeScript types (inferred from schemas for single source of truth) ----

export type SlackConnectorConfig = z.infer<typeof SlackConnectorConfigSchema>;
export type OutlookConnectorConfig = z.infer<typeof OutlookConnectorConfigSchema>;
export type OutlookPersonalConnectorConfig = z.infer<typeof OutlookPersonalConnectorConfigSchema>;
export type JiraConnectorConfig = z.infer<typeof JiraConnectorConfigSchema>;
export type ConnectorConfig = SlackConnectorConfig | OutlookConnectorConfig | OutlookPersonalConnectorConfig | JiraConnectorConfig;

// ---- API shapes ----

export interface ConnectorDto {
  id: string;
  kind: ConnectorKind;
  name: string;
  status: ConnectorStatus;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  config: Partial<ConnectorConfig>;
}

export interface CreateConnectorRequest {
  kind: ConnectorKind;
  name: string;
  config: ConnectorConfig;
}

export interface UpdateConnectorRequest {
  name?: string;
  status?: ConnectorStatus;
  config?: Partial<ConnectorConfig>;
}

export interface TestConnectorResponse {
  ok: boolean;
  message?: string;
  deviceCode?: {
    userCode: string;
    verificationUri: string;
    expiresAt: string;
  };
}

export interface SyncConnectorRequest {
  targetId?: string;
}

export interface SyncConnectorResponse {
  queued: number;
}
