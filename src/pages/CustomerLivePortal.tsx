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
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
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
  const [customer, setCustomer] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // מודאל בקשת ביטול הזמנה
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
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
  }, [customerId]);

  // חישוב 3 נתוני סיכום חשבון אישי (ללא הזמנות שבוטלו)
  const accountSummary = useMemo(() => {
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const totalOrdered = valid.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const totalPaid = valid.reduce((s, o) => s + (Number(o.paid_amount) || 0), 0);
    const balanceDue = Math.max(0, totalOrdered - totalPaid);
    return { totalOrdered, totalPaid, balanceDue };
  }, [orders]);

  const currentOrder = orders[0] || null;
  const pastOrders = orders.slice(1);

  const handleConfirmCancelRequest = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setError('');
    try {
      await apiFetch('/api/public/request-cancel', {
        method: 'POST',
        body: JSON.stringify({ order_id: cancelTarget.id }),
      });

      setOrders((prev) =>
        prev.map((o) =>
          o.id === cancelTarget.id ? { ...o, status: 'cancel_requested' } : o
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
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'לא ניתן לשלוח בקשת ביטול להזמנה זו');
      setCancelTarget(null);
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#C85A17] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm font-bold text-slate-600">טוען את האזור האישי...</p>
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
                👤 האזור האישי · {settings?.business_name || APP_BRAND_NAME}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="#/menu"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold transition-colors"
            >
              <span>🍽️ לתפריט</span>
            </a>
            <a
              href="#/menu"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-extrabold shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>🛒 הזמנה</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-5">
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {/* 1. כרטיס סיכום חשבון אישי בראש המסך (3 נתונים) */}
        <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#C85A17]" />
              <span>סיכום חשבון אישי</span>
            </h2>
            <a
              href="#/menu"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-extrabold shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ הוסף הזמנה חדשה</span>
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
                יתרה לתשלום בפועל
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

          {accountSummary.balanceDue > 0 && (
            <QuickCustomerPayBox
              amountToPay={accountSummary.balanceDue}
              title="תשלום מהיר ליתרה הפתוחה"
            />
          )}
        </section>

        {/* הודעת אישור שליחת בקשת ביטול לוואטסאפ */}
        {cancelWaUrl && cancelNoticeOrderId && (
          <div className="p-4 rounded-2xl bg-orange-50 border border-orange-300 space-y-2.5">
            <div className="flex items-center gap-2 text-orange-950 font-extrabold text-sm">
              <CheckCircle2 className="w-5 h-5 text-orange-600 shrink-0" />
              <span>בקשת הביטול להזמנה #{cancelNoticeOrderId} נרשמה — ממתין לאישור מוכר</span>
            </div>
            <a
              href={cancelWaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>שלח הודעת ביטול למוכר בוואטסאפ</span>
            </a>
          </div>
        )}

        {/* 2. סטטוס ההזמנה הפעילה לשישי הקרוב */}
        <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#C85A17]" />
              <span>ההזמנה הפעילה לשישי הקרוב</span>
            </h2>
            {currentOrder && (
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] tabular-nums">
                הזמנה #{currentOrder.id}
              </span>
            )}
          </div>

          {!currentOrder ? (
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
            const unpaid = Math.max(0, currentOrder.total_amount - currentOrder.paid_amount);
            const payBadge = getPaymentBadge(currentOrder);
            const canStillCancel = isBeforeFridayCancelCutoff(currentOrder.friday_date);
            const isCancelableStatus =
              currentOrder.status !== 'delivered' &&
              currentOrder.status !== 'cancelled' &&
              currentOrder.status !== 'cancel_requested';

            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <div className="text-slate-600 font-semibold">
                    {formatFridayLabel(currentOrder.friday_date)} · סטטוס:{' '}
                    <strong className="text-slate-900">
                      {ORDER_STATUS_LABELS[currentOrder.status]}
                    </strong>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${payBadge.cls}`}
                  >
                    {payBadge.label}
                  </span>
                </div>

                {/* סרגל התקדמות חי 4 שלבים או באנר ביטול */}
                {currentOrder.status === 'cancel_requested' ? (
                  <div className="p-3 rounded-2xl bg-orange-50 border border-orange-300 flex items-center gap-2 text-xs font-extrabold text-orange-900">
                    <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                    <span>בקשת הביטול נשלחה — ממתין לאישור מוכר</span>
                  </div>
                ) : currentOrder.status === 'cancelled' ? (
                  <div className="p-3 rounded-2xl bg-slate-100 border border-slate-300 text-xs font-extrabold text-slate-600 text-center">
                    הזמנה זו בוטלה באישור מוכר
                  </div>
                ) : (
                  (() => {
                    const curStep = getStepIndex(currentOrder.status);
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
                  {currentOrder.items.map((it) => (
                    <span
                      key={it.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] text-xs font-bold"
                    >
                      <span className="text-[#C85A17]">{it.quantity}×</span>
                      <span>{it.product_name}</span>
                    </span>
                  ))}
                </div>

                {/* סיכום סכום ושולם */}
                <div className="flex items-center justify-between pt-2 border-t border-[#F3E9DC] text-sm tabular-nums">
                  <div className="space-y-0.5">
                    <div className="text-slate-600 font-semibold">סה״כ להזמנה:</div>
                    <div
                      className={`text-xs font-bold ${
                        currentOrder.paid_amount > 0
                          ? 'text-emerald-700'
                          : isOrderPrepayPendingVerification(currentOrder)
                          ? 'text-orange-800'
                          : 'text-red-600'
                      }`}
                    >
                      {currentOrder.paid_amount > 0
                        ? `שולם ${formatILS(currentOrder.paid_amount)} מתוך ${formatILS(
                            currentOrder.total_amount
                          )}${unpaid > 0 ? ` · נותר: ${formatILS(unpaid)}` : ''}`
                        : isOrderPrepayPendingVerification(currentOrder)
                        ? '⏳ ממתין לאימות תשלום מהמוכר — התשלום יאושר ויעודכן בחשבונך מיד לאחר שהמוכר יאמת את ההעברה'
                        : `לא שולם (₪0.00 מתוך ${formatILS(currentOrder.total_amount)})`}
                    </div>
                  </div>
                  <span className="font-extrabold text-lg text-[#C85A17]">
                    {formatILS(currentOrder.total_amount)}
                  </span>
                </div>

                {/* מנגנון ביטול הזמנה (עד שישי 06:00 בלבד ובאישור מנהל) */}
                {isCancelableStatus && (
                  <div className="pt-2 border-t border-[#F3E9DC]">
                    {canStillCancel ? (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(currentOrder)}
                        className="w-full py-2.5 px-4 rounded-xl border border-red-200 bg-red-50/70 hover:bg-red-100 text-red-700 text-xs font-extrabold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>בקשת ביטול הזמנה</span>
                      </button>
                    ) : (
                      <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center gap-2 text-center">
                        <Lock className="w-4 h-4 shrink-0 text-slate-500" />
                        <span>לא ניתן לבטל הזמנות לאחר השעה 06:00 בבוקר ביום שישי</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {/* 3. היסטוריית הזמנות קודמות */}
        <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-[#C85A17]" />
              <span>היסטוריית הזמנות קודמות</span>
            </h2>
            <span className="text-xs font-bold text-slate-500">{pastOrders.length} הזמנות</span>
          </div>

          {pastOrders.length === 0 ? (
            <div className="py-4 text-center text-xs text-slate-500">
              עדיין אין הזמנות קודמות בהיסטוריה.
            </div>
          ) : (
            <div className="space-y-2.5">
              {pastOrders.map((o) => {
                const badge = getPaymentBadge(o);
                return (
                  <div
                    key={o.id}
                    className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]/80 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-xs">
                        <span className="font-extrabold text-slate-900">
                          {formatFridayLabel(o.friday_date)}
                        </span>
                        <span className="text-slate-400 mr-1.5 tabular-nums">#{o.id}</span>
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
      </main>

      {/* חלונית אישור בקשת ביטול הזמנה */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-serif text-lg font-extrabold">בקשת ביטול הזמנה #{cancelTarget.id}</h3>
              </div>
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              בקשת הביטול תועבר לאישור המוכר בוואטסאפ, וההזמנה תעבור לסטטוס{' '}
              <strong>״ממתין לאישור ביטול״</strong> עד לאישור המוכר. האם להמשיך?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
              >
                חזור
              </button>
              <button
                type="button"
                disabled={cancelling}
                onClick={handleConfirmCancelRequest}
                className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-extrabold text-xs"
              >
                {cancelling ? 'שולח...' : 'אשר ושלח למוכר'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
