const CLOUD_CONFIG_KEY = 'ht_cloud_config_v1';

export const DEFAULT_SUPABASE_URL = 'https://qaahbvzytmxpuwrswxyr.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_ILWfBQ4CFCrVWtWGUYFHCA_gyx116n8';

export interface CloudConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  apiUrl: string;
}

export function getEnvCloudConfig(): CloudConfig {
  return {
    supabaseUrl:
      String(import.meta.env.VITE_SUPABASE_URL || '').trim() || DEFAULT_SUPABASE_URL,
    supabaseAnonKey:
      String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim() ||
      DEFAULT_SUPABASE_ANON_KEY,
    apiUrl: String(import.meta.env.VITE_API_URL || '')
      .trim()
      .replace(/\/$/, ''),
  };
}

export function getSavedCloudConfig(): CloudConfig {
  const env = getEnvCloudConfig();
  try {
    const raw = localStorage.getItem(CLOUD_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CloudConfig>;
      const url = String(parsed.supabaseUrl || '').trim() || env.supabaseUrl || DEFAULT_SUPABASE_URL;
      const key =
        String(parsed.supabaseAnonKey || '').trim() ||
        env.supabaseAnonKey ||
        DEFAULT_SUPABASE_ANON_KEY;
      const apiUrl = String(parsed.apiUrl ?? env.apiUrl)
        .trim()
        .replace(/\/$/, '');

      // אם הערכים ב-localStorage היו ריקים — נשמור אוטומטית את ברירת המחדל
      if (!parsed.supabaseUrl?.trim() || !parsed.supabaseAnonKey?.trim()) {
        localStorage.setItem(
          CLOUD_CONFIG_KEY,
          JSON.stringify({ supabaseUrl: url, supabaseAnonKey: key, apiUrl })
        );
      }
      return { supabaseUrl: url, supabaseAnonKey: key, apiUrl };
    } else {
      const initial: CloudConfig = {
        supabaseUrl: env.supabaseUrl || DEFAULT_SUPABASE_URL,
        supabaseAnonKey: env.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
        apiUrl: env.apiUrl || '',
      };
      localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(initial));
      return initial;
    }
  } catch {
    // Fallback cleanly if storage is restricted
  }
  return {
    supabaseUrl: env.supabaseUrl || DEFAULT_SUPABASE_URL,
    supabaseAnonKey: env.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY,
    apiUrl: env.apiUrl || '',
  };
}

export function saveCloudConfig(config: CloudConfig): void {
  try {
    localStorage.setItem(
      CLOUD_CONFIG_KEY,
      JSON.stringify({
        supabaseUrl: (config.supabaseUrl || '').trim() || DEFAULT_SUPABASE_URL,
        supabaseAnonKey: (config.supabaseAnonKey || '').trim() || DEFAULT_SUPABASE_ANON_KEY,
        apiUrl: (config.apiUrl || '').trim().replace(/\/$/, ''),
      })
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function clearCloudConfig(): void {
  try {
    localStorage.removeItem(CLOUD_CONFIG_KEY);
  } catch {}
}

export function hasCloudCredentials(): boolean {
  const cfg = getSavedCloudConfig();
  return Boolean(cfg.apiUrl || (cfg.supabaseUrl && cfg.supabaseAnonKey));
}

export function isLocalStorageFallbackMode(): boolean {
  if (typeof window === 'undefined') return false;
  const cfg = getSavedCloudConfig();
  if (cfg.apiUrl) return false;
  return (
    window.location.hostname.endsWith('github.io') ||
    !window.location.hostname.includes('localhost')
  );
}
