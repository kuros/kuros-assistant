import type { ConnectorKind } from '@kuros/shared';

export interface RawItem {
  id: string;
  timestamp: Date;
  author?: { id: string; name?: string; email?: string };
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  items: RawItem[];
  newCursor?: string;
}

export interface SummaryResult {
  filePath: string;
  itemCount: number;
  modelUsed: string;
}

export interface ConnectorTestResult {
  ok: boolean;
  message?: string;
  deviceCode?: {
    userCode: string;
    verificationUri: string;
    expiresAt: string;
  };
}

export abstract class Connector {
  abstract readonly kind: ConnectorKind;

  abstract validateConfig(cfg: unknown): Promise<void>;

  abstract test(connectorId: string): Promise<ConnectorTestResult>;

  abstract syncTarget(args: {
    connectorId: string;
    targetId: string;
    sinceCursor: string | null;
  }): Promise<SyncResult>;

  abstract listTargets(connectorId: string): Promise<string[]>;

  abstract labelForTarget(connectorId: string, targetId: string): Promise<string>;
}
