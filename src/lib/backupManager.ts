import { invalidateLocalDbCache } from './localApi';

export const BACKUPS_STORAGE_KEY = 'friday_stall_backups';
export const MAX_WEEKLY_SNAPSHOTS = 12;

const APP_STORAGE_KEYS = {
  mainDb: 'ht_static_db_v1',
  cashRegister: 'fsm_cash_register_v1',
  wasteConfig: 'fsm_waste_config_v1',
  storefrontConfig: 'fsm_storefront_config_v1',
  stockMap: 'fsm_product_stock_v1',
  importedOrdersBackup: 'fsm_imported_orders_backup_v1',
  userActiveMap: 'fsm_user_active_map',
  businessSettingsExtra: 'fsm_business_settings_extra',
} as const;

export type BackupKind = 'auto_friday' | 'manual' | 'pre_restore';

export interface BackupSnapshotSummary {
  ordersCount: number;
  customersCount: number;
  suppliersCount: number;
  productsCount: number;
}

export interface BackupSnapshotData {
  // Raw localStorage key-value map for 100% fidelity restore
  rawStorage: Record<string, string | null>;
  // Structured fields requested: orders, customers, products, cashRegister, waste, expenses, suppliers, settings
  orders: unknown[];
  customers: unknown[];
  suppliers: unknown[];
  products: unknown[];
  cashRegister: unknown;
  waste: {
    wasteLogs: unknown[];
    wasteConfigs: unknown;
  };
  expenses: {
    transactions: unknown[];
    fixedExpenses: unknown[];
  };
  settings: unknown;
}

