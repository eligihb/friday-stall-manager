import { localApiFetch } from './localApi';
import { getSavedCloudConfig } from './cloudConfig';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function shouldUseStaticFallback(): boolean {
  const cfg = getSavedCloudConfig();
  if (cfg.apiUrl) return false;
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io');
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  if (shouldUseStaticFallback()) {
    try {
      return await localApiFetch<T>(url, options);
    } catch (err) {
      const e = err as Error & { status?: number };
      throw new ApiError(e.message || 'אירעה שגיאה', e.status || 400);
    }
  }

  const cfg = getSavedCloudConfig();
  const targetUrl = cfg.apiUrl ? `${cfg.apiUrl}${url}` : url;

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch {
    // אם אין שרת זמין בסביבה הסטטית, עוברים אוטומטית לשמירה מקומית ללא קריסה
    return localApiFetch<T>(url, options);
  }

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
