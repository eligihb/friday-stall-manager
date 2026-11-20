import type { BusinessSettings, FridayInventoryItem, Order, User } from '../types';
import { formatFridayLabel, formatILS, ORDER_STATUS_LABELS } from './format';
import { isProductVisibleToCustomers, loadStorefrontConfig } from './storefrontConfig';

export function formatProductionWhatsApp(
  fridayDate: string,
  items: FridayInventoryItem[],
  settings?: Partial<BusinessSettings>
): string {
  const bizName = settings?.business_name || 'דוכן שישי תימני';
  const activeItems = items.filter((i) => i.total_to_bake > 0);
  const totalUnits = activeItems.reduce((s, i) => s + i.total_to_bake, 0);
  const totalCost = activeItems.reduce((s, i) => s + i.total_to_bake * i.cost_price, 0);

  const lines: string[] = [
    `🔥 *${bizName} — סיכום רכש מהמאפייה*`,
    `📅 ${formatFridayLabel(fridayDate)}`,
    `━━━━━━━━━━━━━━━━`,
  ];

  for (const item of activeItems) {
    const breakdown: string[] = [];
    if (item.supplier_qty > 0) breakdown.push(`ספקים: ${item.supplier_qty}`);
    if (item.customer_qty > 0) breakdown.push(`לקוחות: ${item.customer_qty}`);
    if (item.charity_qty > 0) breakdown.push(`מסובסדות: ${item.charity_qty}`);
    if (item.extra_stall_qty > 0) breakdown.push(`דוכן: ${item.extra_stall_qty}`);
    const details = breakdown.length ? ` (${breakdown.join(' | ')})` : '';
    lines.push(`• *${item.product_name}*: ${item.total_to_bake} יח׳${details}`);
  }

  lines.push(`━━━━━━━━━━━━━━━━`);
  lines.push(`📦 סה״כ יחידות לרכש מהמאפייה: *${totalUnits}*`);
  lines.push(`💵 עלות משוערת במזומן למאפייה: *${formatILS(totalCost)}*`);
  lines.push(`ℹ️ הערה: למעט תוספות ביתיות (כגון רוטב סלסה / כבד קצוץ).`);
  return lines.join('\n');
}

export function getAppBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

export function buildCustomerPortalUrl(customerId: number): string {
  return `${getAppBaseUrl()}#/c/${customerId}`;
}

export function buildQuickApproveUrl(orderId: number): string {
  return `${getAppBaseUrl()}#/approve-quick/${orderId}`;
}

export function buildAdminOrderViewUrl(orderId: number): string {
  return `${getAppBaseUrl()}#/order/${orderId}`;
}

export function buildDigitalMenuUrl(): string {
  return `${getAppBaseUrl()}#/menu`;
}

export function formatDigitalMenuWhatsApp(
  products: Array<{ id?: number; name: string; preorder_price: number; customer_price: number; is_active?: boolean }>,
  settings?: Partial<BusinessSettings>
): string {
  const cfg = loadStorefrontConfig();
  const bizName = settings?.business_name || 'המטבח התימני – תפריט יום שישי';
  const active = products.filter(
    (p) => p.is_active !== false && (p.id === undefined || isProductVisibleToCustomers(p.id, cfg))
  );

  const itemsText = active
    .map((p) => {
      const pre = formatILS(p.preorder_price);
      const reg = formatILS(p.customer_price);
      return p.preorder_price < p.customer_price
        ? `• *${p.name}* — ${pre} במוקדמת (דוכן: ${reg})`
        : `• *${p.name}* — ${reg}`;
    })
    .join('\n');

  return cfg.menuShareTemplate
    .replace(/\{שם_עסק\}/g, bizName)
    .replace(/\{פריטים\}/g, itemsText)
    .replace(/\{קישור\}/g, buildDigitalMenuUrl());
}

