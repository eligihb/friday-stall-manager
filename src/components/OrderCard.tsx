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
  Link2,
  XCircle,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  computeEffectiveOrderTotal,
  formatFridayLabel,
  formatILS,
  isOrderPrepayPendingVerification,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
} from '../lib/format';
import { buildCustomerPortalUrl, buildWhatsAppShareUrl, formatOrderWhatsApp } from '../lib/whatsappFormat';
import { getOrderPaymentMeta } from '../lib/paymentMeta';
import { useContactDrawer } from '../context/ContactDrawerContext';
import { getPaymentVisualState } from './SupplierInvoiceSheet';
import type { BusinessSettings, Order, OrderStatus, OrderType } from '../types';

const STATUS_STAGES: Array<{ key: OrderStatus; label: string; activeCls: string; barCls: string; step: number }> = [
  { key: 'pending', label: 'ממתין', activeCls: 'bg-red-600 text-white border-red-600', barCls: 'bg-red-600', step: 1 },
  { key: 'received', label: 'התקבל', activeCls: 'bg-blue-600 text-white border-blue-600', barCls: 'bg-blue-600', step: 2 },
  { key: 'ready', label: 'מוכן למסירה', activeCls: 'bg-orange-500 text-white border-orange-500', barCls: 'bg-orange-500', step: 3 },
  { key: 'delivered', label: 'נמסר', activeCls: 'bg-emerald-600 text-white border-emerald-600', barCls: 'bg-emerald-600', step: 4 },
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
  onPermanentDelete?: (orderId: number) => void;
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
  onPermanentDelete,
  onOpenLedger,
}: OrderCardProps) {
  const { openContactById } = useContactDrawer();
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [approvedNotice, setApprovedNotice] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmPermanentDeleteOpen, setConfirmPermanentDeleteOpen] = useState(false);
  const isInactiveOrder = order.status === 'cancelled' || order.status === 'deleted_by_vendor';
  const [deleting, setDeleting] = useState(false);
  const paymentMeta = getOrderPaymentMeta(order.id);
  const prepayPendingVerify = isOrderPrepayPendingVerification(order);
  const isPendingStatus = order.status === 'pending' || order.status === 'awaiting_approval';
  const effectiveTotal = computeEffectiveOrderTotal(order);
  const hasCustomerEditDiff = Boolean(
    order.last_edited_by_customer_at &&
      order.previous_items &&
      order.previous_items.length > 0
  );

  // חישוב מדויק של מה שנוסף, הוסר או השתנה בכמויות לעומת ההזמנה הקודמת
  const customerEditDiff = React.useMemo(() => {
    if (!hasCustomerEditDiff || !order.previous_items) return null;
    const prevMap = new Map<number, { name: string; qty: number; price: number }>();
    for (const pit of order.previous_items) {
      const existing = prevMap.get(pit.product_id);
      prevMap.set(pit.product_id, {
        name: pit.product_name,
        qty: (existing?.qty || 0) + pit.quantity,
        price: pit.unit_price,
      });
    }
    const currMap = new Map<number, { name: string; qty: number; price: number }>();
    for (const cit of order.items) {
      const existing = currMap.get(cit.product_id);
      currMap.set(cit.product_id, {
        name: cit.product_name,
        qty: (existing?.qty || 0) + cit.quantity,
        price: cit.unit_price_snapshot,
      });
    }

    const added: Array<{ name: string; qty: number }> = [];
    const removed: Array<{ name: string; qty: number }> = [];
    const changed: Array<{ name: string; oldQty: number; newQty: number }> = [];

    for (const [pid, curr] of currMap.entries()) {
      const prev = prevMap.get(pid);
      if (!prev) {
        added.push({ name: curr.name, qty: curr.qty });
      } else if (prev.qty !== curr.qty) {
        changed.push({ name: curr.name, oldQty: prev.qty, newQty: curr.qty });
      }
    }
    for (const [pid, prev] of prevMap.entries()) {
      if (!currMap.has(pid)) {
        removed.push({ name: prev.name, qty: prev.qty });
      }
    }

    const prevTotal =
      typeof order.previous_total === 'number' && order.previous_total > 0
        ? order.previous_total
        : order.previous_items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
    const totalDiff = Math.round((effectiveTotal - prevTotal) * 100) / 100;

    return { added, removed, changed, prevTotal, totalDiff };
  }, [hasCustomerEditDiff, order.previous_items, order.previous_total, order.items, effectiveTotal]);

  const triggerApproveOrder = () => {
    onCycleStatus(order, 'received');
    setApprovedNotice(true);
    setTimeout(() => setApprovedNotice(false), 2600);
  };

  const handleCardBodyClick = () => {
    if (isPendingStatus) {
      triggerApproveOrder();
    } else if (onEdit) {
      onEdit(order);
    }
  };

  const getNextAndPrevStage = (
    status: OrderStatus
  ): {
    nextStatus: OrderStatus | null;
    nextLabel: string;
    nextBtnCls: string;
    prevStatus: OrderStatus | null;
  } => {
    if (status === 'pending' || status === 'awaiting_approval') {
      return {
        nextStatus: 'received',
        nextLabel: 'אשר הזמנה',
        nextBtnCls: 'bg-blue-600 hover:bg-blue-700 text-white',
        prevStatus: null,
      };
    }
    if (status === 'received') {
      return {
        nextStatus: 'ready',
        nextLabel: 'מוכן למסירה',
        nextBtnCls: 'bg-orange-500 hover:bg-orange-600 text-white',
        prevStatus: 'pending',
      };
    }
    if (status === 'ready') {
      return {
        nextStatus: 'delivered',
        nextLabel: 'סמן כנמסר',
        nextBtnCls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        prevStatus: 'received',
      };
    }
    if (status === 'delivered') {
      return {
        nextStatus: null,
        nextLabel: 'נמסר ללקוח ✓',
        nextBtnCls: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
        prevStatus: 'ready',
      };
    }
    return {
      nextStatus: null,
      nextLabel: '',
      nextBtnCls: '',
      prevStatus: null,
    };
  };

  const stageFlow = getNextAndPrevStage(order.status);
  const paidMethodDisplay = paymentMeta?.methodLabel || 'מלא';

  const handleCopyCustomerLink = async () => {
    if (!order.user_id) return;
    const base = buildCustomerPortalUrl(order.user_id);
    const targetUrl =
      order.order_type === 'supplier' ? base.replace(/#\/c\//, '#/s/') : base;
    await navigator.clipboard.writeText(targetUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

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
      onClick={handleCardBodyClick}
      title={isPendingStatus ? 'לחץ על הכרטיס לאישור מהיר של ההזמנה' : undefined}
      className={`bg-white rounded-2xl border shadow-soft p-4 flex flex-col justify-between transition-all ${
        isPendingStatus ? 'cursor-pointer hover:border-blue-400' : ''
      } ${
        isInactiveOrder
          ? 'border-slate-300 bg-slate-100/80 opacity-75 grayscale'
          : order.status === 'cancel_requested'
          ? 'border-orange-400 bg-orange-50/30 ring-1 ring-orange-300'
          : order.status === 'delivered'
          ? 'border-emerald-200 bg-emerald-50/15'
          : order.status === 'ready'
          ? 'border-amber-300'
          : order.status === 'received'
          ? 'border-sky-300'
          : 'border-[#E8D5BE]/85'
      }`}
    >
      <div>
        {approvedNotice && (
          <div className="mb-2.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm animate-pulse">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>ההזמנה אושרה ✓</span>
          </div>
        )}

        {/* כותרת הכרטיסייה — לחיצה על שם לקוח פותחת כרטסת, לחיצה על גוף ההזמנה במצב ממתין מאשרת מיד */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {order.user_id ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openContactById(order.user_id!);
                  }}
                  className="font-bold text-base text-slate-900 hover:text-[#C85A17] hover:underline truncate text-right"
                  title="פתח וערוך כרטיס לקוח/ספק"
                >
                  {order.recipient_name}
                </button>
              ) : (
                <span className="font-bold text-base text-slate-900 truncate">{order.recipient_name}</span>
              )}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${typeBadgeCls(order.order_type)}`}>
                {order.order_type === 'charity' ? 'מסובסד' : ORDER_TYPE_LABELS[order.order_type]}
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 tabular-nums flex items-center gap-1.5 flex-wrap">
              <span>#{order.id}</span>
              {showFridayDate && <span>· {formatFridayLabel(order.friday_date)}</span>}
              <span className="font-semibold text-slate-700">· {ORDER_STATUS_LABELS[order.status]}</span>
              {isPendingStatus && (
                <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-md">
                  לחץ לאישור מהיר
                </span>
              )}
            </div>
          </div>

          {/* סכום + תגית תשלום לחיצה הפותחת חלונית אישור תשלום */}
          <div className="text-left shrink-0 tabular-nums space-y-1">
            <div className="font-extrabold text-lg text-slate-900 leading-tight">
              {isCharity || isInactiveOrder ? '₪0.00' : formatILS(effectiveTotal)}
            </div>
            {!isCharity && !isInactiveOrder ? (
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickPay?.(order);
                  }}
                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold border transition-transform hover:scale-105 ${
                    prepayPendingVerify
                      ? 'bg-orange-100 text-orange-950 border-orange-400'
                      : payState.badgeCls
                  }`}
                >
                  {payState.status === 'paid'
                    ? `✅ שולם (${paidMethodDisplay})`
                    : payState.status === 'partial'
                    ? 'שולם חלקית'
                    : prepayPendingVerify
                    ? '⏳ ממתין לאימות תשלום'
                    : 'לא שולם'}
                </button>
                {payState.status === 'partial' && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-950">
                    שולם חלקית: {formatILS(order.paid_amount)} מתוך {formatILS(effectiveTotal)}
                  </span>
                )}
                {order.paid_amount > 0 && paymentMeta && (
                  <span className="text-[10px] font-bold text-slate-500">
                    {paymentMeta.methodLabel} · {paymentMeta.paidTime}
                  </span>
                )}
              </div>
            ) : isInactiveOrder ? (
              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-200 text-slate-700 border border-slate-300">
                {order.status === 'deleted_by_vendor'
                  ? '🗑️ בסל מחזור'
                  : order.cancelled_by === 'customer'
                  ? 'בוטלה ע"י הלקוח'
                  : 'בוטלה ע"י המוכר'}
              </span>
            ) : (
              <div className="text-[11px] font-bold text-purple-800">
                עלות {formatILS(order.estimated_cost ?? 0)}
              </div>
            )}
          </div>
        </div>

        {/* סרגל התקדמות ויזואלי 4 שלבים */}
        {order.status !== 'cancel_requested' &&
          !isInactiveOrder &&
          (() => {
            const normalizedKey: OrderStatus =
              order.status === 'awaiting_approval' ? 'pending' : order.status;
            const currentStage =
              STATUS_STAGES.find((s) => s.key === normalizedKey) || STATUS_STAGES[0];
            return (
              <div className="mt-2.5">
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex gap-0.5">
                  {STATUS_STAGES.map((st) => (
                    <div
                      key={st.key}
                      className={`flex-1 h-full transition-colors ${
                        st.step <= currentStage.step ? currentStage.barCls : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

        {/* תגית עודכן ע"י הלקוח + כפתור הצג שינויים */}
        {hasCustomerEditDiff && customerEditDiff && order.status !== 'cancelled' && (
          <div
            className="mt-2.5 p-2.5 rounded-xl bg-blue-50 border border-blue-200 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-blue-900">
                ✏️ עודכן ע&quot;י הלקוח
              </span>
              <button
                type="button"
                onClick={() => setShowChanges((v) => !v)}
                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-extrabold transition-colors"
              >
                {showChanges ? 'הסתר שינויים' : 'הצג שינויים'}
              </button>
            </div>

            {showChanges && (
              <div className="pt-2 border-t border-blue-200/80 space-y-1.5 text-xs">
                {customerEditDiff.added.map((it, idx) => (
                  <div key={`add-${idx}`} className="text-emerald-800 font-bold">
                    ➕ נוסף: {it.qty}× {it.name}
                  </div>
                ))}
                {customerEditDiff.removed.map((it, idx) => (
                  <div key={`rem-${idx}`} className="text-red-700 font-bold line-through">
                    ➖ הוסר: {it.qty}× {it.name}
                  </div>
                ))}
                {customerEditDiff.changed.map((it, idx) => (
                  <div key={`chg-${idx}`} className="text-amber-900 font-bold">
                    🔄 שונה: {it.name} ({it.oldQty} ← {it.newQty})
                  </div>
                ))}
                {customerEditDiff.added.length === 0 &&
                  customerEditDiff.removed.length === 0 &&
                  customerEditDiff.changed.length === 0 && (
                    <div className="text-slate-600 font-semibold">עודכנו הערות או פרטי הזמנה</div>
                  )}
                <div className="pt-1.5 border-t border-blue-200/60 flex items-center justify-between text-[11px] font-extrabold tabular-nums">
                  <span className="text-slate-600">
                    סה״כ קודם: {formatILS(customerEditDiff.prevTotal)} ← חדש: {formatILS(effectiveTotal)}
                  </span>
                  <span
                    className={
                      customerEditDiff.totalDiff > 0
                        ? 'text-emerald-700'
                        : customerEditDiff.totalDiff < 0
                        ? 'text-red-700'
                        : 'text-slate-600'
                    }
                  >
                    ({customerEditDiff.totalDiff >= 0 ? '+' : ''}
                    {formatILS(customerEditDiff.totalDiff)})
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

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

      {/* כפתור פעולה ראשי לשלב הבא + כפתור חרטה קומפקטי (↩️ חזור שלב) */}
      <div
        className="mt-3.5 pt-3 border-t border-[#F3E9DC] space-y-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        {order.status === 'cancel_requested' ? (
          <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-300 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-orange-900">
              <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
              <span>הלקוח ביקש לבטל הזמנה זו — נדרש אישור מוכר</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onCycleStatus(order, 'cancelled')}
                className="min-h-[42px] px-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4 shrink-0" />
                <span>אשר ביטול הזמנה</span>
              </button>
              <button
                type="button"
                onClick={() => onCycleStatus(order, 'received')}
                className="min-h-[42px] px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>דחה ביטול</span>
              </button>
            </div>
          </div>
        ) : order.status === 'deleted_by_vendor' ? (
          <div className="p-3 rounded-xl bg-slate-200/80 border border-slate-300 space-y-2.5">
            <div className="text-xs font-extrabold text-slate-700">
              🗑️ הזמנה זו הועברה לסל המחזור (״הזמנות שנמחקו״) ואינה פעילה.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onCycleStatus(order, order.pre_cancel_status || 'pending')}
                className="py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-400 text-xs font-extrabold text-slate-800 shadow-sm"
              >
                ↩️ שחזר הזמנה
              </button>
              {onPermanentDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmPermanentDeleteOpen(true)}
                  className="py-2 px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold shadow-sm"
                >
                  ❌ מחק סופית מהמערכת
                </button>
              )}
            </div>
          </div>
        ) : order.status === 'cancelled' ? (
          <div className="p-3 rounded-xl bg-slate-200/80 border border-slate-300 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-extrabold text-slate-700">
                ❌ {order.cancelled_by === 'customer' ? 'בוטלה ע"י הלקוח' : 'בוטלה ע"י המוכר'} (לא נספרת בהכנסות ורכש)
              </span>
              <button
                type="button"
                onClick={() => onCycleStatus(order, order.pre_cancel_status || 'pending')}
                className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-400 text-xs font-extrabold text-slate-800 shadow-sm"
              >
                ↩️ שחזר הזמנה
              </button>
            </div>
            {onDelete && (
              <div className="pt-1 border-t border-slate-300/70 flex justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(true)}
                  className="text-[11px] font-bold text-slate-500 hover:text-red-600 inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>מחק לצמיתות</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {stageFlow.nextStatus ? (
              <button
                type="button"
                onClick={() => {
                  if (stageFlow.nextStatus === 'received') {
                    triggerApproveOrder();
                  } else if (stageFlow.nextStatus) {
                    onCycleStatus(order, stageFlow.nextStatus);
                  }
                }}
                className={`flex-1 min-h-[42px] px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all ${stageFlow.nextBtnCls}`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{stageFlow.nextLabel}</span>
              </button>
            ) : (
              <div className="flex-1 min-h-[42px] px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-extrabold flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>נמסר ללקוח ✓</span>
              </div>
            )}

            {stageFlow.prevStatus && (
              <button
                type="button"
                onClick={() => onCycleStatus(order, stageFlow.prevStatus!)}
                className="min-h-[42px] px-3 rounded-xl bg-[#FAF6F0] hover:bg-[#F3E9DC] border border-[#E8D5BE] text-slate-700 text-xs font-extrabold inline-flex items-center justify-center gap-1 shrink-0 active:scale-[0.98] transition-colors"
                title="החזר שלב אחד אחורה"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span>↩️ חזור שלב</span>
              </button>
            )}
          </div>
        )}

        {/* תגית כתומה מעל כפתור עדכון תשלום כאשר הלקוח לחץ על Bit / PayBox / העברה בנקאית */}
        {!isCharity && prepayPendingVerify && (
          <div className="px-3 py-1.5 rounded-xl bg-orange-100 border border-orange-300 text-orange-950 text-[11px] font-extrabold flex items-center justify-between gap-2">
            <span>⏳ ממתין לאימות תשלום (הלקוח לחץ לתשלום מראש ב-Bit/PayBox)</span>
            {onQuickPay && (
              <button
                type="button"
                onClick={() => onQuickPay(order)}
                className="px-2 py-0.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-extrabold shrink-0"
              >
                אמת ואשר
              </button>
            )}
          </div>
        )}

        {/* שורת פעולות: עדכון תשלום אלגנטי (או תגית שולם + עריכה) + חשבונית (לספק) + וואטסאפ */}
        {!isInactiveOrder && (
        <div className="flex items-center gap-2">
          {!isCharity && onQuickPay && (
            payState.status === 'paid' ? (
              <div className="flex-1 min-h-[44px] px-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center justify-between gap-2">
                <span className="truncate">✅ שולם ({paidMethodDisplay})</span>
                <button
                  type="button"
                  onClick={() => onQuickPay(order)}
                  className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 transition-colors"
                  title="ערוך אמצעי או סכום תשלום"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>עריכה</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onQuickPay(order)}
                className="flex-1 min-h-[44px] px-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white border border-emerald-700/40 active:scale-[0.98] text-xs font-extrabold flex items-center justify-center gap-1.5 shadow-sm transition-all"
              >
                <CreditCard className="w-4 h-4 shrink-0 text-emerald-200" />
                <span className="truncate">
                  {payState.status === 'partial'
                    ? `💳 עדכון תשלום (שולם ${formatILS(order.paid_amount)})`
                    : '💳 עדכון תשלום'}
                </span>
              </button>
            )
          )}

          {order.order_type === 'supplier' && onOpenInvoice && (
            <button
              type="button"
              onClick={() => onOpenInvoice(order)}
              className="min-h-[44px] px-3 rounded-xl bg-[#1E242B] hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0"
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
            className="min-h-[44px] px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-emerald-900 text-xs font-extrabold flex items-center justify-center gap-1 shrink-0 active:scale-[0.98]"
            title="שלח בוואטסאפ"
          >
            <Share2 className="w-4 h-4 text-[#128C7E] shrink-0" />
            <span className="hidden sm:inline">וואטסאפ</span>
          </a>
        </div>
        )}

        {/* שורת כלים משנית קטנה (העתקה / קישור לקוח / עריכה / כרטסת / מחיקה) */}
        <div className="flex items-center justify-between pt-0.5 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 py-1.5 px-2 rounded-lg hover:bg-[#FAF6F0] font-semibold"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'הועתק!' : 'העתק טקסט'}</span>
            </button>
            {order.user_id && (
              <button
                type="button"
                onClick={handleCopyCustomerLink}
                className="inline-flex items-center gap-1 py-1.5 px-2 rounded-lg hover:bg-[#FFF7ED] text-[#8A330B] font-bold"
                title="העתק קישור לאזור האישי של הלקוח"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'קישור הועתק!' : 'העתק קישור לקוח'}</span>
              </button>
            )}
          </div>

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
            {!isInactiveOrder && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmCancelOpen(true);
                }}
                className="p-2 rounded-lg hover:bg-red-50 hover:text-red-600 text-slate-500"
                title="בטל הזמנה"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* חלונית אזהרה לפני ביטול הזמנה (מסמן כבוטלה ע"י המוכר ומציג ללקוח באפור) */}
      {confirmCancelOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmCancelOpen(false);
          }}
        >
          <div
            className="max-w-xs w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 space-y-3.5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-extrabold text-slate-900">
              האם לבטל את ההזמנה של {order.recipient_name}?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              ההזמנה <strong>#{order.id}</strong> ({formatILS(effectiveTotal)}) תסומן כמבוטלת ותוצג ללקוח בהתאם. ניתן יהיה לשחזר אותה בכל עת.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmCancelOpen(false)}
                className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => {
                  onCycleStatus(order, 'cancelled');
                  setConfirmCancelOpen(false);
                }}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs"
              >
                כן, בטל הזמנה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* חלונית אישור מחיקת הזמנה לצמיתות (זמינה רק מתוך הזמנה שכבר בוטלה) */}
      {confirmDeleteOpen && onDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!deleting) setConfirmDeleteOpen(false);
          }}
        >
          <div
            className="max-w-xs w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 space-y-3.5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-extrabold text-slate-900">
              להעביר את הזמנה #{order.id} להזמנות שנמחקו?
            </h3>
            <p className="text-xs text-slate-600">
              הזמנה של <strong>{order.recipient_name}</strong> תוסתר מרשימת ההזמנות הרגילות ותועבר לסל המחזור (״🗑️ הזמנות שנמחקו״), משם ניתן לשחזר או למחוק סופית.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDeleteOpen(false)}
                className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDelete(order.id);
                  } finally {
                    setDeleting(false);
                    setConfirmDeleteOpen(false);
                  }
                }}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-extrabold text-xs"
              >
                {deleting ? 'מעביר...' : 'העבר לנמחקו'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* חלונית אישור מחיקה סופית מהמערכת (מתוך סל המחזור בלבד) */}
      {confirmPermanentDeleteOpen && onPermanentDelete && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!deleting) setConfirmPermanentDeleteOpen(false);
          }}
        >
          <div
            className="max-w-xs w-full bg-white rounded-3xl border border-red-300 shadow-card p-5 space-y-3.5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-serif text-lg font-extrabold text-red-800">
              מחיקה סופית של הזמנה #{order.id}?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              פעולה זו תסיר את ההזמנה לצמיתות ממסך המוכר (אצל הלקוח תישמר הודעה קצרה שההזמנה בוטלה ואינה פעילה).
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirmPermanentDeleteOpen(false)}
                className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onPermanentDelete(order.id);
                  } finally {
                    setDeleting(false);
                    setConfirmPermanentDeleteOpen(false);
                  }
                }}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-extrabold text-xs"
              >
                {deleting ? 'מוחק סופית...' : '❌ מחק סופית'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
