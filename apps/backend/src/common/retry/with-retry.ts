export interface RetryOpts {
  maxAttempts?: number;
  baseDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

function extractRetryAfterMs(err: unknown): number | null {
  const headers =
    (err as { response?: { headers?: Record<string, string> } })?.response?.headers ?? {};
  const raw = headers['retry-after'];
  if (!raw) return null;
  const seconds = Number(raw);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === max) break;
      if (opts.isRetryable && !opts.isRetryable(err)) break;
      const retryAfterMs = extractRetryAfterMs(err);
      const delay = retryAfterMs ?? base * Math.pow(2, attempt - 1);
      opts.onRetry?.(err, attempt, delay);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}

const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504, 529]);

export function isRetryableHttp(err: unknown): boolean {
  const status = (err as { status?: number; response?: { status?: number } })?.status
    ?? (err as { response?: { status?: number } })?.response?.status;
  if (status != null) return RETRYABLE_HTTP.has(status);
  const code = (err as { code?: string })?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT';
}
