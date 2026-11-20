// API client. VITE_API_URL = Render backend URL in production; empty locally (Vite proxies /api).
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api';
const TOKEN_KEY = 'vendly.token';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  status: number;
  code?: string;
  data: any;
  constructor(status: number, message: string, code?: string, data?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

type Opts = { method?: string; body?: unknown; query?: Record<string, string | number | boolean | undefined | null>; signal?: AbortSignal };

function url(path: string, query?: Opts['query']) {
  const qs = query
    ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : '';
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const t = tokenStore.get();
  if (t) headers.Authorization = `Bearer ${t}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url(path, opts.query), {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.', 'network');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && t && path !== '/auth/signin') {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new ApiError(res.status, data.error ?? 'Something went wrong', data.code, data);
  }
  return data as T;
}

export const get = <T = any>(path: string, query?: Opts['query']) => api<T>(path, { query });
export const post = <T = any>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body });
export const put = <T = any>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body });
export const del = <T = any>(path: string) => api<T>(path, { method: 'DELETE' });

/** Download a file (Excel export) with the auth header */
export async function download(path: string, query: Opts['query'], filename: string) {
  const res = await fetch(url(path, query), { headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` } });
  if (!res.ok) throw new ApiError(res.status, 'Export failed');
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
