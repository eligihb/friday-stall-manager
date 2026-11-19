import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  Truck,
  CreditCard,
  Share2,
  Copy,
  Check,
  Edit3,
  Trash2,
  BookOpen,
} from 'lucide-react';
import { formatFridayLabel, formatILS, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from '../lib/format';
import { buildWhatsAppShareUrl, formatOrderWhatsApp } from '../lib/whatsappFormat';
import type { BusinessSettings, Order, OrderStatus, OrderType } from '../types';

const NEXT_STATUS: Record<OrderStatus, OrderStatus> = {
  awaiting_approval: 'pending',
  pending: 'ready',
  ready: 'delivered',
  delivered: 'pending',
};

interface OrderCardProps {
  order: Order;
  bizSettings?: BusinessSettings;
  showFridayDate?: boolean;
  onCycleStatus: (order: Order, nextStatus: OrderStatus) => void;
  onQuickPay?: (order: Order) => void;
  onEdit?: (order: Order) => void;
  onDelete?: (orderId: number) => void;
  onOpenLedger?: (userId: number) => void;
}

export function OrderCard({
  order,
  bizSettings,
  showFridayDate = false,
  onCycleStatus,
  onQuickPay,
  onEdit,
  onDelete,
  onOpenLedger,
}: OrderCardProps) {
  const [copied, setCopied] = useState(false);

  const unpaid = Math.max(0, order.total_amount - order.paid_amount);
  const isCharity = order.order_type === 'charity';
  const nextStatus = NEXT_STATUS[order.status];

  const typeBadgeCls = (t: OrderType) => {
    if (t === 'supplier') return 'bg-orange-100 text-[#8A330B]';
    if (t === 'charity') return 'bg-purple-100 text-purple-800';
    return 'bg-sky-100 text-sky-800';
  };

  const statusMeta = (st: OrderStatus) => {
    if (st === 'awaiting_approval')
      return {
        cls: 'bg-red-50 text-red-800 border-red-300',
        label: 'אשר הזמנה',
        icon: CheckCircle2,
      };
    if (st === 'delivered')
      return {
        cls: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        label: 'נמסר ✓',
        icon: Truck,
      };
    if (st === 'ready')
      return {
        cls: 'bg-amber-100 text-amber-900 border-amber-300',
        label: 'מוכן ← נמסר',
        icon: CheckCircle2,
      };
    return {
      cls: 'bg-slate-100 text-slate-800 border-slate-300',
      label: 'ממתין ← מוכן',
      icon: Clock,
    };
  };

  const sm = statusMeta(order.status);
  const StatusIcon = sm.icon;
  const waText = formatOrderWhatsApp(order, bizSettings);
  const waUrl = buildWhatsAppShareUrl(waText);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(waText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className={`bg-white rounded-2xl border shadow-soft p-4 flex flex-col justify-between transition-all ${
        order.status === 'delivered'
          ? 'border-emerald-200 bg-emerald-50/20'
          : order.status === 'ready'
          ? 'border-amber-300'
          : 'border-[#E8D5BE]/85'
      }`}
    >
      <div>
        {/* כותרת הכרטיסייה */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-slate-900 truncate">{order.recipient_name}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${typeBadgeCls(order.order_type)}`}>
                {order.order_type === 'charity' ? 'תרומה' : ORDER_TYPE_LABELS[order.order_type]}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 tabular-nums flex items-center gap-2 flex-wrap">
              <span>#{order.id}</span>
              {showFridayDate && <span>· {formatFridayLabel(order.friday_date)}</span>}
              <span className="font-semibold text-slate-600">· {ORDER_STATUS_LABELS[order.status]}</span>
            </div>
          </div>

          <div className="text-left shrink-0 tabular-nums">
            <div className="font-extrabold text-lg text-slate-900 leading-tight">
              {isCharity ? '₪0.00' : formatILS(order.total_amount)}
            </div>
            {!isCharity ? (
              <div
                className={`text-[11px] font-extrabold mt-0.5 ${
                  unpaid > 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                {unpaid > 0 ? `נותר ${formatILS(unpaid)}` : 'שולם ✓'}
              </div>
            ) : (
              <div className="text-[11px] font-bold text-purple-800 mt-0.5">
                עלות {formatILS(order.estimated_cost ?? 0)}
              </div>
            )}
          </div>
        </div>

        {/* תגיות פריטים קומפקטיות (Pill Tags) */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {order.items.map((it) => (
            <span
              key={it.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] text-xs font-bold text-slate-800 tabular-nums"
            >
              <span className="text-[#C85A17] font-extrabold">{it.quantity}</span>
              <span>{it.product_name}</span>
            </span>
          ))}
        </div>

        {(order.delivery_fee > 0 || order.credit_discount > 0 || order.include_vat || order.notes) && (
          <div className="mt-2.5 space-y-1 text-xs">
            {(order.delivery_fee > 0 || order.credit_discount > 0 || order.include_vat) && (
              <div className="flex flex-wrap gap-3 text-slate-500 tabular-nums">
                {order.delivery_fee > 0 && <span>משלוח: {formatILS(order.delivery_fee)}</span>}
                {order.credit_discount > 0 && (
                  <span className="text-emerald-700 font-semibold">
                    הנחה/זכות: -{formatILS(order.credit_discount)}
                  </span>
                )}
                {order.include_vat && (order.vat_amount ?? 0) > 0 && (
                  <span className="text-slate-700 font-semibold">
                    כולל מע״מ 18% ({formatILS(order.vat_amount ?? 0)})
                  </span>
                )}
              </div>
            )}
            {order.notes && (
              <p className="text-amber-950 bg-amber-50/80 rounded-xl px-3 py-1.5">{order.notes}</p>
            )}
          </div>
        )}
      </div>

      {/* שורת פעולות מותאמת לאגודל */}
      <div className="mt-3.5 pt-3 border-t border-[#F3E9DC] space-y-2">
        <div className="grid grid-cols-12 gap-2">
          {/* כפתור החלפת סטטוס בלחיצה אחת */}
          <button
            type="button"
            onClick={() => onCycleStatus(order, nextStatus)}
            className={`${
              !isCharity && onQuickPay ? 'col-span-5' : 'col-span-8'
            } min-h-[44px] px-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform ${
              sm.cls
            }`}
          >
            <StatusIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">{sm.label}</span>
          </button>

          {/* כפתור סמן כשולם מהיר */}
          {!isCharity && onQuickPay && (
            <button
              type="button"
              onClick={() => onQuickPay(order)}
              className="col-span-4 min-h-[44px] px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-extrabold flex items-center justify-center gap-1 shadow-sm transition-transform"
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span className="truncate">{unpaid > 0 ? 'סמן כשולם' : 'תשלום'}</span>
            </button>
          )}

          {/* שיתוף וואטסאפ ישיר (wa.me) */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-3 min-h-[44px] px-2 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-900 text-xs font-extrabold flex items-center justify-center gap-1 active:scale-[0.98]"
            title="שלח בוואטסאפ"
          >
            <Share2 className="w-4 h-4 text-[#128C7E] shrink-0" />
            <span className="hidden sm:inline">וואטסאפ</span>
          </a>
        </div>

        {/* שורת כלים משנית קטנה (העתקה / עריכה / כרטסת / מחיקה) */}
        <div className="flex items-center justify-between pt-0.5 text-xs text-slate-500">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-[#FAF6F0] font-semibold"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'הועתק!' : 'העתק טקסט'}</span>
          </button>

          <div className="flex items-center gap-1">
            {order.user_id && onOpenLedger && (
              <button
                type="button"
                onClick={() => onOpenLedger(order.user_id!)}
                className="p-2 rounded-lg hover:bg-[#FFF7ED] hover:text-[#C85A17]"
                title="כרטסת לקוח"
              >
                <BookOpen className="w-4 h-4" />
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(order)}
                className="p-2 rounded-lg hover:bg-slate-100 hover:text-slate-900"
                title="ערוך הזמנה"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(order.id)}
                className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600"
                title="מחק הזמנה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