export function formatOrderWhatsApp(order: Order, settings?: Partial<BusinessSettings>): string {
  const bizName = settings?.business_name || 'דוכן שישי תימני';
  const footer = settings?.whatsapp_footer ?? 'שבת שלום ומבורכת! 🕯️';
  const lines: string[] = [
    `🫓 *${bizName} — סיכום הזמנה #${order.id}*`,
    `👤 ${order.recipient_name}`,
    `📅 ${formatFridayLabel(order.friday_date)}`,
    `━━━━━━━━━━━━━━━━`,
  ];

  for (const it of order.items) {
    lines.push(
      `• ${it.quantity} × ${it.product_name} — ${formatILS(it.quantity * it.unit_price_snapshot)}`
    );
  }

  lines.push(`━━━━━━━━━━━━━━━━`);
  if (order.delivery_fee > 0) lines.push(`🚗 דמי משלוח: ${formatILS(order.delivery_fee)}`);
  if (order.credit_discount > 0) lines.push(`🎁 הנחה / זיכוי: -${formatILS(order.credit_discount)}`);
  lines.push(`💳 *סה״כ לתשלום: ${formatILS(order.total_amount)}*`);
  if (order.paid_amount > 0) {
    const unpaid = Math.max(0, order.total_amount - order.paid_amount);
    lines.push(`✅ שולם: ${formatILS(order.paid_amount)}`);
    if (unpaid > 0) lines.push(`⏳ יתרה לתשלום: *${formatILS(unpaid)}*`);
  }
  lines.push(`📌 סטטוס: ${ORDER_STATUS_LABELS[order.status]}`);
  if (order.notes) lines.push(`📝 הערות: ${order.notes}`);
  if (order.user_id) {
    lines.push(`🔗 לאזור האישי ומעקב חי אחר ההזמנה: ${buildCustomerPortalUrl(order.user_id)}`);
  }
  if (footer) lines.push(`\n${footer}`);
  return lines.join('\n');
}

export function buildWhatsAppShareUrl(text: string, phone?: string): string {
  const encoded = encodeURIComponent(text);
  if (phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 9) {
      const intl = digits.startsWith('0') ? `972${digits.slice(1)}` : digits;
      return `https://wa.me/${intl}?text=${encoded}`;
    }
  }
  return `https://wa.me/?text=${encoded}`;
}

export function formatPublicApprovalWhatsApp(payload: {
  id: number;
  business_name: string;
  recipient_name: string;
  phone: string;
  friday_date: string;
  pricing_mode: 'preorder' | 'stall';
  items: Array<{ product_name: string; quantity: number; unit_price: number }>;
  total_amount: number;
  notes?: string;
}): string {
  const cfg = loadStorefrontConfig();
  const itemsText = payload.items
    .map((it) => `• ${it.quantity} × ${it.product_name} — ${formatILS(it.quantity * it.unit_price)}`)
    .join('\n');
  const notesLine = payload.notes ? `📝 הערה: ${payload.notes}` : '';

  return cfg.customerOrderTemplate
    .replace(/\{שם_עסק\}/g, payload.business_name)
    .replace(/\{מספר\}/g, String(payload.id))
    .replace(/\{שם\}/g, payload.recipient_name)
    .replace(/\{טלפון\}/g, payload.phone)
    .replace(/\{תאריך\}/g, formatFridayLabel(payload.friday_date))
    .replace(/\{פריטים\}/g, itemsText)
    .replace(/\{סהכ\}/g, formatILS(payload.total_amount))
    .replace(/\{הערות\}/g, notesLine)
    .replace(/\{קישור_אישור\}/g, buildQuickApproveUrl(payload.id))
    .replace(/\{קישור_צפייה\}/g, buildAdminOrderViewUrl(payload.id))
    .replace(/\{קישור\}/g, buildAdminOrderViewUrl(payload.id))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatSupplierLedgerWhatsApp(user: User, orders: Order[]): string {
  const balanceText =
    user.balance < 0
      ? `חוב פתוח: ${formatILS(Math.abs(user.balance))}`
      : user.balance > 0
      ? `יתרת זכות: ${formatILS(user.balance)}`
      : 'מאוזן (₪0.00)';

  const lines: string[] = [
    `📋 *דוכן שישי תימני — כרטסת ספק*`,
    `🏪 ${user.name}`,
    `💰 *מצב חשבון נוכחי: ${balanceText}*`,
    `━━━━━━━━━━━━━━━━`,
  ];

  for (const o of orders.slice(0, 8)) {
    const creditStr = o.credit_discount > 0 ? ` | זיכוי: ${formatILS(o.credit_discount)}` : '';
    lines.push(
      `📅 ${o.friday_date}: חיוב ${formatILS(o.total_amount)}${creditStr} | שולם ${formatILS(o.paid_amount)}`
    );
  }

  return lines.join('\n');
}
