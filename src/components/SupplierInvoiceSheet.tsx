import React, { useState } from 'react';
import { Printer, Share2, Mail, Copy, Check, FileText } from 'lucide-react';
import { formatFridayLabel, formatHebrewDate, formatILS, ORDER_STATUS_LABELS } from '../lib/format';
import { buildWhatsAppShareUrl } from '../lib/whatsappFormat';
import { BottomSheet } from './BottomSheet';
import type { BusinessSettings, Order, User } from '../types';

interface SupplierInvoiceSheetProps {
  order: Order | null;
  supplier?: User | null;
  bizSettings?: BusinessSettings;
  onClose: () => void;
}

export function getPaymentVisualState(order: Order): {
  status: 'unpaid' | 'partial' | 'paid' | 'subsidized';
  label: string;
  badgeCls: string;
} {
  if (order.order_type === 'charity') {
    return {
      status: 'subsidized',
      label: 'הזמנה מסובסדת',
      badgeCls: 'bg-purple-100 text-purple-900 border-purple-300',
    };
  }
  const total = Number(order.total_amount || 0);
  const paid = Number(order.paid_amount || 0);
  if (total <= 0 || paid >= total - 0.009) {
    return {
      status: 'paid',
      label: 'שולם הכל ✓',
      badgeCls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }
  if (paid > 0.009) {
    return {
      status: 'partial',
      label: 'שולם חלקי',
      badgeCls: 'bg-amber-100 text-amber-900 border-amber-300',
    };
  }
  return {
    status: 'unpaid',
    label: 'ממתין לתשלום',
    badgeCls: 'bg-red-100 text-red-800 border-red-300',
  };
}

export function buildSupplierInvoiceText(
  order: Order,
  supplier?: User | null,
  bizSettings?: BusinessSettings
): string {
  const bizName = bizSettings?.business_name || 'דוכן שישי תימני';
  const itemsSubtotal = order.items.reduce((s, it) => s + it.quantity * it.unit_price_snapshot, 0);
  const remaining = Math.max(0, order.total_amount - order.paid_amount);
  const payState = getPaymentVisualState(order);

  const lines: string[] = [
    `🧾 *${bizName} — פירוט חיוב / תעודת משלוח #${order.id}*`,
    `🏪 ספק: *${order.recipient_name}*`,
    ...(supplier?.phone ? [`📱 טלפון: ${supplier.phone}`] : []),
    `📅 תאריך משלוח: ${formatFridayLabel(order.friday_date)}`,
    `📌 סטטוס הזמנה: ${ORDER_STATUS_LABELS[order.status]}`,
    `━━━━━━━━━━━━━━━━`,
    `*פירוט פריטים:*`,
  ];

  for (const it of order.items) {
    const lineTotal = it.quantity * it.unit_price_snapshot;
    lines.push(
      `• ${it.product_name}: ${it.quantity} יח׳ × ${formatILS(it.unit_price_snapshot)} = *${formatILS(lineTotal)}*`
    );
  }

  lines.push(`━━━━━━━━━━━━━━━━`);
  lines.push(`סכום ביניים: ${formatILS(itemsSubtotal)}`);
  if (order.credit_discount > 0) {
    lines.push(
      `הנחה / זיכוי${order.discount_percent ? ` (${order.discount_percent}%)` : ''}: -${formatILS(order.credit_discount)}`
    );
  }
  if (order.delivery_fee > 0) {
    lines.push(`דמי משלוח: ${formatILS(order.delivery_fee)}`);
  }
  if (order.include_vat && (order.vat_amount ?? 0) > 0) {
    lines.push(`מע״מ (18%): ${formatILS(order.vat_amount ?? 0)}`);
  }
  lines.push(`💳 *סה״כ לתשלום: ${formatILS(order.total_amount)}*`);
  lines.push(`💰 סטטוס תשלום: *${payState.label}*`);
  if (order.paid_amount > 0 && remaining > 0.009) {
    lines.push(`✅ שולם עד כה: ${formatILS(order.paid_amount)} | ⏳ יתרה לתשלום: *${formatILS(remaining)}*`);
  }
  if (order.notes) {
    lines.push(`📝 הערות: ${order.notes}`);
  }
  if (bizSettings?.whatsapp_footer) {
    lines.push(`\n${bizSettings.whatsapp_footer}`);
  }
  return lines.join('\n');
}

export function SupplierInvoiceSheet({
  order,
  supplier,
  bizSettings,
  onClose,
}: SupplierInvoiceSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!order) return null;

  const bizName = bizSettings?.business_name || 'דוכן שישי תימני';
  const itemsSubtotal = order.items.reduce((s, it) => s + it.quantity * it.unit_price_snapshot, 0);
  const totalUnits = order.items.reduce((s, it) => s + it.quantity, 0);
  const remaining = Math.max(0, order.total_amount - order.paid_amount);
  const payState = getPaymentVisualState(order);

  const invoiceText = buildSupplierInvoiceText(order, supplier, bizSettings);
  const waUrl = buildWhatsAppShareUrl(invoiceText, supplier?.phone);
  const emailSubject = `${bizName} — פירוט הזמנה #${order.id} (${formatHebrewDate(order.friday_date)})`;
  const mailtoUrl = `mailto:${encodeURIComponent(supplier?.email || '')}?subject=${encodeURIComponent(
    emailSubject
  )}&body=${encodeURIComponent(invoiceText.replace(/\*/g, ''))}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(invoiceText.replace(/\*/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=820,height=920');
    if (!w) {
      window.print();
      return;
    }
    const rowsHtml = order.items
      .map(
        (it, idx) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;text-align:center;">${idx + 1}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;font-weight:700;">${it.product_name}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;text-align:center;">${it.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;text-align:left;direction:ltr;">${formatILS(it.unit_price_snapshot)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E5E7EB;text-align:left;direction:ltr;font-weight:700;">${formatILS(it.quantity * it.unit_price_snapshot)}</td>
      </tr>`
      )
      .join('');

    const badgeBg =
      payState.status === 'paid'
        ? '#DCFCE7;color:#166534;border:1px solid #86EFAC'
        : payState.status === 'partial'
        ? '#FEF3C7;color:#92400E;border:1px solid #FCD34D'
        : '#FEE2E2;color:#991B1B;border:1px solid #FCA5A5';

    w.document.write(`<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${emailSubject}</title>
  <style>
    body { font-family: Arial, 'Heebo', sans-serif; color: #1E242B; margin: 28px; direction: rtl; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #C85A17; padding-bottom: 16px; margin-bottom: 20px; }
    .brand { font-size: 26px; font-weight: 900; color: #8A330B; }
    .meta { font-size: 13px; color: #475569; line-height: 1.7; }
    .box { background: #FAF6F0; border: 1px solid #E8D5BE; border-radius: 12px; padding: 14px 16px; margin-bottom: 20px; display: flex; justify-content: space-between; gap: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
    th { background: #F3E9DC; padding: 10px 8px; border-bottom: 2px solid #D6B996; font-weight: 800; }
    .totals { width: 320px; margin-right: auto; border: 1px solid #E8D5BE; border-radius: 12px; padding: 14px 16px; background: #FDFBF7; font-size: 14px; }
    .tot-row { display: flex; justify-content: space-between; padding: 5px 0; }
    .grand { border-top: 2px solid #1E242B; margin-top: 8px; padding-top: 10px; font-size: 18px; font-weight: 900; color: #1E242B; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 800; background: ${badgeBg}; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 12px; color: #64748B; text-align: center; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">${bizName}</div>
      <div class="meta">פירוט הזמנה / תעודת חיוב ספק #${order.id}</div>
      ${bizSettings?.admin_whatsapp_phone ? `<div class="meta">טלפון: ${bizSettings.admin_whatsapp_phone}</div>` : ''}
    </div>
    <div style="text-align:left;">
      <div class="badge">${payState.label}</div>
      <div class="meta" style="margin-top:6px;">תאריך משלוח: <strong>${formatHebrewDate(order.friday_date)}</strong></div>
      <div class="meta">סטטוס: ${ORDER_STATUS_LABELS[order.status]}</div>
    </div>
  </div>

  <div class="box">
    <div>
      <div style="font-size:12px;color:#64748B;font-weight:700;">לכבוד הספק</div>
      <div style="font-size:18px;font-weight:800;margin-top:2px;">${order.recipient_name}</div>
      ${supplier?.phone ? `<div class="meta">טלפון: ${supplier.phone}</div>` : ''}
      ${supplier?.email ? `<div class="meta">מייל: ${supplier.email}</div>` : ''}
    </div>
    <div style="text-align:left;">
      <div style="font-size:12px;color:#64748B;font-weight:700;">סה״כ יחידות</div>
      <div style="font-size:20px;font-weight:900;color:#8A330B;">${totalUnits}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center;">#</th>
        <th style="text-align:right;">תיאור הפריט</th>
        <th style="width:80px;text-align:center;">כמות</th>
        <th style="width:110px;text-align:left;">מחיר ליח׳</th>
        <th style="width:120px;text-align:left;">סה״כ</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="tot-row"><span>סכום ביניים:</span><span style="direction:ltr;">${formatILS(itemsSubtotal)}</span></div>
    ${order.credit_discount > 0 ? `<div class="tot-row" style="color:#047857;"><span>הנחה / זיכוי${order.discount_percent ? ` (${order.discount_percent}%)` : ''}:</span><span style="direction:ltr;">-${formatILS(order.credit_discount)}</span></div>` : ''}
    ${order.delivery_fee > 0 ? `<div class="tot-row"><span>דמי משלוח:</span><span style="direction:ltr;">${formatILS(order.delivery_fee)}</span></div>` : ''}
    ${order.include_vat && (order.vat_amount ?? 0) > 0 ? `<div class="tot-row"><span>מע״מ (18%):</span><span style="direction:ltr;">${formatILS(order.vat_amount ?? 0)}</span></div>` : ''}
    <div class="tot-row grand"><span>סה״כ לתשלום:</span><span style="direction:ltr;">${formatILS(order.total_amount)}</span></div>
    ${order.paid_amount > 0 ? `<div class="tot-row" style="color:#047857;margin-top:6px;"><span>שולם:</span><span style="direction:ltr;">${formatILS(order.paid_amount)}</span></div>` : ''}
    ${remaining > 0.009 ? `<div class="tot-row" style="color:#B91C1C;font-weight:800;"><span>יתרה לתשלום:</span><span style="direction:ltr;">${formatILS(remaining)}</span></div>` : ''}
  </div>

  ${order.notes ? `<div style="margin-top:16px;font-size:13px;background:#FFFBEB;border:1px solid #FDE68A;padding:10px 14px;border-radius:10px;"><strong>הערות:</strong> ${order.notes}</div>` : ''}
  <div class="footer">${bizSettings?.whatsapp_footer || bizName}</div>
</body>
</html>`);
    w.document.close();
    w.focus();
    setTimeout(() => {
      w.print();
    }, 250);
  };

  return (
    <BottomSheet
      open={Boolean(order)}
      onClose={onClose}
      title={`חשבונית / פירוט הזמנה #${order.id}`}
      subtitle={`${order.recipient_name} · ${formatFridayLabel(order.friday_date)}`}
      maxWidthClass="md:max-w-2xl"
    >
      <div className="space-y-4">
        {/* כפתורי פעולה מהירים: הדפסה / וואטסאפ / מייל / העתקה */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[48px] px-3 rounded-xl bg-[#1E242B] hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Printer className="w-4 h-4 shrink-0" />
            <span>הדפס / PDF</span>
          </button>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            <span>שלח בוואטסאפ</span>
          </a>
          <a
            href={mailtoUrl}
            className="min-h-[48px] px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Mail className="w-4 h-4 shrink-0" />
            <span>שלח במייל</span>
          </a>
          <button
            type="button"
            onClick={handleCopy}
            className="min-h-[48px] px-3 rounded-xl bg-[#FAF6F0] hover:bg-[#F3E9DC] border border-[#E8D5BE] text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
            <span>{copied ? 'הועתק!' : 'העתק טקסט'}</span>
          </button>
        </div>

        {/* תצוגת החשבונית המסודרת */}
        <div className="bg-white rounded-2xl border-2 border-[#E8D5BE] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2 pb-3 border-b-2 border-[#C85A17]/30">
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#C85A17]" />
                <span className="font-serif text-xl font-extrabold text-[#8A330B]">{bizName}</span>
              </div>
              <div className="text-xs text-slate-500 mt-1">
                לכבוד: <strong className="text-slate-900">{order.recipient_name}</strong>
                {supplier?.phone && <span className="mr-2 tabular-nums">· {supplier.phone}</span>}
              </div>
            </div>
            <div className="text-left space-y-1">
              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-extrabold border ${payState.badgeCls}`}>
                {payState.label}
              </span>
              <div className="text-[11px] text-slate-500 tabular-nums">
                הזמנה #{order.id} · {formatHebrewDate(order.friday_date)}
              </div>
            </div>
          </div>

          {/* פירוט פריטים (כרטיסים קומפקטיים במובייל / שורות נקיות) */}
          <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-xl overflow-hidden tabular-nums text-sm">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[#F3E9DC]/70 text-[11px] font-extrabold text-slate-700">
              <div className="col-span-5">פריט</div>
              <div className="col-span-2 text-center">כמות</div>
              <div className="col-span-2 text-left">מחיר</div>
              <div className="col-span-3 text-left">סה״כ</div>
            </div>
            {order.items.map((it) => (
              <div key={it.id} className="grid grid-cols-12 gap-2 px-3 py-2.5 items-center bg-white">
                <div className="col-span-5 font-bold text-slate-900 text-xs sm:text-sm truncate">
                  {it.product_name}
                </div>
                <div className="col-span-2 text-center font-extrabold text-[#C85A17] text-xs sm:text-sm">
                  {it.quantity}
                </div>
                <div className="col-span-2 text-left text-slate-600 text-xs" dir="ltr">
                  {formatILS(it.unit_price_snapshot)}
                </div>
                <div className="col-span-3 text-left font-extrabold text-slate-900 text-xs sm:text-sm" dir="ltr">
                  {formatILS(it.quantity * it.unit_price_snapshot)}
                </div>
              </div>
            ))}
          </div>

          {/* סיכום כספי */}
          <div className="bg-[#FAF6F0] rounded-2xl p-4 border border-[#E8D5BE] space-y-1.5 text-sm tabular-nums">
            <div className="flex justify-between text-slate-600">
              <span>סכום ביניים ({totalUnits} יח׳):</span>
              <span className="font-semibold">{formatILS(itemsSubtotal)}</span>
            </div>
            {order.credit_discount > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>הנחה / זיכוי{order.discount_percent ? ` (${order.discount_percent}%)` : ''}:</span>
                <span>-{formatILS(order.credit_discount)}</span>
              </div>
            )}
            {order.delivery_fee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>דמי משלוח:</span>
                <span className="font-semibold">{formatILS(order.delivery_fee)}</span>
              </div>
            )}
            {order.include_vat && (order.vat_amount ?? 0) > 0 && (
              <div className="flex justify-between text-slate-700 font-semibold">
                <span>מע״מ (18%):</span>
                <span>{formatILS(order.vat_amount ?? 0)}</span>
              </div>
            )}
            <div className="pt-2 mt-1 border-t-2 border-[#E8D5BE] flex justify-between items-center text-lg font-extrabold text-slate-900">
              <span>סה״כ לתשלום:</span>
              <span className="text-[#C85A17]">{formatILS(order.total_amount)}</span>
            </div>
            {order.paid_amount > 0 && (
              <div className="flex justify-between text-xs font-bold text-emerald-700 pt-1">
                <span>שולם עד כה:</span>
                <span>{formatILS(order.paid_amount)}</span>
              </div>
            )}
            {remaining > 0.009 && (
              <div className="flex justify-between text-xs font-extrabold text-red-700">
                <span>יתרה לתשלום:</span>
                <span>{formatILS(remaining)}</span>
              </div>
            )}
          </div>

          {order.notes && (
            <div className="text-xs text-amber-950 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <strong>הערות:</strong> {order.notes}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
