import type { BusinessSettings, FridayInventoryItem, Order, User } from '../types';
import { formatFridayLabel, formatILS, ORDER_STATUS_LABELS } from './format';

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
  const lines: string[] = [
    `🫓 *${payload.business_name} — הזמנה חדשה לאישור (#${payload.id})*`,
    `👤 שם: *${payload.recipient_name}*`,
    `📱 טלפון: ${payload.phone}`,
    `📅 ${formatFridayLabel(payload.friday_date)}`,
    `🏷️ תעריף: ${payload.pricing_mode === 'preorder' ? 'הזמנה מוקדמת' : 'מחיר דוכן רגיל'}`,
    `━━━━━━━━━━━━━━━━`,
  ];

  for (const it of payload.items) {
    lines.push(`• ${it.quantity} × ${it.product_name} — ${formatILS(it.quantity * it.unit_price)}`);
  }

  lines.push(`━━━━━━━━━━━━━━━━`);
  lines.push(`💳 *סה״כ לתשלום: ${formatILS(payload.total_amount)}*`);
  if (payload.notes) lines.push(`📝 הערה: ${payload.notes}`);
  lines.push(`⏳ סטטוס: ממתין לאישור מנהל`);
  return lines.join('\n');
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
