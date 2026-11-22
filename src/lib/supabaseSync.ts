import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSavedCloudConfig } from './cloudConfig';

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

export function registerDbCacheInvalidator(fn: () => void): void {
  invalidateDbCallback = fn;
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

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSavedCloudConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return null;
  if (
    cachedClient &&
    cachedClientUrl === cfg.supabaseUrl &&
    cachedClientKey === cfg.supabaseAnonKey
  ) {
    return cachedClient;
  }
  try {
    cachedClientUrl = cfg.supabaseUrl;
    cachedClientKey = cfg.supabaseAnonKey;
    cachedClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: false },
    });
    return cachedClient;
  } catch {
    return null;
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
    version: 'v2.16.0',
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

function hasMeaningfulPayloadData(data: Partial<StallSyncPayload> | null | undefined): boolean {
  if (!data || typeof data !== 'object') return false;
  if (data.rawStorage && data.rawStorage.ht_static_db_v1) {
    const db = safeParseJson<{ orders?: unknown[]; users?: unknown[]; products?: unknown[] }>(
      data.rawStorage.ht_static_db_v1,
      {}
    );
    if (
      (Array.isArray(db.orders) && db.orders.length > 0) ||
      (Array.isArray(db.users) && db.users.length > 1) ||
      (Array.isArray(db.products) && db.products.length > 0)
    ) {
      return true;
    }
  }
  if (Array.isArray(data.orders) && data.orders.length > 0) return true;
  if (Array.isArray(data.customers) && data.customers.length > 0) return true;
  return false;
}

/**
 * Merges remoteht_static_db_v1 with local ht_static_db_v1 so that newly created customer orders
 * from any device are never lost while keeping remote updates authoritative.
 */
function mergeRemoteAndLocalMainDb(
  remoteRawDb: string | null | undefined,
  localRawDb: string | null | undefined,
  preferLocalOrders = false
): string | null {
  if (!remoteRawDb && !localRawDb) return null;
  if (!remoteRawDb) return localRawDb || null;
  if (!localRawDb) return remoteRawDb;

  try {
    const remoteDb = JSON.parse(remoteRawDb);
    const localDb = JSON.parse(localRawDb);
    if (!remoteDb || typeof remoteDb !== 'object') return localRawDb;
    if (!localDb || typeof localDb !== 'object') return remoteRawDb;

    // בסיס הוא הענן (או המקומי אם preferLocalOrders=true), בתוספת הזמנות/משתמשים שנוצרו במכשיר הנוכחי וטרם עלו
    const baseDb = preferLocalOrders ? localDb : remoteDb;
    const secondaryDb = preferLocalOrders ? remoteDb : localDb;

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

    const merged = {
      ...baseDb,
      orders: baseOrders,
      order_items: baseItems,
      users: baseUsers,
      nextIds: {
        ...(baseDb.nextIds || {}),
        users:
          Math.max(
            1,
            ...baseUsers.map((u) => Number(u.id) || 0)
          ) + 1,
        orders:
          Math.max(
            1,
            ...baseOrders.map((o) => Number(o.id) || 0)
          ) + 1,
        order_items:
          Math.max(
            1,
            ...baseItems.map((i) => Number(i.id) || 0)
          ) + 1,
      },
    };
    return JSON.stringify(merged);
  } catch {
    return remoteRawDb;
  }
}

function applyCloudPayloadToLocalStorage(
  remotePayload: StallSyncPayload,
  mergeLocalAdditions = false
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

/**
 * Immediately uploads the current localStorage state to `public.stall_sync` (`id = 'main_stall'`).
 */
export async function pushLocalStateToCloud(options?: {
  mergeWithRemoteFirst?: boolean;
}): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) {
    setSyncStatus({ state: 'offline', lastError: 'חסרים פרטי חיבור לענן' });
    return false;
  }

  setSyncStatus({ state: 'syncing', lastError: null });
  try {
    if (options?.mergeWithRemoteFirst) {
      const { data: existingRow } = await client
        .from('stall_sync')
        .select('id, data, updated_at')
        .eq('id', STALL_SYNC_ROW_ID)
        .maybeSingle();

      if (existingRow?.data && hasMeaningfulPayloadData(existingRow.data as StallSyncPayload)) {
        const remotePayload = existingRow.data as StallSyncPayload;
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
    const { error } = await client.from('stall_sync').upsert(
      {
        id: STALL_SYNC_ROW_ID,
        data: payload,
        updated_at: nowIso,
      },
      { onConflict: 'id' }
    );

    if (error) {
      throw new Error(error.message);
    }

    lastKnownRemoteUpdatedAt = nowIso;
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
      lastError: err instanceof Error ? err.message : 'שגיאת תקשורת עם הענן',
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
 * - If cloud row `main_stall` is empty and device has localStorage data -> uploads local data to cloud.
 * - If cloud row has newer data -> pulls it into localStorage and refreshes UI.
 */
export async function syncWithCloudOnStartupOrPoll(isManual = false): Promise<boolean> {
  if (isSyncInProgress && !isManual) return false;
  const client = getSupabaseClient();
  if (!client) {
    setSyncStatus({ state: 'offline', lastError: 'חסרים פרטי חיבור לענן' });
    return false;
  }

  isSyncInProgress = true;
  if (isManual || currentStatus.state !== 'synced') {
    setSyncStatus({ state: 'syncing', lastError: null });
  }

  try {
    const { data: row, error } = await client
      .from('stall_sync')
      .select('id, data, updated_at')
      .eq('id', STALL_SYNC_ROW_ID)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    const remotePayload = (row?.data || null) as StallSyncPayload | null;
    const remoteHasData = hasMeaningfulPayloadData(remotePayload);
    const localPayload = buildLocalSyncPayload();
    const localHasData = hasMeaningfulPayloadData(localPayload);

    // 1. העלאה ראשונית בטוחה (Migration): אם הענן ריק ובמכשיר קיימים נתונים
    if (!remoteHasData && localHasData) {
      const ok = await pushLocalStateToCloud();
      isSyncInProgress = false;
      return ok;
    }

    // 2. אם בענן קיימים נתונים
    if (remoteHasData && remotePayload) {
      const remoteUpdatedAt = String(row?.updated_at || remotePayload.updatedAt || '');
      const isNewerRemote =
        !lastKnownRemoteUpdatedAt ||
        remoteUpdatedAt > lastKnownRemoteUpdatedAt ||
        isManual;

      if (isNewerRemote) {
        const mutated = applyCloudPayloadToLocalStorage(remotePayload, false);
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
      setSyncStatus({
        state: 'synced',
        lastSyncedAt: lastKnownRemoteUpdatedAt || new Date().toISOString(),
        lastError: null,
      });
      isSyncInProgress = false;
      return true;
    }

    // אם גם הענן וגם המכשיר חדשים — העלה את ברירת המחדל לענן
    const ok = await pushLocalStateToCloud();
    isSyncInProgress = false;
    return ok;
  } catch (err) {
    isSyncInProgress = false;
    setSyncStatus({
      state: 'offline',
      lastError: err instanceof Error ? err.message : 'שגיאת חיבור לענן',
    });
    return false;
  }
}
