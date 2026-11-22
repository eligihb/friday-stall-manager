import React, { useEffect, useMemo, useState } from 'react';
import {
  Flame,
  Clock,
  Plus,
  History,
  Wallet,
  XCircle,
  AlertTriangle,
  Lock,
  ExternalLink,
  CheckCircle2,
  X,
  Tag,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  computeOrderPromoSavings,
  formatFridayLabel,
  formatILS,
  isBeforeFridayCancelCutoff,
  isOrderPrepayPendingVerification,
  ORDER_STATUS_LABELS,
} from '../lib/format';
import {
  buildWhatsAppShareUrl,
  formatCancelRequestWhatsApp,
} from '../lib/whatsappFormat';
import { QuickCustomerPayBox } from '../components/QuickCustomerPayBox';
import { useFriday } from '../context/FridayContext';
import { APP_BRAND_NAME } from '../lib/version';
import type { BusinessSettings, Order, OrderStatus, User } from '../types';

interface CustomerLivePortalProps {
  customerId: number;
}

const PROGRESS_STEPS: Array<{ key: OrderStatus; label: string; color: string; step: number }> = [
  { key: 'pending', label: 'ממתין', color: 'bg-red-600', step: 1 },
  { key: 'received', label: 'התקבל', color: 'bg-blue-600', step: 2 },
  { key: 'ready', label: 'מוכן למסירה', color: 'bg-orange-500', step: 3 },
  { key: 'delivered', label: 'נמסר', color: 'bg-emerald-600', step: 4 },
];

function getStepIndex(status: OrderStatus): number {
  if (status === 'awaiting_approval' || status === 'pending') return 1;
  if (status === 'received') return 2;
  if (status === 'ready') return 3;
  return 4;
}

