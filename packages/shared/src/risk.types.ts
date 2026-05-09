export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'open' | 'mitigated' | 'accepted' | 'closed';

export interface RiskDto {
  id: string;
  sourceSummaryId: string | null;
  title: string;
  detail: string | null;
  severity: RiskSeverity;
  status: RiskStatus;
  filePath: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RisksQuery {
  status?: RiskStatus | RiskStatus[];
  severity?: RiskSeverity | RiskSeverity[];
  from?: string;
  to?: string;
}

export interface UpdateRiskRequest {
  status?: RiskStatus;
  severity?: RiskSeverity;
}
