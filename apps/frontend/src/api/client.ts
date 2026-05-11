const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3000';

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: ApiOptions['query']): string {
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, BASE_URL + '/');
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.append(k, String(v));
    }
  }
  return url.toString();
}

export const apiGet = <T>(path: string, query?: ApiOptions['query']) =>
  api<T>(path, { query });
export const apiPost = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body });
export const apiPatch = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body });
export const apiDelete = <T>(path: string) =>
  api<T>(path, { method: 'DELETE' });

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text();
    }
    throw new Error(`API ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
