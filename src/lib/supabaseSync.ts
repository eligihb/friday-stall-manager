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
  state: 'offline',
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

export function registerDbCacheInvalidator(invalidateFn: () => void): void {
  invalidateDbCallback = invalidateFn;
}

function setSyncStatus(patch: Partial<CloudSyncStatusSnapshot>): void {
  const next: CloudSyncStatusSnapshot = { ...currentStatus, ...patch };
  if (
    next.state === currentStatus.state &&
    next.lastSyncedAt === currentStatus.lastSyncedAt &&
    next.lastError === currentStatus.lastError
  ) {
    return;
  }
  currentStatus = next;
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

export function getActiveSupabaseCredentials(): { url: string; key: string } {
  const cfg = getSavedCloudConfig();
  const url = (cfg.supabaseUrl || '').trim() || DEFAULT_SUPABASE_URL;
  const key = (cfg.supabaseAnonKey || '').trim() || DEFAULT_SUPABASE_ANON_KEY;
  return { url: url.replace(/\/$/, ''), key };
}

function getSupabaseHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=representation',
  };
}

function formatSupabaseError(err: unknown): string {
  if (!err) return 'שגיאה לא ידועה בחיבור ל-Supabase';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  const e = err as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
    error?: string;
    error_description?: string;
  };
  const parts = [
    e.code ? `[${e.code}]` : '',
    e.message || e.error_description || e.error || 'שגיאת Supabase',
    e.details ? `(${e.details})` : '',
    e.hint ? `רמז: ${e.hint}` : '',
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * Direct GET /rest/v1/stall_sync?id=eq.main_stall&select=*
 */
async function fetchRemoteStallSyncRow(): Promise<{
  id: string;
  data: StallSyncPayload | null;
  updated_at?: string;
} | null> {
  const { url, key } = getActiveSupabaseCredentials();
  const endpoint = `${url}/rest/v1/stall_sync?id=eq.${encodeURIComponent(
    STALL_SYNC_ROW_ID
  )}&select=*`;

  const res = await fetch(endpoint, {
    method: 'GET',
    headers: getSupabaseHeaders(key),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody ? formatSupabaseError(errBody) : `HTTP ${res.status}: ${res.statusText}`
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
 * Direct POST /rest/v1/stall_sync (Upsert with Prefer: resolution=merge-duplicates,return=representation)
 */
async function upsertRemoteStallSyncRow(
  allAppData: StallSyncPayload,
  nowIso: string
): Promise<void> {
  const { url, key } = getActiveSupabaseCredentials();
  const endpoint = `${url}/rest/v1/stall_sync`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: getSupabaseHeaders(key),
    body: JSON.stringify({
      id: STALL_SYNC_ROW_ID,
      data: allAppData,
      updated_at: nowIso,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(
      errBody ? formatSupabaseError(errBody) : `HTTP ${res.status}: ${res.statusText}`
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

function computeStorageFingerprint(rawStorage: Record<string, string | null>): string {
  return SYNCED_STORAGE_KEYS.map((k) => `${k}:${rawStorage[k] || ''}`).join('||');
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
    version: 'v2.16.3',
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

function hasLocalDataToUpload(payload: StallSyncPayload): boolean {
  if (payload.rawStorage && payload.rawStorage.ht_static_db_v1) return true;
  if (Array.isArray(payload.orders) && payload.orders.length > 0) return true;
  if (Array.isArray(payload.customers) && payload.customers.length > 0) return true;
  return false;
}

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

    const baseNotices: Array<{ id: number }> = Array.isArray(baseDb.deleted_order_notices)
      ? [...baseDb.deleted_order_notices]
      : [];
    const baseNoticeIds = new Set(baseNotices.map((n) => String(n.id)));
    const secNotices: Array<{ id: number }> = Array.isArray(secondaryDb.deleted_order_notices)
      ? secondaryDb.deleted_order_notices
      : [];
    for (const n of secNotices) {
      if (!baseNoticeIds.has(String(n.id))) {
        baseNotices.push(n);
        baseNoticeIds.add(String(n.id));
      }
    }

    const merged = {
      ...baseDb,
      orders: baseOrders,
      order_items: baseItems,
      users: baseUsers,
      transactions: baseTx,
      deleted_order_notices: baseNotices,
      nextIds: {
        ...(baseDb.nextIds || {}),
        users: Math.max(1, ...baseUsers.map((u) => Number(u.id) || 0)) + 1,
        orders:
          Math.max(
            1,
            ...baseOrders.map((o) => Number(o.id) || 0),
            ...baseNotices.map((n) => Number(n.id) || 0)
          ) + 1,
        order_items: Math.max(1, ...baseItems.map((i) => Number(i.id) || 0)) + 1,
        transactions: Math.max(1, ...baseTx.map((t) => Number(t.id) || 0)) + 1,
      },
    };
    return JSON.stringify(merged);
  } catch {
    return remoteRawDb;
  }
}

let pushTimeoutId: ReturnType<typeof setTimeout> | null = null;
let isSyncInProgress = false;
let isApplyingRemoteData = false;
let hasCompletedStartupAttempt = false;
let circuitBreakerTripped = false;
let lastSyncedFingerprint = '';
let initialHydrationPromise: Promise<boolean> | null = null;
let lastSilentPullAt = 0;

function applyCloudPayloadToLocalStorage(
  remotePayload: StallSyncPayload,
  mergeLocalAdditions = true
): boolean {
  const remoteMap = remotePayload.rawStorage;
  if (!remoteMap || typeof remoteMap !== 'object') return false;
  let changed = false;
  isApplyingRemoteData = true;
  try {
    for (const key of SYNCED_STORAGE_KEYS) {
      const incomingVal = remoteMap[key];
      if (incomingVal === undefined || incomingVal === null) continue;
      const currentVal = localStorage.getItem(key);
      const finalVal =
        key === 'ht_static_db_v1' && mergeLocalAdditions
          ? mergeRemoteAndLocalMainDb(incomingVal, currentVal, false) || incomingVal
          : incomingVal;
      if (currentVal !== finalVal) {
        localStorage.setItem(key, finalVal);
        changed = true;
      }
    }
    const snapAfter = buildLocalSyncPayload();
    lastSyncedFingerprint = computeStorageFingerprint(snapAfter.rawStorage);
  } catch {
    // ignore
  } finally {
    isApplyingRemoteData = false;
  }
  return changed;
}

/**
 * Case 2 & 3: Uploads local state to `public.stall_sync` (`id = 'main_stall'`).
 * Circuit breaker stops automatic retries if an error occurred until a manual sync is requested.
 */
export async function pushLocalStateToCloud(options?: {
  mergeWithRemoteFirst?: boolean;
  force?: boolean;
}): Promise<boolean> {
  if (isSyncInProgress && !options?.force) return false;
  if (circuitBreakerTripped && !options?.force) return false;

  const currentPayload = buildLocalSyncPayload();
  const currentFp = computeStorageFingerprint(currentPayload.rawStorage);
  if (!options?.force && currentFp === lastSyncedFingerprint) {
    return true;
  }

  isSyncInProgress = true;
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
          isApplyingRemoteData = true;
          localStorage.setItem('ht_static_db_v1', mergedDb);
          isApplyingRemoteData = false;
          if (invalidateDbCallback) invalidateDbCallback();
        }
      }
    }

    const allAppData = buildLocalSyncPayload();
    const nowIso = new Date().toISOString();
    await upsertRemoteStallSyncRow(allAppData, nowIso);

    lastSyncedFingerprint = computeStorageFingerprint(allAppData.rawStorage);
    circuitBreakerTripped = false;
    try {
      localStorage.setItem(LAST_CLOUD_SYNC_AT_KEY, nowIso);
      localStorage.setItem(LOCAL_UPDATED_AT_KEY, nowIso);
    } catch {
      // ignore
    }
    setSyncStatus({ state: 'synced', lastSyncedAt: nowIso, lastError: null });
    isSyncInProgress = false;
    return true;
  } catch (err) {
    isSyncInProgress = false;
    circuitBreakerTripped = true;
    setSyncStatus({
      state: 'offline',
      lastError: formatSupabaseError(err),
    });
    return false;
  }
}

/**
 * Case 2: Debounced (1.5s) push triggered ONLY by explicit user write actions.
 */
export function scheduleCloudPush(immediate = false): void {
  if (isApplyingRemoteData || isSyncInProgress || circuitBreakerTripped) {
    return;
  }
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
  pushTimeoutId = setTimeout(() => {
    pushTimeoutId = null;
    void pushLocalStateToCloud();
  }, 1500);
}

/**
 * Case 1 (onMount once) & Case 3 (Manual "סנכרן עכשיו"):
 * - GET /rest/v1/stall_sync?id=eq.main_stall&select=*
 * - If cloud is empty and localStorage has data -> POST upsert all local data to cloud.
 * - If cloud has data -> sync it to local device without triggering a re-push loop.
 * - On manual sync (`isManual = true`), also POST upserts the merged data to cloud.
 */
export async function syncWithCloudOnStartupOrPoll(isManual = false): Promise<boolean> {
  if (!isManual && hasCompletedStartupAttempt) {
    return currentStatus.state === 'synced';
  }
  if (!isManual && initialHydrationPromise) {
    return initialHydrationPromise;
  }
  if (isSyncInProgress && !isManual) {
    return false;
  }

  const runPromise = (async (): Promise<boolean> => {
  hasCompletedStartupAttempt = true;
  isSyncInProgress = true;
  if (isManual) {
    circuitBreakerTripped = false;
  }
  setSyncStatus({ state: 'syncing', lastError: null });

  try {
    const row = await fetchRemoteStallSyncRow();
    const remotePayload = row?.data || null;
    const remoteHasData = hasRemotePayloadContent(remotePayload);
    const localPayloadBefore = buildLocalSyncPayload();
    const localHasData = hasLocalDataToUpload(localPayloadBefore);

    if (!remoteHasData && localHasData) {
      // הענן ריק ובמכשיר קיימים נתונים ב-localStorage — מעלים מיד לענן (POST)
      const nowIso = new Date().toISOString();
      await upsertRemoteStallSyncRow(localPayloadBefore, nowIso);
      lastSyncedFingerprint = computeStorageFingerprint(localPayloadBefore.rawStorage);
      try {
        localStorage.setItem(LAST_CLOUD_SYNC_AT_KEY, nowIso);
      } catch {
        // ignore
      }
    } else if (remoteHasData && remotePayload) {
      // בענן קיימים נתונים — מסנכרנים אותם למכשיר המקומי
      const mutated = applyCloudPayloadToLocalStorage(remotePayload, true);
      if (mutated) {
        notifyCloudDataUpdated();
      }
      // אם זו לחיצה ידנית על "סנכרן עכשיו" — שומרים גם את המצב הממוזג חזרה לענן
      if (isManual) {
        const mergedPayload = buildLocalSyncPayload();
        const nowIso = new Date().toISOString();
        await upsertRemoteStallSyncRow(mergedPayload, nowIso);
        lastSyncedFingerprint = computeStorageFingerprint(mergedPayload.rawStorage);
      }
    } else if (isManual) {
      const nowIso = new Date().toISOString();
      await upsertRemoteStallSyncRow(localPayloadBefore, nowIso);
      lastSyncedFingerprint = computeStorageFingerprint(localPayloadBefore.rawStorage);
    }

    circuitBreakerTripped = false;
    setSyncStatus({
      state: 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
    isSyncInProgress = false;
    return true;
  } catch (err) {
    isSyncInProgress = false;
    circuitBreakerTripped = true;
    setSyncStatus({
      state: 'offline',
      lastError: formatSupabaseError(err),
    });
    return false;
  }
  })();

  if (!isManual) {
    initialHydrationPromise = runPromise;
  }
  return runPromise;
}

/**
 * מבטיח שהנתונים הראשוניים מ-Supabase נטענו לפני הצגת נתיב חיצוני (#/c/:id, #/approve/:id, #/order/:id).
 * כאשר forceFresh = true, מבצע שליפה רעננה מהענן (GET) וממזג למכשיר ללא שליחה חוזרת.
 */
export async function ensureInitialCloudHydration(forceFresh = false): Promise<boolean> {
  if (!forceFresh) {
    if (hasCompletedStartupAttempt && !initialHydrationPromise) {
      return currentStatus.state === 'synced';
    }
    return syncWithCloudOnStartupOrPoll(false);
  }

  try {
    const row = await fetchRemoteStallSyncRow();
    const remotePayload = row?.data || null;
    if (hasRemotePayloadContent(remotePayload) && remotePayload) {
      const mutated = applyCloudPayloadToLocalStorage(remotePayload, true);
      if (mutated) {
        notifyCloudDataUpdated();
      }
    }
    circuitBreakerTripped = false;
    setSyncStatus({
      state: 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * רענון שקט מהענן בחזרה ללשונית/אפליקציה (visibilitychange / focus) עם Cooldown של 6 שניות למניעת עומס.
 */
export async function pullLatestCloudStateSilently(): Promise<boolean> {
  if (isSyncInProgress || circuitBreakerTripped) return false;
  const now = Date.now();
  if (now - lastSilentPullAt < 6000) return false;
  lastSilentPullAt = now;

  isSyncInProgress = true;
  try {
    const row = await fetchRemoteStallSyncRow();
    const remotePayload = row?.data || null;
    if (hasRemotePayloadContent(remotePayload) && remotePayload) {
      const mutated = applyCloudPayloadToLocalStorage(remotePayload, true);
      if (mutated) {
        notifyCloudDataUpdated();
      }
    }
    setSyncStatus({
      state: 'synced',
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
    });
    isSyncInProgress = false;
    return true;
  } catch {
    isSyncInProgress = false;
    return false;
  }
}
