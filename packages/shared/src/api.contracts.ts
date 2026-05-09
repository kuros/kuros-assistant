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
