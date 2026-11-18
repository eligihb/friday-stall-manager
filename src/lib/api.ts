import { localApiFetch } from './localApi';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '';

function isStaticHosting(): boolean {
  if (API_BASE) return false;
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io');
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (isStaticHosting()) {
    try {
      return await localApiFetch<T>(url, options);
    } catch (err) {
      const e = err as Error & { status?: number };
      throw new ApiError(e.message || 'אירעה שגיאה', e.status || 400);
    }
  }

  const targetUrl = API_BASE ? `${API_BASE}${url}` : url;
  const res = await fetch(targetUrl, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // Fallback gracefully if hosted on static host without API backend
  const contentType = res.headers.get('content-type') || '';
  if (res.status === 404 && !contentType.includes('application/json')) {
    return localApiFetch<T>(url, options);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data?.error || 'אירעה שגיאה בתקשורת עם השרת', res.status);
  }
  return data as T;
}
