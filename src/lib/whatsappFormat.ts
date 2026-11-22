import type { BusinessSettings, FridayInventoryItem, Order, User } from '../types';
import { formatFridayLabel, formatILS, ORDER_STATUS_LABELS } from './format';
import { isProductVisibleToCustomers, loadStorefrontConfig } from './storefrontConfig';
import { encodeOrderLinkPayload } from './orderLinkCodec';

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

export function buildQuickApproveUrl(orderId: number, encodedData?: string): string {
  const qs = encodedData ? `?d=${encodedData}` : '';
  return `${getAppBaseUrl()}#/approve-quick/${orderId}${qs}`;
}

export function buildCancelApproveUrl(orderId: number, encodedData?: string): string {
  const qs = encodedData ? `?d=${encodedData}` : '';
  return `${getAppBaseUrl()}#/approve-cancel/${orderId}${qs}`;
}

export function buildAdminOrderViewUrl(orderId: number, encodedData?: string): string {
  const qs = encodedData ? `?d=${encodedData}` : '';
  return `${getAppBaseUrl()}#/order/${orderId}${qs}`;
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
        ? `• *${p.name}* — ${pre} (~${reg}~)`
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
  const personalUrl = order.user_id
    ? buildCustomerPortalUrl(order.user_id)
    : buildDigitalMenuUrl();
  lines.push(``);
  lines.push(`🔗 לצפייה בהזמנה, תשלום או עדכון/ביטול (עד יום שישי ב-06:00):`);
  lines.push(personalUrl);
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
  customer_id?: number | null;
  business_name: string;
  recipient_name: string;
  phone: string;
  friday_date: string;
  pricing_mode: 'preorder' | 'stall';
  items: Array<{ product_id?: number; product_name: string; quantity: number; unit_price: number }>;
  total_amount: number;
  mix_discount?: number;
  payment_label?: string;
  notes?: string;
  is_update?: boolean;
  is_replace?: boolean;
  previous_total?: number;
  added_items?: Array<{ product_name: string; quantity: number; unit_price: number }>;
}): string {
  const cfg = loadStorefrontConfig();
  const itemLines = payload.items.map(
    (it) => `• ${it.quantity} × ${it.product_name} — ${formatILS(it.quantity * it.unit_price)}`
  );
  if ((payload.mix_discount ?? 0) > 0) {
    itemLines.push(`✨ הנחת מבצע זוג מארזים (2 ב-20 ₪): -${formatILS(payload.mix_discount!)}`);
  }

  let itemsText = itemLines.join('\n');
  if (payload.is_update && payload.added_items && payload.added_items.length > 0) {
    const addedLines = payload.added_items.map(
      (it) => `➕ ${it.quantity} × ${it.product_name} — ${formatILS(it.quantity * it.unit_price)}`
    );
    const prevTotal = payload.previous_total ?? 0;
    const addedDelta = Math.max(0, payload.total_amount - prevTotal);
    itemsText = [
      `🔄 *מה נוסף כעת להזמנה #${payload.id}:*`,
      ...addedLines,
      `➕ תוספת לתשלום: *${formatILS(addedDelta)}* (קודם: ${formatILS(prevTotal)})`,
      ``,
      `📦 *סה״כ הזמנה מאוחדת מעודכנת (#${payload.id}):*`,
      ...itemLines,
    ].join('\n');
  }
  const trimmedNotes = (payload.notes || '').trim();
  const paymentLine = payload.payment_label ? `💳 אמצעי תשלום: ${payload.payment_label}` : '';
  const notesLine = [paymentLine, trimmedNotes ? `📝 הערה: ${trimmedNotes}` : '']
    .filter(Boolean)
    .join('\n');
  const encodedNotes = [payload.payment_label || '', trimmedNotes].filter(Boolean).join(' | ');

  const encoded = encodeOrderLinkPayload({
    id: payload.id,
    n: payload.recipient_name,
    p: payload.phone,
    f: payload.friday_date,
    t: payload.total_amount,
    nt: encodedNotes,
    i: payload.items.map((it) => ({
      pid: it.product_id ?? 0,
      q: it.quantity,
      u: it.unit_price,
      nm: it.product_name,
    })),
  });

  const customerPersonalLink = payload.customer_id
    ? buildCustomerPortalUrl(payload.customer_id)
    : buildDigitalMenuUrl();

  let baseMsg = cfg.customerOrderTemplate
    .replace(/\{שם_עסק\}/g, payload.business_name)
    .replace(/\{מספר\}/g, String(payload.id))
    .replace(/\{שם\}/g, payload.recipient_name)
    .replace(/\{טלפון\}/g, payload.phone)
    .replace(/\{תאריך\}/g, formatFridayLabel(payload.friday_date))
    .replace(/\{פריטים\}/g, itemsText)
    .replace(/\{סהכ\}/g, formatILS(payload.total_amount))
    .replace(/\{הערות\}\n?/g, notesLine ? `${notesLine}\n` : '')
    .replace(/ממתין לאישור מנהל/g, 'ממתין לאישור מוכר')
    .replace(/\{קישור_לקוח\}/g, customerPersonalLink)
    .replace(/\{קישור_אישור\}/g, buildQuickApproveUrl(payload.id, encoded))
    .replace(/\{קישור_צפייה\}/g, buildAdminOrderViewUrl(payload.id, encoded))
    .replace(/\{קישור\}/g, buildAdminOrderViewUrl(payload.id, encoded))
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!baseMsg.includes('לצפייה בהזמנה, תשלום או עדכון/ביטול')) {
    baseMsg += `\n\n🔗 לצפייה בהזמנה, תשלום או עדכון/ביטול (עד יום שישי ב-06:00):\n${customerPersonalLink}`;
  }

  if (payload.is_replace) {
    return `✏️ *עדכון הזמנה קיימת (#${payload.id})*\n` + baseMsg;
  }
  if (payload.is_update) {
    return `🔄 *תוספת להזמנה קיימת (#${payload.id})*\n` + baseMsg;
  }
  return baseMsg;
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

export function formatCancelRequestWhatsApp(payload: {
  id: number;
  business_name: string;
  recipient_name: string;
  phone: string;
  friday_date: string;
  items: Array<{ product_id?: number; product_name: string; quantity: number; unit_price_snapshot?: number; unit_price?: number }>;
  total_amount: number;
  notes?: string;
}): string {
  const encoded = encodeOrderLinkPayload({
    id: payload.id,
    n: payload.recipient_name,
    p: payload.phone,
    f: payload.friday_date,
    t: payload.total_amount,
    nt: payload.notes || '',
    i: payload.items.map((it) => ({
      pid: it.product_id ?? 0,
      q: it.quantity,
      u: it.unit_price_snapshot ?? it.unit_price ?? 0,
      nm: it.product_name,
    })),
  });

  const itemLines = payload.items.map(
    (it) => `• ${it.quantity} × ${it.product_name}`
  );

  const lines: string[] = [
    `❌ *בקשת ביטול הזמנה #${payload.id} — ${payload.business_name}*`,
    `👤 לקוח: ${payload.recipient_name}${payload.phone ? ` (${payload.phone})` : ''}`,
    `📅 ${formatFridayLabel(payload.friday_date)}`,
    `━━━━━━━━━━━━━━━━`,
    ...itemLines,
    `━━━━━━━━━━━━━━━━`,
    `💳 סכום הזמנה: *${formatILS(payload.total_amount)}*`,
    ``,
    `✅ לאישור או דחיית הביטול לחץ כאן:`,
    buildCancelApproveUrl(payload.id, encoded),
  ];
  return lines.join('\n');
}
