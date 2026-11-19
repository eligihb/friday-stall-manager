import React, { useState } from 'react';
import {
  CreditCard,
  Share2,
  Copy,
  Check,
  Edit3,
  Trash2,
  BookOpen,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { formatFridayLabel, formatILS, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from '../lib/format';
import { buildWhatsAppShareUrl, formatOrderWhatsApp } from '../lib/whatsappFormat';
import { getPaymentVisualState } from './SupplierInvoiceSheet';
import type { BusinessSettings, Order, OrderStatus, OrderType } from '../types';

const STATUS_STAGES: Array<{ key: OrderStatus; label: string; activeCls: string }> = [
  { key: 'pending', label: 'ממתין', activeCls: 'bg-slate-800 text-white border-slate-800' },
  { key: 'received', label: 'התקבל', activeCls: 'bg-sky-600 text-white border-sky-600' },
  { key: 'ready', label: 'מוכן למסירה', activeCls: 'bg-amber-600 text-white border-amber-600' },
  { key: 'delivered', label: 'נמסר', activeCls: 'bg-emerald-600 text-white border-emerald-600' },
];

interface OrderCardProps {
  order: Order;
  bizSettings?: BusinessSettings;
  showFridayDate?: boolean;
  onCycleStatus: (order: Order, nextStatus: OrderStatus) => void;
  onQuickPay?: (order: Order) => void;
  onOpenInvoice?: (order: Order) => void;
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
  onOpenInvoice,
  onEdit,
  onDelete,
  onOpenLedger,
}: OrderCardProps) {
  const [copied, setCopied] = useState(false);

  const unpaid = Math.max(0, order.total_amount - order.paid_amount);
  const isCharity = order.order_type === 'charity';
  const payState = getPaymentVisualState(order);

  const typeBadgeCls = (t: OrderType) => {
    if (t === 'supplier') return 'bg-orange-100 text-[#8A330B]';
    if (t === 'charity') return 'bg-purple-100 text-purple-800';
    return 'bg-sky-100 text-sky-800';
  };

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
          ? 'border-emerald-200 bg-emerald-50/15'
          : order.status === 'ready'
          ? 'border-amber-300'
          : order.status === 'received'
          ? 'border-sky-300'
          : 'border-[#E8D5BE]/85'
      }`}
    >
      <div>
        {/* כותרת הכרטיסייה */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-base text-slate-900 truncate">{order.recipient_name}</span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${typeBadgeCls(order.order_type)}`}>
                {order.order_type === 'charity' ? 'מסובסד' : ORDER_TYPE_LABELS[order.order_type]}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 tabular-nums flex items-center gap-1.5 flex-wrap">
              <span>#{order.id}</span>
              {showFridayDate && <span>· {formatFridayLabel(order.friday_date)}</span>}
              <span className="font-semibold text-slate-700">· {ORDER_STATUS_LABELS[order.status]}</span>
            </div>
          </div>

          {/* סכום + תגית תשלום צבעונית ברורה (אדום ממתין לתשלום / כתום חלקי / ירוק שולם הכל) */}
          <div className="text-left shrink-0 tabular-nums space-y-1">
            <div className="font-extrabold text-lg text-slate-900 leading-tight">
              {isCharity ? '₪0.00' : formatILS(order.total_amount)}
            </div>
            {!isCharity ? (
              <div className="flex flex-col items-end gap-0.5">
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${payState.badgeCls}`}
                >
                  {payState.label}
                </span>
                {payState.status === 'partial' && (
                  <span className="text-[10px] font-bold text-amber-900">
                    שולם {formatILS(order.paid_amount)} · נותר {formatILS(unpaid)}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-[11px] font-bold text-purple-800">
                עלות {formatILS(order.estimated_cost ?? 0)}
              </div>
            )}
          </div>
        </div>

        {/* תגיות פריטים קומפקטיות */}
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

      {/* סרגל 4 שלבי סטטוס הזמנה בלחיצה ישירה: ממתין | התקבל | מוכן למסירה | נמסר */}
      <div className="mt-3.5 pt-3 border-t border-[#F3E9DC] space-y-2.5">
        {order.status === 'awaiting_approval' ? (
          <button
            type="button"
            onClick={() => onCycleStatus(order, 'received')}
            className="w-full min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>אשר הזמנה (העבר ל״התקבל״)</span>
          </button>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {STATUS_STAGES.map((st) => {
              const active = order.status === st.key;
              return (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => onCycleStatus(order, st.key)}
                  className={`min-h-[42px] px-1 rounded-xl border text-[11px] font-extrabold leading-tight transition-all active:scale-[0.97] ${
                    active
                      ? `${st.activeCls} shadow-sm`
                      : 'bg-[#FAF6F0] text-slate-600 border-[#E8D5BE] hover:bg-[#F3E9DC]'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>
        )}

        {/* שורת פעולות: תשלום + חשבונית (לספק) + וואטסאפ */}
        <div className="flex items-center gap-2">
          {!isCharity && onQuickPay && (
            <button
              type="button"
              onClick={() => onQuickPay(order)}
              className={`flex-1 min-h-[48px] px-2.5 rounded-xl active:scale-[0.98] text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-transform ${
                payState.status === 'paid'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : payState.status === 'partial'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span className="truncate">
                {payState.status === 'paid'
                  ? 'שולם ✓'
                  : payState.status === 'partial'
                  ? 'השלם תשלום'
                  : 'סמן תשלום'}
              </span>
            </button>
          )}

          {order.order_type === 'supplier' && onOpenInvoice && (
            <button
              type="button"
              onClick={() => onOpenInvoice(order)}
              className="min-h-[48px] px-3 rounded-xl bg-[#1E242B] hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0"
              title="תצוגת חשבונית והדפסה"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>חשבונית</span>
            </button>
          )}

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-900 text-xs font-extrabold flex items-center justify-center gap-1 shrink-0 active:scale-[0.98]"
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
            className="inline-flex items-center gap-1 py-1.5 px-2 rounded-lg hover:bg-[#FAF6F0] font-semibold"
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