export interface BackupSnapshot {
  id: string;
  label: string;
  kind: BackupKind;
  fridayDate: string;
  createdAt: string;
  displayDate: string;
  summary: BackupSnapshotSummary;
  data: BackupSnapshotData;
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function formatSnapshotDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

/**
 * Returns the ISO date (YYYY-MM-DD) of the most recent Friday on or before `now`.
 * (If today is Friday, returns today's date; otherwise returns the Friday that most recently passed.)
 */
export function getMostRecentOrTodayFridayISO(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  const day = d.getDay(); // 0=Sun .. 5=Fri, 6=Sat
  const diffBackToFriday = day >= 5 ? day - 5 : day + 2;
  d.setDate(d.getDate() - diffBackToFriday);
  return d.toISOString().slice(0, 10);
}

export function loadBackupSnapshots(): BackupSnapshot[] {
  try {
    const raw = localStorage.getItem(BACKUPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBackupSnapshots(list: BackupSnapshot[]): BackupSnapshot[] {
  const trimmed = list.slice(0, MAX_WEEKLY_SNAPSHOTS);
  try {
    localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // If localStorage quota is tight, keep fewer snapshots
    try {
      localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(trimmed.slice(0, 6)));
    } catch {
      // ignore
    }
  }
  return trimmed;
}

export function buildCurrentSnapshotObject(
  label: string,
  kind: BackupKind,
  fridayDate = getMostRecentOrTodayFridayISO()
): BackupSnapshot {
  const rawStorage: Record<string, string | null> = {};
  for (const key of Object.values(APP_STORAGE_KEYS)) {
    try {
      rawStorage[key] = localStorage.getItem(key);
    } catch {
      rawStorage[key] = null;
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
  }>(rawStorage[APP_STORAGE_KEYS.mainDb], {});

  const orders = Array.isArray(mainDb.orders) ? mainDb.orders : [];
  const allUsers = Array.isArray(mainDb.users) ? mainDb.users : [];
  const customers = allUsers.filter((u) => u.role === 'customer');
  const suppliers = allUsers.filter((u) => u.role === 'supplier');
  const products = Array.isArray(mainDb.products) ? mainDb.products : [];
  const cashRegister = safeParseJson<unknown>(rawStorage[APP_STORAGE_KEYS.cashRegister], {});
  const wasteConfigs = safeParseJson<unknown>(rawStorage[APP_STORAGE_KEYS.wasteConfig], {});

  const nowIso = new Date().toISOString();

  return {
    id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label,
    kind,
    fridayDate,
    createdAt: nowIso,
    displayDate: formatSnapshotDateTime(nowIso),
    summary: {
      ordersCount: orders.length,
      customersCount: customers.length,
      suppliersCount: suppliers.length,
      productsCount: products.length,
    },
    data: {
      rawStorage,
      orders,
      customers,
      suppliers,
      products,
      cashRegister,
      waste: {
        wasteLogs: Array.isArray(mainDb.waste_logs) ? mainDb.waste_logs : [],
        wasteConfigs,
      },
      expenses: {
        transactions: Array.isArray(mainDb.transactions) ? mainDb.transactions : [],
        fixedExpenses: Array.isArray(mainDb.fixed_expenses) ? mainDb.fixed_expenses : [],
      },
      settings: mainDb.settings || {},
    },
  };
}

export function createBackupSnapshot(
  label = 'גיבוי ידני',
  kind: BackupKind = 'manual'
): { created: BackupSnapshot; all: BackupSnapshot[] } {
  const existing = loadBackupSnapshots();
  const snap = buildCurrentSnapshotObject(label, kind);
  // אם מדובר בגיבוי אוטומטי לפני שחזור, נחליף גיבוי pre_restore ישן אם קיים כדי לא לבזבז סלוטים
  const filtered =
    kind === 'pre_restore'
      ? existing.filter((s) => s.kind !== 'pre_restore')
      : existing;
  const next = saveBackupSnapshots([snap, ...filtered]);
  return { created: snap, all: next };
}

/**
 * Automatically creates a weekly Friday snapshot if today is Friday (and not backed up today)
 * or if a Friday has passed since the last saved snapshot.
 */
export function ensureWeeklyFridayBackup(now = new Date()): BackupSnapshot[] {
  const existing = loadBackupSnapshots();
  const targetFriday = getMostRecentOrTodayFridayISO(now);
  const alreadyHasFridaySnap = existing.some(
    (s) => s.fridayDate === targetFriday || s.createdAt.slice(0, 10) >= targetFriday
  );
  if (alreadyHasFridaySnap) {
    return existing;
  }
  const snap = buildCurrentSnapshotObject(
    `גיבוי יום שישי אוטומטי (${targetFriday})`,
    'auto_friday',
    targetFriday
  );
  return saveBackupSnapshots([snap, ...existing]);
}

export function applySnapshotDataToStorage(snapshot: BackupSnapshot): void {
  const rawMap = snapshot.data?.rawStorage;
  if (rawMap && typeof rawMap === 'object') {
    for (const [k, val] of Object.entries(rawMap)) {
      try {
        if (val === null || val === undefined) {
          localStorage.removeItem(k);
        } else {
          localStorage.setItem(k, val);
        }
      } catch {
        // ignore
      }
    }
  }
  invalidateLocalDbCache();
}

/**
 * Saves a safety snapshot of current state ("גיבוי אוטומטי לפני שחזור") and restores the target snapshot.
 */
export function restoreFromSnapshotId(snapshotId: string): BackupSnapshot | null {
  const existing = loadBackupSnapshots();
  const target = existing.find((s) => s.id === snapshotId) || null;
  if (!target) return null;

  // 1. הגנת בטיחות: שמירת המצב הנוכחי לפני השחזור
  createBackupSnapshot('גיבוי אוטומטי לפני שחזור', 'pre_restore');

  // 2. שחזור הנתונים
  applySnapshotDataToStorage(target);
  return target;
}

export function deleteBackupSnapshot(snapshotId: string): BackupSnapshot[] {
  const existing = loadBackupSnapshots().filter((s) => s.id !== snapshotId);
  return saveBackupSnapshots(existing);
}

/**
 * Downloads a full external JSON backup file (`backup-friday-stall-YYYY-MM-DD.json`).
 */
export function downloadExternalBackupFile(): void {
  const todayIso = new Date().toISOString().slice(0, 10);
  const currentSnapshot = buildCurrentSnapshotObject(
    `קובץ גיבוי חיצוני (${todayIso})`,
    'manual'
  );
  const payload = {
    format: 'friday_stall_full_backup_v1',
    exportedAt: new Date().toISOString(),
    currentSnapshot,
    historySnapshots: loadBackupSnapshots(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-friday-stall-${todayIso}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Parses and validates an uploaded JSON backup file.
 */
export function parseExternalBackupFile(jsonText: string): BackupSnapshot {
  const parsed = JSON.parse(jsonText);
  if (parsed && parsed.currentSnapshot && parsed.currentSnapshot.data) {
    return parsed.currentSnapshot as BackupSnapshot;
  }
  if (parsed && parsed.data && parsed.data.rawStorage) {
    return parsed as BackupSnapshot;
  }
  throw new Error('קובץ הגיבוי אינו תקין או אינו מתאים למערכת דוכן שישי תימני');
}

/**
 * Saves a safety pre-restore snapshot and restores from a parsed external BackupSnapshot.
 */
export function restoreFromExternalSnapshot(externalSnap: BackupSnapshot): void {
  createBackupSnapshot('גיבוי אוטומטי לפני שחזור מקובץ', 'pre_restore');
  applySnapshotDataToStorage(externalSnap);
}
