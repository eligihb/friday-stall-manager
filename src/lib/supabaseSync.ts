import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_URL,
  getSavedCloudConfig,
} from './cloudConfig';

export const STALL_SYNC_ROW_ID = 'main_stall';
const LOCAL_UPDATED_AT_KEY = 'fsm_local_updated_at_v1';
const LAST_CLOUD_SYNC_AT_KEY = 'fsm_last_cloud_sync_at_v1';

const SYNCED_STORAGE_KEYS = [
  'ht_static_db_v1',
  'fsm_cash_register_v1',
  'fsm_waste_config_v1',
  'fsm_storefront_config_v1',
  'fsm_product_stock_v1',
  'fsm_imported_orders_backup_v1',
  'fsm_user_active_map',
  'fsm_business_settings_extra',
  'friday_stall_backups',
] as const;

export type CloudSyncState = 'synced' | 'syncing' | 'offline';

export interface CloudSyncStatusSnapshot {
  state: CloudSyncState;
  lastSyncedAt: string | null;
  lastError: string | null;
}

type StatusListener = (snapshot: CloudSyncStatusSnapshot) => void;
type DataUpdatedListener = () => void;

let currentStatus: CloudSyncStatusSnapshot = {
  state: 'syncing',
  lastSyncedAt: (() => {
    try {
      return localStorage.getItem(LAST_CLOUD_SYNC_AT_KEY);
    } catch {
      return null;
    }
  })(),
  lastError: null,
};

const statusListeners = new Set<StatusListener>();
const dataUpdatedListeners = new Set<DataUpdatedListener>();
let invalidateDbCallback: (() => void) | null = null;
let ensureLocalDbInitializedCallback: (() => void) | null = null;

export function registerDbCacheInvalidator(
  invalidateFn: () => void,
  ensureInitFn?: () => void
): void {
  invalidateDbCallback = invalidateFn;
  if (ensureInitFn) ensureLocalDbInitializedCallback = ensureInitFn;
}

function setSyncStatus(patch: Partial<CloudSyncStatusSnapshot>): void {
  currentStatus = { ...currentStatus, ...patch };
  for (const listener of statusListeners) {
    try {
      listener(currentStatus);
    } catch {
      // ignore
    }
  }
}

export function getCloudSyncStatus(): CloudSyncStatusSnapshot {
  return currentStatus;
}

export function subscribeCloudSyncStatus(listener: StatusListener): () => void {
  statusListeners.add(listener);
  listener(currentStatus);
  return () => {
    statusListeners.delete(listener);
  };
}

export function subscribeCloudDataUpdated(listener: DataUpdatedListener): () => void {
  dataUpdatedListeners.add(listener);
  return () => {
    dataUpdatedListeners.delete(listener);
  };
}

function notifyCloudDataUpdated(): void {
  if (invalidateDbCallback) {
    try {
      invalidateDbCallback();
    } catch {
      // ignore
    }
  }
  for (const listener of dataUpdatedListeners) {
    try {
      listener();
    } catch {
      // ignore
    }
  }
}

let cachedClientUrl = '';
let cachedClientKey = '';
let cachedClient: SupabaseClient | null = null;

export function getActiveSupabaseCredentials(): { url: string; key: string } {
  const cfg = getSavedCloudConfig();
  const url = (cfg.supabaseUrl || '').trim() || DEFAULT_SUPABASE_URL;
  const key = (cfg.supabaseAnonKey || '').trim() || DEFAULT_SUPABASE_ANON_KEY;
  return { url, key };
}

