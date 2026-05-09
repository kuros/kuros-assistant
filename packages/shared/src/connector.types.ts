export type ConnectorKind = 'slack' | 'outlook';
export type ConnectorStatus = 'active' | 'paused' | 'error';

export interface SlackConnectorConfig {
  botToken: string;
  appToken: string;
  teamId: string;
  channelIds: string[];
}

export interface OutlookConnectorConfig {
  tenantId: string;
  clientId: string;
  cachedTokenFilePath: string;
  monitoredAddresses: string[];
  teamLabels: Record<string, string>;
}

export type ConnectorConfig = SlackConnectorConfig | OutlookConnectorConfig;

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
