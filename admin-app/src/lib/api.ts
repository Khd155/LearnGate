import type { Session } from '../types';

// In production the app is served from the same origin under /admin/, so a
// relative '' base just works. For local `vite dev`/testing we point at the
// live production API directly via VITE_API_BASE (no local backend exists).
const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let getToken: () => string | null = () => null;
let onUnauthorized: () => void = () => {};

export function configureApi(opts: {
  getToken: () => string | null;
  onUnauthorized: () => void;
}) {
  getToken = opts.getToken;
  onUnauthorized = opts.onUnauthorized;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      ...options,
      mode: 'cors',
      headers,
    });
  } catch {
    throw new ApiError('تعذّر الاتصال بالخادم — تحقق من الإنترنت', 0);
  }

  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : null) || `خطأ غير متوقع (${res.status})`;
    if (res.status === 401) onUnauthorized();
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem('lg_xsession');
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s?.token || !s?.expiry) return null;
    if (Date.now() >= s.expiry) {
      localStorage.removeItem('lg_xsession');
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem('lg_xsession');
    sessionStorage.removeItem('lg_session');
  } catch {
    /* noop */
  }
}