export function getSupabaseClient(): SupabaseClient {
  const { url, key } = getActiveSupabaseCredentials();
  if (cachedClient && cachedClientUrl === url && cachedClientKey === key) {
    return cachedClient;
  }
  cachedClientUrl = url;
  cachedClientKey = key;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function formatSupabaseError(err: unknown): string {
  if (!err) return 'שגיאה לא ידועה בחיבור ל-Supabase';
  if (typeof err === 'string') return err;
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
    error_description?: string;
  };
  const parts = [
    e.code ? `[${e.code}]` : '',
    e.message || e.error_description || 'שגיאת Supabase',
    e.details ? `(${e.details})` : '',
    e.hint ? `רמז: ${e.hint}` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * Fetches row `id = 'main_stall'` from `public.stall_sync` using `@supabase/supabase-js`
 * with automatic fallback to PostgREST `apikey` header for `sb_publishable_...` keys.
 */
async function fetchRemoteStallSyncRow(): Promise<{
  id: string;
  data: StallSyncPayload | null;
  updated_at?: string;
} | null> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('stall_sync')
    .select('id, data, updated_at')
    .eq('id', STALL_SYNC_ROW_ID)
    .maybeSingle();

  if (!error) {
    return (data as { id: string; data: StallSyncPayload | null; updated_at?: string } | null) || null;
  }

  // Fallback: קריאת REST ישירה עם apikey בלבד (עבור מפתחות sb_publishable_ חדשים)
  const { url, key } = getActiveSupabaseCredentials();
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/stall_sync?id=eq.${encodeURIComponent(
    STALL_SYNC_ROW_ID
  )}&select=id,data,updated_at`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      apikey: key,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody ? formatSupabaseError(errBody) : `${formatSupabaseError(error)} (HTTP ${res.status})`
    );
  }

  const rows = (await res.json()) as Array<{
    id: string;
    data: StallSyncPayload | null;
    updated_at?: string;
  }>;
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Upserts row `id = 'main_stall'` into `public.stall_sync` using `@supabase/supabase-js`
 * with automatic fallback to PostgREST `apikey` header for `sb_publishable_...` keys.
 */
async function upsertRemoteStallSyncRow(
  payload: StallSyncPayload,
  nowIso: string
): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from('stall_sync').upsert(
    {
      id: STALL_SYNC_ROW_ID,
      data: payload,
      updated_at: nowIso,
    },
    { onConflict: 'id' }
  );

  if (!error) return;

  // Fallback: שליחת REST upsert ישירה עם apikey בלבד
  const { url, key } = getActiveSupabaseCredentials();
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/stall_sync?on_conflict=id`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      id: STALL_SYNC_ROW_ID,
      data: payload,
      updated_at: nowIso,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody ? formatSupabaseError(errBody) : `${formatSupabaseError(error)} (HTTP ${res.status})`
    );
  }
}

function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export interface StallSyncPayload {
  version: string;
  updatedAt: string;
  rawStorage: Record<string, string | null>;
  orders: unknown[];
  customers: unknown[];
  suppliers: unknown[];
  products: unknown[];
  cashRegister: unknown;
  waste: unknown;
  expenses: unknown;
  settings: unknown;
  backups: unknown[];
}

export function buildLocalSyncPayload(): StallSyncPayload {
  if (ensureLocalDbInitializedCallback) {
    try {
      ensureLocalDbInitializedCallback();
    } catch {
      // ignore
    }
  }

  const rawStorage: Record<string, string | null> = {};
  for (const k of SYNCED_STORAGE_KEYS) {
    try {
      rawStorage[k] = localStorage.getItem(k);
    } catch {
      rawStorage[k] = null;
    }
  }

  const mainDb = safeParseJson<{
    orders?: unknown[];
    users?: Array<{ role?: string }>;
    products?: unknown[];
    waste_logs?: unknown[];
    transactions?: unknown[];
    fixed_expenses?: unknown[];
    settings?: unknown;
  }>(rawStorage.ht_static_db_v1, {});

  const users = Array.isArray(mainDb.users) ? mainDb.users : [];
  const nowIso = new Date().toISOString();

  return {
    version: 'v2.16.1',
    updatedAt: nowIso,
    rawStorage,
    orders: Array.isArray(mainDb.orders) ? mainDb.orders : [],
    customers: users.filter((u) => u.role === 'customer'),
    suppliers: users.filter((u) => u.role === 'supplier'),
    products: Array.isArray(mainDb.products) ? mainDb.products : [],
    cashRegister: safeParseJson(rawStorage.fsm_cash_register_v1, {}),
    waste: {
      wasteLogs: Array.isArray(mainDb.waste_logs) ? mainDb.waste_logs : [],
      wasteConfigs: safeParseJson(rawStorage.fsm_waste_config_v1, {}),
    },
    expenses: {
      transactions: Array.isArray(mainDb.transactions) ? mainDb.transactions : [],
      fixedExpenses: Array.isArray(mainDb.fixed_expenses) ? mainDb.fixed_expenses : [],
    },
    settings: mainDb.settings || {},
    backups: safeParseJson(rawStorage.friday_stall_backups, []),
  };
}

function hasRemotePayloadContent(data: Partial<StallSyncPayload> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  if (data.rawStorage && data.rawStorage.ht_static_db_v1) return true;
  if (Array.isArray(data.orders) && data.orders.length > 0) return true;
  if (Array.isArray(data.customers) && data.customers.length > 0) return true;
  return false;
}

/**
 * Merges remote ht_static_db_v1 with local ht_static_db_v1 so that all orders, customers,
 * suppliers, and transactions from both localStorage and Supabase are preserved without loss.
 */
