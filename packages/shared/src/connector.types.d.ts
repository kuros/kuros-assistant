import { z } from 'zod';
export type ConnectorKind = 'slack' | 'outlook';
export type ConnectorStatus = 'active' | 'paused' | 'error';
export declare const SlackConnectorConfigSchema: z.ZodObject<{
    botToken: z.ZodString;
    appToken: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    teamId: z.ZodString;
    channelIds: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    botToken: string;
    teamId: string;
    channelIds: string[];
    appToken?: string | undefined;
}, {
    botToken: string;
    teamId: string;
    channelIds: string[];
    appToken?: string | undefined;
}>;
export declare const OutlookConnectorConfigSchema: z.ZodObject<{
    tenantId: z.ZodString;
    clientId: z.ZodString;
    cachedTokenFilePath: z.ZodString;
    monitoredAddresses: z.ZodArray<z.ZodString, "many">;
    teamLabels: z.ZodRecord<z.ZodString, z.ZodString>;
    folderId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    tenantId: string;
    clientId: string;
    cachedTokenFilePath: string;
    monitoredAddresses: string[];
    teamLabels: Record<string, string>;
    folderId: string;
}, {
    tenantId: string;
    clientId: string;
    cachedTokenFilePath: string;
    monitoredAddresses: string[];
    teamLabels: Record<string, string>;
    folderId: string;
}>;
export type SlackConnectorConfig = z.infer<typeof SlackConnectorConfigSchema>;
export type OutlookConnectorConfig = z.infer<typeof OutlookConnectorConfigSchema>;
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