function getPaymentBadge(order: Order): { label: string; cls: string } {
  if (order.status === 'cancelled') {
    return { label: 'בוטל', cls: 'bg-slate-200 text-slate-700 border-slate-300' };
  }
  if (order.status === 'cancel_requested') {
    return { label: 'ממתין לאישור ביטול', cls: 'bg-orange-100 text-orange-900 border-orange-300' };
  }
  if (order.total_amount <= 0 || order.paid_amount >= order.total_amount - 0.01) {
    return { label: 'שולם מלא ✓', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300' };
  }
  if (order.paid_amount > 0) {
    return { label: 'שולם חלקית', cls: 'bg-amber-100 text-amber-900 border-amber-300' };
  }
  if (isOrderPrepayPendingVerification(order)) {
    return {
      label: '⏳ ממתין לאימות תשלום מהמוכר',
      cls: 'bg-orange-100 text-orange-950 border-orange-300',
    };
  }
  return { label: 'טרם שולם', cls: 'bg-red-100 text-red-800 border-red-300' };
}

export function CustomerLivePortal({ customerId }: CustomerLivePortalProps) {
  const { refreshTick } = useFriday();
  const [customer, setCustomer] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // טאב תצוגה: 'active_order' (ברירת מחדל — ההזמנה הפעילה בראש המסך) | 'history' (היסטוריית הזמנות ותשלומים)
  const [activeTab, setActiveTab] = useState<'active_order' | 'history'>('active_order');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // מודאל ביטול הזמנה (עם אישור כפול)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelConfirmStep, setCancelConfirmStep] = useState<1 | 2>(1);
  const [cancelling, setCancelling] = useState(false);
  const [cancelWaUrl, setCancelWaUrl] = useState<string>('');
  const [cancelNoticeOrderId, setCancelNoticeOrderId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiFetch<{ customer: User | null; orders: Order[] }>(
        `/api/public/customer-history?customer_id=${customerId}`
      ).catch(() => ({ customer: null as User | null, orders: [] as Order[] })),
      apiFetch<{ business_name?: string; admin_whatsapp_phone?: string; whatsapp_footer?: string }>(
        '/api/public/storefront'
      ).catch(() => ({
        business_name: APP_BRAND_NAME,
        admin_whatsapp_phone: '0542452100',
        whatsapp_footer: '',
      })),
    ])
      .then(([histRes, sfRes]) => {
        if (!active) return;
        setCustomer(histRes.customer);
        const sorted = [...(histRes.orders || [])].sort(
          (a, b) => b.friday_date.localeCompare(a.friday_date) || b.id - a.id
        );
        setOrders(sorted);
        if (sorted.length > 0) {
          setSelectedOrderId(sorted[0].id);
        }
        setSettings({
          business_name: sfRes.business_name || APP_BRAND_NAME,
          admin_whatsapp_phone: sfRes.admin_whatsapp_phone || '0542452100',
          default_delivery_fee: 0,
          whatsapp_footer: sfRes.whatsapp_footer || '',
        });
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'שגיאה בטעינת האזור האישי');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customerId, refreshTick]);

  // הזמנות פעילות/חדשות לסרגל העליון הלחיץ (שאינן מבוטלות)
  const activeBarOrders = useMemo(
    () => orders.filter((o) => o.status !== 'cancelled'),
    [orders]
  );

  // ההזמנה הממוקדת כרגע בראש המסך
  const focusedOrder = useMemo(() => {
    if (selectedOrderId !== null) {
      const found = orders.find((o) => o.id === selectedOrderId);
      if (found) return found;
    }
    return orders[0] || null;
  }, [orders, selectedOrderId]);

  // חישוב 3 נתוני סיכום חשבון אישי (מוצגים בטאב "היסטוריית הזמנות ותשלומים")
  const accountSummary = useMemo(() => {
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const totalOrdered = valid.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const totalPaid = valid.reduce((s, o) => s + (Number(o.paid_amount) || 0), 0);
    const balanceDue = Math.max(0, totalOrdered - totalPaid);
    return { totalOrdered, totalPaid, balanceDue };
  }, [orders]);

  const handleStartEditOrder = (order: Order) => {
    try {
      localStorage.setItem('ht_edit_order_draft_v1', JSON.stringify(order));
      if (customer) {
        localStorage.setItem(
          'ht_public_customer_profile_v1',
          JSON.stringify({
            customerId: customer.id,
            name: customer.name,
            phone: customer.phone || '',
          })
        );
      }
    } catch {
      // ignore
    }
    window.location.hash = `#/menu?editOrder=${order.id}`;
  };

  const handleConfirmCancelRequest = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setError('');
    try {
      await apiFetch('/api/public/cancel-order', {
        method: 'POST',
        body: JSON.stringify({ order_id: cancelTarget.id, direct_cancel: true }),
      });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === cancelTarget.id
            ? { ...o, status: 'cancelled', total_amount: 0, paid_amount: 0 }
            : o
        )
      );

      const waText = formatCancelRequestWhatsApp({
        id: cancelTarget.id,
        business_name: settings?.business_name || APP_BRAND_NAME,
        recipient_name: customer?.name || cancelTarget.recipient_name || `לקוח #${customerId}`,
        phone: customer?.phone || '',
        friday_date: cancelTarget.friday_date,
        items: cancelTarget.items,
        total_amount: cancelTarget.total_amount,
        notes: cancelTarget.notes,
      });
      const waUrl = buildWhatsAppShareUrl(waText, settings?.admin_whatsapp_phone);
      setCancelWaUrl(waUrl);
      setCancelNoticeOrderId(cancelTarget.id);
      setCancelTarget(null);
      setCancelConfirmStep(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן לבטל את ההזמנה');
      setCancelTarget(null);
      setCancelConfirmStep(1);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#C85A17] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm font-bold text-slate-600">טוען את ההזמנה שלך...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#1E242B] pb-16">
      {/* סרגל עליון צף וקומפקטי (Sticky Header) */}
      <header className="sticky top-0 z-40 bg-[#1E242B]/95 backdrop-blur-md text-white px-4 py-3 shadow-md border-b border-white/10">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#C85A17] to-[#D97706] flex items-center justify-center shrink-0">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-extrabold text-xs sm:text-sm text-amber-100 truncate">
                היי {customer ? customer.name : `לקוח #${customerId}`} 👋
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                {settings?.business_name || APP_BRAND_NAME}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="#/menu"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-extrabold shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>🍽️ לתפריט והזמנה</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {/* סרגל הזמנות פעילות/חדשות לחיץ בראש המסך */}
        {activeBarOrders.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#E8D5BE] p-2.5 shadow-soft space-y-1.5">
            <div className="text-[11px] font-extrabold text-slate-500 px-1">
              הזמנות שלך (לחץ על הזמנה למעבר וצפייה):
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {activeBarOrders.map((ord) => {
                const isSelected =
                  activeTab === 'active_order' && focusedOrder?.id === ord.id;
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(ord.id);
                      setActiveTab('active_order');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap border transition-all flex items-center gap-1.5 tabular-nums ${
                      isSelected
                        ? 'bg-[#2B1B12] text-amber-50 border-[#2B1B12] shadow-sm'
                        : 'bg-[#FAF6F0] text-slate-800 border-[#E8D5BE] hover:border-[#C85A17]'
                    }`}
                  >
                    <span>הזמנה #{ord.id}</span>
                    <span>•</span>
                    <span className={isSelected ? 'text-amber-300' : 'text-[#C85A17]'}>
                      {formatILS(ord.total_amount)}
                    </span>
                    <span>•</span>
                    <span>{ORDER_STATUS_LABELS[ord.status]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* בורר 2 טאבים ראשיים (50% / 50%): ההזמנה הפעילה | היסטוריית הזמנות ותשלומים */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-white border border-[#E8D5BE] shadow-soft">
          <button
            type="button"
            onClick={() => setActiveTab('active_order')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'active_order'
                ? 'bg-[#C85A17] text-white shadow-sm'
                : 'text-slate-600 hover:bg-[#FAF6F0]'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>ההזמנה הפעילה לשישי</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'history'
                ? 'bg-[#2B1B12] text-amber-50 shadow-sm'
                : 'text-slate-600 hover:bg-[#FAF6F0]'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>📋 היסטוריית הזמנות ותשלומים</span>
          </button>
        </div>

        {/* הודעת אישור ביטול הזמנה */}
        {cancelWaUrl && cancelNoticeOrderId && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2.5">
            <div className="flex items-center gap-2 text-emerald-950 font-extrabold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>הזמנה #{cancelNoticeOrderId} בוטלה בהצלחה בענן ובדוכן</span>
            </div>
            <a
              href={cancelWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>עדכן את המוכר בוואטסאפ על הביטול</span>
            </a>
          </div>
        )}

        {/* =================================================================
            טאב 1 (ברירת מחדל): ההזמנה הפעילה לשישי הקרוב בראש המסך
        ================================================================= */}
        {activeTab === 'active_order' ? (
          <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#C85A17]" />
                <span>
                  {focusedOrder
                    ? `הזמנה #${focusedOrder.id} — ${formatFridayLabel(focusedOrder.friday_date)}`
                    : 'ההזמנה הפעילה לשישי הקרוב'}
                </span>
              </h2>
              {focusedOrder && (
                <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] tabular-nums">
                  #{focusedOrder.id}
                </span>
              )}
            </div>

            {!focusedOrder ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-slate-500">אין כרגע הזמנה פעילה.</p>
                <a
                  href="#/menu"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-sm shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ הוסף הזמנה חדשה מהתפריט</span>
                </a>
              </div>
            ) : (() => {
              const unpaid = Math.max(0, focusedOrder.total_amount - focusedOrder.paid_amount);
              const payBadge = getPaymentBadge(focusedOrder);
              const canStillCancel = isBeforeFridayCancelCutoff(focusedOrder.friday_date);
              const isCancelableStatus =
                focusedOrder.status !== 'delivered' &&
                focusedOrder.status !== 'cancelled' &&
                focusedOrder.status !== 'cancel_requested';
              const savings = computeOrderPromoSavings(focusedOrder);

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <div className="text-slate-600 font-semibold">
                      סטטוס הזמנה:{' '}
                      <strong className="text-slate-900">
                        {ORDER_STATUS_LABELS[focusedOrder.status]}
                      </strong>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${payBadge.cls}`}
                    >
                      {payBadge.label}
                    </span>
                  </div>

                  {/* סרגל התקדמות חי 4 שלבים מול המוכר או באנר ביטול */}
                  {focusedOrder.status === 'cancel_requested' ? (
                    <div className="p-3 rounded-2xl bg-orange-50 border border-orange-300 flex items-center gap-2 text-xs font-extrabold text-orange-900">
                      <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                      <span>בקשת הביטול נשלחה — ממתין לאישור מוכר</span>
                    </div>
                  ) : focusedOrder.status === 'cancelled' ? (
                    <div className="p-3 rounded-2xl bg-slate-100 border border-slate-300 text-xs font-extrabold text-slate-600 text-center">
                      הזמנה זו בוטלה באישור מוכר
                    </div>
                  ) : (
                    (() => {
                      const curStep = getStepIndex(focusedOrder.status);
                      const curColor = PROGRESS_STEPS[curStep - 1]?.color || 'bg-red-600';
                      return (
                        <div className="space-y-2">
                          <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex gap-1">
                            {PROGRESS_STEPS.map((st) => (
                              <div
                                key={st.key}
                                className={`flex-1 h-full transition-colors ${
                                  st.step <= curStep ? curColor : 'bg-slate-200'
                                }`}
                              />
                            ))}
                          </div>
                          <div className="grid grid-cols-4 text-center text-[11px] font-bold">
                            {PROGRESS_STEPS.map((st) => (
                              <span
                                key={st.key}
                                className={st.step <= curStep ? 'text-slate-900' : 'text-slate-400'}
                              >
                                {st.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })()
                  )}

                  {/* פירוט פריטים */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {focusedOrder.items.map((it) => (
                      <span
                        key={it.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] text-xs font-bold"
                      >
                        <span className="text-[#C85A17]">{it.quantity}×</span>
                        <span>{it.product_name}</span>
                      </span>
                    ))}
                  </div>

                  {/* תגית חיסכון ממבצעים באחוזים (%) ובשקלים */}
                  {savings.savedAmount > 0 && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center justify-between gap-2 tabular-nums">
                      <span className="flex items-center gap-1.5">
                        <Tag className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>
                          🎉 חסכת {savings.percent}% ({formatILS(savings.savedAmount)} הנחה)
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-400 line-through">
                        {formatILS(savings.fullPrice)}
                      </span>
                    </div>
                  )}

                  {/* סיכום סכום ושולם */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#F3E9DC] text-sm tabular-nums">
                    <div className="space-y-0.5">
                      <div className="text-slate-600 font-semibold">סה״כ להזמנה:</div>
                      <div
                        className={`text-xs font-bold ${
                          focusedOrder.paid_amount > 0
                            ? 'text-emerald-700'
                            : isOrderPrepayPendingVerification(focusedOrder)
                            ? 'text-orange-800'
                            : 'text-red-600'
                        }`}
                      >
                        {focusedOrder.paid_amount > 0
                          ? `שולם ${formatILS(focusedOrder.paid_amount)} מתוך ${formatILS(
                              focusedOrder.total_amount
                            )}${unpaid > 0 ? ` · נותר: ${formatILS(unpaid)}` : ''}`
                          : isOrderPrepayPendingVerification(focusedOrder)
                          ? '⏳ ממתין לאימות תשלום מהמוכר — התשלום יאושר ויעודכן בחשבונך מיד לאחר שהמוכר יאמת את ההעברה'
                          : `לא שולם (₪0.00 מתוך ${formatILS(focusedOrder.total_amount)})`}
                      </div>
                    </div>
                    <span className="font-extrabold text-xl text-[#C85A17]">
                      {formatILS(focusedOrder.total_amount)}
                    </span>
                  </div>

                  {/* קוביית התשלום מוצגת מתחת להזמנה אך ורק אם ההזמנה טרם שולמה במלואה */}
                  {unpaid > 0.01 &&
                    focusedOrder.status !== 'cancelled' &&
                    focusedOrder.status !== 'cancel_requested' && (
                      <QuickCustomerPayBox
                        amountToPay={unpaid}
                        title={`תשלום עבור הזמנה #${focusedOrder.id}`}
                      />
                    )}

                  {/* אפשרויות עריכה וביטול הזמנה (עד שישי 06:00 בלבד, כל עוד ההזמנה אינה נמסרה) */}
                  {isCancelableStatus && (
                    <div className="pt-2 border-t border-[#F3E9DC] space-y-2">
                      {canStillCancel ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            onClick={() => handleStartEditOrder(focusedOrder)}
                            className="py-2.5 px-3 rounded-xl bg-[#FAF6F0] hover:bg-[#F3E9DC] border border-[#E8D5BE] text-[#8A330B] text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors text-center"
                          >
                            <span>✏️ עדכן הזמנה</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCancelConfirmStep(1);
                              setCancelTarget(focusedOrder);
                            }}
                            className="py-2.5 px-3 rounded-xl border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <span>🗑️ בטל הזמנה</span>
                          </button>
                        </div>
                      ) : (
                        <div className="p-3.5 rounded-2xl bg-slate-100 border border-slate-200 space-y-2.5 text-center">
                          <div className="text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5">
                            <Lock className="w-4 h-4 shrink-0 text-slate-500" />
                            <span>
                              המועד לעריכה או ביטול עצמי הסתיים (יום שישי בשעה 06:00 בבוקר)
                            </span>
                          </div>
                          <a
                            href={buildWhatsAppShareUrl(
                              `שלום, לגבי הזמנה #${focusedOrder.id} (${
                                customer?.name || focusedOrder.recipient_name
                              }) ל-${formatFridayLabel(focusedOrder.friday_date)}: אשמח לעדכן / לשאול לגבי ההזמנה.`,
                              settings?.admin_whatsapp_phone
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                          >
                            <ExternalLink className="w-4 h-4 shrink-0" />
                            <span>💬 פנייה ישירה למוכר בוואטסאפ</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        ) : (
          /* =================================================================
              טאב 2 (נפרד): היסטוריית הזמנות ותשלומים + סיכום חשבון כולל
          ================================================================= */
          <div className="space-y-4">
            {/* כרטיס סיכום חשבון אישי כולל */}
            <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-[#C85A17]" />
                  <span>סיכום חשבון ותשלומים כולל</span>
                </h2>
                <a
                  href="#/menu"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-extrabold shadow-sm transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ הזמנה חדשה</span>
                </a>
              </div>

              <div className="grid grid-cols-3 gap-2.5 text-center tabular-nums">
                <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]">
                  <div className="text-[11px] font-bold text-slate-500">סה״כ הזמנות</div>
                  <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
                    {formatILS(accountSummary.totalOrdered)}
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                  <div className="text-[11px] font-bold text-emerald-700">שולם בפועל</div>
                  <div className="text-lg sm:text-xl font-extrabold text-emerald-700 mt-1">
                    {formatILS(accountSummary.totalPaid)}
                  </div>
                </div>
                <div
                  className={`p-3 rounded-2xl border ${
                    accountSummary.balanceDue > 0
                      ? 'bg-red-50/80 border-red-200'
                      : 'bg-emerald-50/70 border-emerald-200'
                  }`}
                >
                  <div
                    className={`text-[11px] font-bold ${
                      accountSummary.balanceDue > 0 ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    יתרה/חוב בפועל
                  </div>
                  <div
                    className={`text-lg sm:text-xl font-extrabold mt-1 ${
                      accountSummary.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {formatILS(accountSummary.balanceDue)}
                  </div>
                </div>
              </div>
            </section>

            {/* רשימת כל ההזמנות והתשלומים של הלקוח */}
            <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-[#C85A17]" />
                  <span>כל ההזמנות והתשלומים</span>
                </h2>
                <span className="text-xs font-bold text-slate-500">{orders.length} הזמנות</span>
              </div>

              {orders.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  עדיין אין הזמנות בהיסטוריה.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {orders.map((o) => {
                    const badge = getPaymentBadge(o);
                    const savings = computeOrderPromoSavings(o);
                    return (
                      <div
                        key={o.id}
                        onClick={() => {
                          setSelectedOrderId(o.id);
                          setActiveTab('active_order');
                        }}
                        className="p-3.5 rounded-2xl bg-[#FAF6F0] hover:bg-[#FFF7ED] border border-[#E8D5BE]/80 space-y-2 cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="text-xs">
                            <span className="font-extrabold text-slate-900">
                              {formatFridayLabel(o.friday_date)}
                            </span>
                            <span className="text-slate-500 mr-1.5 tabular-nums font-bold">
                              · הזמנה #{o.id}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                            <span className="font-extrabold text-sm text-slate-900 tabular-nums">
                              {formatILS(o.total_amount)}
                            </span>
                          </div>
                        </div>
                        {o.items.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {o.items.map((it) => (
                              <span
                                key={it.id}
                                className="px-2 py-0.5 rounded-full bg-white border border-[#E8D5BE]/70 text-[11px] font-semibold text-slate-700"
                              >
                                {it.quantity}× {it.product_name}
                              </span>
                            ))}
                          </div>
                        )}
                        {savings.savedAmount > 0 && (
                          <div className="text-[11px] font-extrabold text-emerald-700">
                            🎉 חסכת {savings.percent}% ({formatILS(savings.savedAmount)} הנחה)
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1.5 border-t border-[#E8D5BE]/60 text-[11px] font-bold tabular-nums">
                          <span className="text-slate-500">מצב תשלום להזמנה:</span>
                          <span
                            className={
                              o.status === 'cancelled'
                                ? 'text-slate-500'
                                : o.paid_amount > 0
                                ? 'text-emerald-700'
                                : isOrderPrepayPendingVerification(o)
                                ? 'text-orange-800'
                                : 'text-red-600'
                            }
                          >
                            {o.status === 'cancelled'
                              ? 'בוטל (₪0.00)'
                              : o.paid_amount > 0
                              ? `שולם ${formatILS(o.paid_amount)} מתוך ${formatILS(o.total_amount)}`
                              : isOrderPrepayPendingVerification(o)
                              ? '⏳ ממתין לאימות תשלום מהמוכר'
                              : `לא שולם (₪0.00 מתוך ${formatILS(o.total_amount)})`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* חלונית ביטול הזמנה עם אישור כפול */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-serif text-lg font-extrabold">
                  {cancelConfirmStep === 1
                    ? `ביטול הזמנה #${cancelTarget.id}`
                    : `אישור סופי לביטול הזמנה #${cancelTarget.id}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelConfirmStep(1);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cancelConfirmStep === 1 ? (
              <>
                <p className="text-xs text-slate-600 leading-relaxed">
                  האם ברצונך לבטל את הזמנה <strong>#{cancelTarget.id}</strong> (
                  {formatILS(cancelTarget.total_amount)}) ל-
                  {formatFridayLabel(cancelTarget.friday_date)}?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCancelTarget(null);
                      setCancelConfirmStep(1);
                    }}
                    className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
                  >
                    חזור
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelConfirmStep(2)}
                    className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs"
                  >
                    המשך לביטול
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 font-bold leading-relaxed">
                  ⚠️ אישור כפול: לחיצה על הכפתור תבטל את ההזמנה מיידית בענן ותעדכן את הדוכן (חיוב ההזמנה יאופס ל-₪0.00). האם אתה בטוח?
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => setCancelConfirmStep(1)}
                    className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
                  >
                    לא, שמור הזמנה
                  </button>
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={handleConfirmCancelRequest}
                    className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-extrabold text-xs"
                  >
                    {cancelling ? 'מבטל בענן...' : '🗑️ כן, בטל סופית'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