function mergeRemoteAndLocalMainDb(
  remoteRawDb: string | null | undefined,
  localRawDb: string | null | undefined,
  preferLocalBase = false
): string | null {
  if (!remoteRawDb && !localRawDb) return null;
  if (!remoteRawDb) return localRawDb || null;
  if (!localRawDb) return remoteRawDb;

  try {
    const remoteDb = JSON.parse(remoteRawDb);
    const localDb = JSON.parse(localRawDb);
    if (!remoteDb || typeof remoteDb !== 'object') return localRawDb;
    if (!localDb || typeof localDb !== 'object') return remoteRawDb;

    const baseDb = preferLocalBase ? localDb : remoteDb;
    const secondaryDb = preferLocalBase ? remoteDb : localDb;

    const baseOrders: Array<{ id: number }> = Array.isArray(baseDb.orders) ? [...baseDb.orders] : [];
    const baseOrderIds = new Set(baseOrders.map((o) => String(o.id)));
    const secOrders: Array<{ id: number }> = Array.isArray(secondaryDb.orders)
      ? secondaryDb.orders
      : [];

    const baseItems: Array<{ id: number; order_id: number }> = Array.isArray(baseDb.order_items)
      ? [...baseDb.order_items]
      : [];
    const secItems: Array<{ id: number; order_id: number }> = Array.isArray(
      secondaryDb.order_items
    )
      ? secondaryDb.order_items
      : [];

    for (const ord of secOrders) {
      if (!baseOrderIds.has(String(ord.id))) {
        baseOrders.push(ord);
        baseOrderIds.add(String(ord.id));
        for (const it of secItems) {
          if (String(it.order_id) === String(ord.id)) {
            baseItems.push(it);
          }
        }
      }
    }

    const baseUsers: Array<{ id: number; phone?: string }> = Array.isArray(baseDb.users)
      ? [...baseDb.users]
      : [];
    const baseUserIds = new Set(baseUsers.map((u) => String(u.id)));
    const secUsers: Array<{ id: number; phone?: string }> = Array.isArray(secondaryDb.users)
      ? secondaryDb.users
      : [];
    for (const u of secUsers) {
      if (!baseUserIds.has(String(u.id))) {
        baseUsers.push(u);
        baseUserIds.add(String(u.id));
      }
    }

    const baseTx: Array<{ id: number }> = Array.isArray(baseDb.transactions)
      ? [...baseDb.transactions]
      : [];
    const baseTxIds = new Set(baseTx.map((t) => String(t.id)));
    const secTx: Array<{ id: number }> = Array.isArray(secondaryDb.transactions)
      ? secondaryDb.transactions
      : [];
    for (const t of secTx) {
      if (!baseTxIds.has(String(t.id))) {
        baseTx.push(t);
        baseTxIds.add(String(t.id));
      }
    }

    const merged = {
      ...baseDb,
      orders: baseOrders,
      order_items: baseItems,
      users: baseUsers,
      transactions: baseTx,
      nextIds: {
        ...(baseDb.nextIds || {}),
        users: Math.max(1, ...baseUsers.map((u) => Number(u.id) || 0)) + 1,
        orders: Math.max(1, ...baseOrders.map((o) => Number(o.id) || 0)) + 1,
        order_items: Math.max(1, ...baseItems.map((i) => Number(i.id) || 0)) + 1,
        transactions: Math.max(1, ...baseTx.map((t) => Number(t.id) || 0)) + 1,
      },
    };
    return JSON.stringify(merged);
  } catch {
    return remoteRawDb;
  }
}

function applyCloudPayloadToLocalStorage(
  remotePayload: StallSyncPayload,
  mergeLocalAdditions = true
): boolean {
  const remoteMap = remotePayload.rawStorage;
  if (!remoteMap || typeof remoteMap !== 'object') return false;
  let changed = false;

  for (const key of SYNCED_STORAGE_KEYS) {
    const incomingVal = remoteMap[key];
    if (incomingVal === undefined || incomingVal === null) continue;
    try {
      const currentVal = localStorage.getItem(key);
      const finalVal =
        key === 'ht_static_db_v1' && mergeLocalAdditions
          ? mergeRemoteAndLocalMainDb(incomingVal, currentVal, false) || incomingVal
          : incomingVal;
      if (currentVal !== finalVal) {
        localStorage.setItem(key, finalVal);
        changed = true;
      }
    } catch {
      // ignore
    }
  }
  return changed;
}

let pushTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isSyncInProgress = false;
let lastKnownRemoteUpdatedAt = '';
let initialUpsertCompleted = false;

/**
 * Immediately uploads the current localStorage state to `public.stall_sync` (`id = 'main_stall'`).
 */
