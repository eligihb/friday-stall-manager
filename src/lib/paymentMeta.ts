export type PaymentMethodLabel = 'מזומן' | 'פייבוקס' | 'ביט' | 'העברה בנקאית';

export interface OrderPaymentMeta {
  methodLabel: PaymentMethodLabel;
  paidTime: string; // HH:MM
}

const PAYMENT_META_KEY = 'fsm_order_payment_meta_v1';

export function getCurrentHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

export function loadPaymentMetaMap(): Record<number, OrderPaymentMeta> {
  try {
    const raw = localStorage.getItem(PAYMENT_META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getOrderPaymentMeta(orderId: number): OrderPaymentMeta | null {
  return loadPaymentMetaMap()[orderId] || null;
}

export function saveOrderPaymentMeta(orderId: number, meta: OrderPaymentMeta): void {
  const map = loadPaymentMetaMap();
  map[orderId] = meta;
  try {
    localStorage.setItem(PAYMENT_META_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}
