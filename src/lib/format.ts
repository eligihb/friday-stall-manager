import type { OrderStatus, OrderType, PaymentMethod, UserRole, WasteType } from '../types';

export function formatILS(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  return `₪${num.toLocaleString('he-IL', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

export function getNextFridayISO(baseDate = new Date()): string {
  const d = new Date(baseDate);
  const day = d.getDay();
  const diff = (5 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function getUpcomingFridays(count = 6): string[] {
  const first = new Date(`${getNextFridayISO()}T12:00:00`);
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i * 7);
    list.push(d.toISOString().slice(0, 10));
  }
  return list;
}

export function formatHebrewDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatFridayLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const formatted = d.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `שישי, ${formatted}`;
}

export function formatShortFriday(iso: string): string {
  if (!iso) return '';
  const parts = iso.slice(0, 10).split('-');
  if (parts.length !== 3) return iso;
  return `יום שישי ${parts[2]}/${parts[1]}`;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'מנהל',
  supplier: 'ספק',
  customer: 'לקוח',
};

export function getFridaysRange(pastCount = 3, upcomingCount = 6): string[] {
  const first = new Date(`${getNextFridayISO()}T12:00:00`);
  const list: string[] = [];
  for (let i = -pastCount; i < upcomingCount; i++) {
    const d = new Date(first);
    d.setDate(first.getDate() + i * 7);
    list.push(d.toISOString().slice(0, 10));
  }
  return list;
}

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  customer: 'לקוח',
  supplier: 'ספק סיטונאי',
  charity: 'הזמנה מסובסדת',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_approval: 'ממתין לאישור מוכר',
  pending: 'ממתין',
  received: 'התקבל',
  ready: 'מוכן למסירה',
  delivered: 'נמסר',
  cancel_requested: 'ממתין לאישור ביטול',
  cancelled: 'בוטל',
};

/**
 * Returns true if cancellation is still allowed (strictly before 06:00 AM on the order's Friday).
 */
export function isBeforeFridayCancelCutoff(fridayDate: string, now = new Date()): boolean {
  if (!fridayDate || !/^\d{4}-\d{2}-\d{2}$/.test(fridayDate)) return false;
  const cutoff = new Date(`${fridayDate}T06:00:00`);
  if (Number.isNaN(cutoff.getTime())) return false;
  return now.getTime() < cutoff.getTime();
}

/**
 * Returns true if the customer clicked prepay (Bit / PayBox / Bank transfer) and the seller hasn't marked it paid yet.
 */
export function isOrderPrepayPendingVerification(order: {
  status?: string;
  total_amount?: number;
  paid_amount?: number;
  notes?: string | null;
}): boolean {
  if (!order || order.status === 'cancelled') return false;
  const total = Number(order.total_amount) || 0;
  const paid = Number(order.paid_amount) || 0;
  if (total <= 0 || paid >= total - 0.01) return false;
  const notes = String(order.notes || '');
  return (
    notes.includes('תשלום מראש') ||
    notes.includes('העברה בנקאית') ||
    notes.includes('Bit') ||
    notes.includes('PayBox')
  );
}

/**
 * Calculates promo/bundle savings in ILS and % for a given order compared to regular prices.
 */
export function computeOrderPromoSavings(order: {
  total_amount?: number;
  credit_discount?: number;
  notes?: string | null;
  items?: Array<{
    product_name?: string;
    quantity: number;
    unit_price_snapshot: number;
  }>;
}): { savedAmount: number; percent: number; fullPrice: number } {
  const discountedPrice = Number(order.total_amount) || 0;
  if (discountedPrice <= 0 || !Array.isArray(order.items) || order.items.length === 0) {
    return { savedAmount: 0, percent: 0, fullPrice: discountedPrice };
  }

  let fullPrice = 0;
  for (const it of order.items) {
    const name = String(it.product_name || '');
    const qty = Math.max(0, Number(it.quantity) || 0);
    const snap = Math.max(0, Number(it.unit_price_snapshot) || 0);
    let regUnit = snap;
    if (name.includes("ג'חנון") || name.includes('ג׳חנון')) {
      regUnit = Math.max(snap, 9);
    } else if (name.includes('סאלוף') || name.includes('לחוח')) {
      regUnit = Math.max(snap, 5);
    } else if (name.includes("ג'בטה") || name.includes('ג׳בטה') || name.includes('זלביה')) {
      regUnit = Math.max(snap, snap >= 10 ? 12 : 5);
    }
    fullPrice += qty * regUnit;
  }

  fullPrice = Math.max(fullPrice, discountedPrice + (Number(order.credit_discount) || 0));
  const savedAmount = Math.max(0, Math.round((fullPrice - discountedPrice) * 100) / 100);
  if (savedAmount < 0.5 || fullPrice <= 0) {
    return { savedAmount: 0, percent: 0, fullPrice };
  }
  const percent = Math.round(((fullPrice - discountedPrice) / fullPrice) * 100);
  return { savedAmount, percent, fullPrice };
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'מזומן',
  paybox: 'פייבוקס',
  transfer: 'העברה בנקאית',
};

export const WASTE_TYPE_LABELS: Record<WasteType, string> = {
  none: 'ללא פחת',
  full: 'פחת מלא',
  partial: 'פחת יחסי',
};

export function computeEffectiveOrderTotal(order: {
  order_type?: string;
  status?: string;
  total_amount?: number;
  delivery_fee?: number;
  credit_discount?: number;
  vat_amount?: number;
  items?: Array<{ quantity: number; unit_price_snapshot: number }>;
}): number {
  if (!order || order.order_type === 'charity' || order.status === 'cancelled') return 0;
  const stored = Number(order.total_amount) || 0;
  if (stored > 0) return Math.round(stored * 100) / 100;
  const itemsSum = (order.items || []).reduce(
    (sum, item) => sum + (Number(item.unit_price_snapshot) || 0) * (Number(item.quantity) || 0),
    0
  );
  if (itemsSum <= 0) return 0;
  const adjusted =
    itemsSum +
    (Number(order.delivery_fee) || 0) -
    (Number(order.credit_discount) || 0) +
    (Number(order.vat_amount) || 0);
  return Math.max(0, Math.round(adjusted * 100) / 100);
}

export interface ActiveWeekRange {
  start: Date;
  end: Date;
  startIso: string;
  fridayDate: string;
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * מחזור שבועי פעיל: מוצאי שבת בשעה 21:00 עד יום שישי שלאחריו בשעה 16:00.
 * בין שישי 16:00 לשבת 21:00 המערכת ממשיכה להציג את המחזור של יום שישי שזה עתה הסתיים
 * לצורך סגירת חשבונות וסיכום קופה, ובשבת 21:00 עוברת אוטומטית לשבוע החדש.
 */
export function getActiveWeekRange(now = new Date()): ActiveWeekRange {
  const day = now.getDay(); // 0=ראשון ... 5=שישי, 6=שבת
  const hour = now.getHours();

  let daysSinceSaturday: number;
  if (day === 6) {
    daysSinceSaturday = hour >= 21 ? 0 : 7;
  } else {
    daysSinceSaturday = day + 1;
  }

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceSaturday, 21, 0, 0, 0);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 16, 0, 0, 0);

  return {
    start,
    end,
    startIso: toLocalISODate(start),
    fridayDate: toLocalISODate(end),
  };
}

export function isOrderInActiveWeek(
  order: { friday_date: string; created_at?: string },
  range = getActiveWeekRange()
): boolean {
  if (order.friday_date === range.fridayDate) return true;
  if (order.created_at) {
    const createdDay = order.created_at.slice(0, 10);
    if (createdDay >= range.startIso && createdDay <= range.fridayDate) {
      return order.friday_date >= range.startIso && order.friday_date <= range.fridayDate;
    }
  }
  return false;
}