export async function pushLocalStateToCloud(options?: {
  mergeWithRemoteFirst?: boolean;
}): Promise<boolean> {
  setSyncStatus({ state: 'syncing', lastError: null });
  try {
    if (options?.mergeWithRemoteFirst) {
      const existingRow = await fetchRemoteStallSyncRow().catch(() => null);
      if (existingRow?.data && hasRemotePayloadContent(existingRow.data)) {
        const remotePayload = existingRow.data;
        const localDbRaw = localStorage.getItem('ht_static_db_v1');
        const remoteDbRaw = remotePayload.rawStorage?.ht_static_db_v1;
        const mergedDb = mergeRemoteAndLocalMainDb(remoteDbRaw, localDbRaw, true);
        if (mergedDb) {
          localStorage.setItem('ht_static_db_v1', mergedDb);
          if (invalidateDbCallback) invalidateDbCallback();
        }
      }
    }

    const payload = buildLocalSyncPayload();
    const nowIso = new Date().toISOString();
    await upsertRemoteStallSyncRow(payload, nowIso);

    lastKnownRemoteUpdatedAt = nowIso;
    initialUpsertCompleted = true;
    try {
      localStorage.setItem(LAST_CLOUD_SYNC_AT_KEY, nowIso);
      localStorage.setItem(LOCAL_UPDATED_AT_KEY, nowIso);
    } catch {
      // ignore
    }
    setSyncStatus({ state: 'synced', lastSyncedAt: nowIso, lastError: null });
    return true;
  } catch (err) {
    setSyncStatus({
      state: 'offline',
      lastError: formatSupabaseError(err),
    });
    return false;
  }
}

/**
 * Schedules a debounced background push to Supabase whenever local data changes.
 */
export function scheduleCloudPush(immediate = false): void {
  try {
    localStorage.setItem(LOCAL_UPDATED_AT_KEY, new Date().toISOString());
  } catch {
    // ignore
  }
  if (pushTimeoutId) {
    clearTimeout(pushTimeoutId);
    pushTimeoutId = null;
  }
  if (immediate) {
    void pushLocalStateToCloud({ mergeWithRemoteFirst: true });
    return;
  }
  setSyncStatus({ state: 'syncing' });
  pushTimeoutId = setTimeout(() => {
    pushTimeoutId = null;
    void pushLocalStateToCloud();
  }, 450);
}

/**
 * Startup & periodic Cloud Sync + Safe Initial Migration:
 * - Connects automatically using default Supabase URL & Key if localStorage is empty.
 * - Merges existing localStorage data with cloud row `id = 'main_stall'` and immediately upserts
 *   all local data to `public.stall_sync` on startup so nothing is ever lost.
 * - Updates the top badge to `☁️ מסונכרן לענן` on success, or records the exact Supabase error on failure.
 */
export async function syncWithCloudOnStartupOrPoll(isManual = false): Promise<boolean> {
  if (isSyncInProgress && !isManual) return false;
  isSyncInProgress = true;

  if (isManual || currentStatus.state !== 'synced') {
    setSyncStatus({ state: 'syncing', lastError: null });
  }

  try {
    const row = await fetchRemoteStallSyncRow();
    const remotePayload = row?.data || null;
    const remoteHasData = hasRemotePayloadContent(remotePayload);

    // אם בענן כבר קיימים נתונים — נמזג אותם עם הנתונים המקומיים כך ששום הזמנה מקומית או מהענן לא תאבד
    if (remoteHasData && remotePayload) {
      const remoteUpdatedAt = String(row?.updated_at || remotePayload.updatedAt || '');
      const isNewerRemote =
        !lastKnownRemoteUpdatedAt ||
        remoteUpdatedAt > lastKnownRemoteUpdatedAt ||
        isManual;

      if (isNewerRemote) {
        const mutated = applyCloudPayloadToLocalStorage(remotePayload, true);
        lastKnownRemoteUpdatedAt = remoteUpdatedAt || new Date().toISOString();
        try {
          localStorage.setItem(LAST_CLOUD_SYNC_AT_KEY, lastKnownRemoteUpdatedAt);
        } catch {
          // ignore
        }
        if (mutated) {
          notifyCloudDataUpdated();
        }
      }
    }

    // בעליית האפליקציה הראשונית, בלחיצה על "סנכרן עכשיו", או אם הענן היה ריק:
    // מבצעים מיד upsert של כל הנתונים הקיימים ב-localStorage לשורה id = 'main_stall' בטבלת public.stall_sync!
    if (!initialUpsertCompleted || !remoteHasData || isManual) {
      const payload = buildLocalSyncPayload();
      const nowIso = new Date().toISOString();
      await upsertRemoteStallSyncRow(payload, nowIso);
      lastKnownRemoteUpdatedAt = nowIso;
      initialUpsertCompleted = true;
      try {
        localStorage.setItem(LAST_CLOUD_SYNC_AT_KEY, nowIso);
      } catch {
        // ignore
      }
    }

    setSyncStatus({
      state: 'synced',
      lastSyncedAt: lastKnownRemoteUpdatedAt || new Date().toISOString(),
      lastError: null,
    });
    isSyncInProgress = false;
    return true;
  } catch (err) {
    isSyncInProgress = false;
    setSyncStatus({
      state: 'offline',
      lastError: formatSupabaseError(err),
    });
    return false;
  }
}
