import type { OrderStatus, OrderType, PaymentMethod, UserRole } from '../types';

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
  charity: 'תרומה למשפחות נזקקות',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_approval: 'ממתין לאישור מנהל',
  pending: 'ממתין להכנה',
  ready: 'מוכן למסירה',
  delivered: 'נמסר',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'מזומן',
  bit: 'ביט',
  transfer: 'העברה בנקאית',
};
