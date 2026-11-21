export interface CompactOrderLinkItem {
  pid: number;
  q: number;
  u: number;
  nm?: string;
}

export interface CompactOrderLinkPayload {
  id: number;
  n: string; // recipient_name
  p: string; // phone
  f: string; // friday_date YYYY-MM-DD
  t: number; // total_amount
  nt?: string; // notes
  i: CompactOrderLinkItem[];
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeOrderLinkPayload(payload: CompactOrderLinkPayload): string {
  try {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    return bytesToBase64Url(bytes);
  } catch {
    return '';
  }
}

export function decodeOrderLinkPayload(encoded: string | null | undefined): CompactOrderLinkPayload | null {
  if (!encoded) return null;
  try {
    const bytes = base64UrlToBytes(encoded.trim());
    const json = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as Partial<CompactOrderLinkPayload>;
    if (!parsed || typeof parsed.n !== 'string' || !Array.isArray(parsed.i)) return null;
    return {
      id: Number(parsed.id) || 0,
      n: String(parsed.n || '').trim(),
      p: String(parsed.p || '').trim(),
      f: String(parsed.f || '').slice(0, 10),
      t: Number(parsed.t) || 0,
      nt: parsed.nt ? String(parsed.nt) : '',
      i: parsed.i.map((it) => ({
        pid: Number(it.pid) || 0,
        q: Math.max(1, Number(it.q) || 1),
        u: Math.max(0, Number(it.u) || 0),
        nm: it.nm ? String(it.nm) : undefined,
      })),
    };
  } catch {
    return null;
  }
}

export interface ImportedOrderBackupRecord {
  payload: CompactOrderLinkPayload;
  status: 'received' | 'awaiting_approval';
  savedAt: number;
}

const IMPORTED_BACKUP_KEY = 'fsm_imported_orders_backup_v1';

export function loadImportedOrdersBackup(): ImportedOrderBackupRecord[] {
  try {
    const raw = localStorage.getItem(IMPORTED_BACKUP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistImportedOrderBackup(
  payload: CompactOrderLinkPayload,
  status: 'received' | 'awaiting_approval'
): void {
  try {
    const existing = loadImportedOrdersBackup();
    const idx = existing.findIndex(
      (r) =>
        (payload.id > 0 && r.payload.id === payload.id) ||
        (r.payload.n === payload.n &&
          r.payload.p === payload.p &&
          r.payload.f === payload.f &&
          Math.abs(r.payload.t - payload.t) < 0.01)
    );
    const rec: ImportedOrderBackupRecord = { payload, status, savedAt: Date.now() };
    if (idx >= 0) {
      // לא לשנמך סטטוס שכבר אושר (received)
      if (existing[idx].status === 'received') rec.status = 'received';
      existing[idx] = rec;
    } else {
      existing.push(rec);
    }
    localStorage.setItem(IMPORTED_BACKUP_KEY, JSON.stringify(existing));
  } catch {
    // ignore
  }
}
