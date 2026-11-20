import React, { useEffect, useMemo, useState } from 'react';
import {
  Flame,
  CheckCircle2,
  Clock,
  ShoppingBag,
  Plus,
  Minus,
  Send,
  History,
  Wallet,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS, getNextFridayISO, ORDER_STATUS_LABELS } from '../lib/format';
import { getFridayPricingStatus } from '../lib/pricingCutoff';
import { buildWhatsAppShareUrl, formatPublicApprovalWhatsApp } from '../lib/whatsappFormat';
import { isProductInStock, loadStockMap } from '../lib/stockState';
import { APP_BRAND_NAME } from '../lib/version';
import type { AdminProduct, BusinessSettings, Order, OrderStatus, User } from '../types';

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

export function CustomerLivePortal({ customerId }: CustomerLivePortalProps) {
  const [customer, setCustomer] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [stockMap] = useState(() => loadStockMap());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // הזמנה עצמית / עדכון הזמנה
  const [fridayDate] = useState(getNextFridayISO());
  const [cart, setCart] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedWaUrl, setSubmittedWaUrl] = useState('');
  const [submittedOrderId, setSubmittedOrderId] = useState<number | null>(null);

  const pricing = useMemo(() => getFridayPricingStatus(fridayDate), [fridayDate]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiFetch<{ users: User[] }>('/api/users').catch(() => ({ users: [] as User[] })),
      apiFetch<{ orders: Order[] }>('/api/orders').catch(() => ({ orders: [] as Order[] })),
      apiFetch<{ products: AdminProduct[] }>('/api/products').catch(() => ({ products: [] as AdminProduct[] })),
      apiFetch<{ settings: BusinessSettings }>('/api/settings').catch(() => ({
        settings: {
          business_name: APP_BRAND_NAME,
          admin_whatsapp_phone: '050-5551000',
          default_delivery_fee: 0,
          whatsapp_footer: '',
        },
      })),
    ])
      .then(([uRes, oRes, pRes, sRes]) => {
        if (!active) return;
        const found = uRes.users.find((u) => u.id === customerId) || null;
        setCustomer(found);
        const custOrders = oRes.orders
          .filter((o) => o.user_id === customerId)
          .sort((a, b) => b.id - a.id);
        setOrders(custOrders);
        setProducts(pRes.products.filter((p) => p.is_active));
        setSettings(sRes.settings);
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

  const currentOrder = orders[0] || null;
  const pastOrders = orders.slice(1);

  const getProductPrice = (p: AdminProduct) =>
    pricing.isPreorder ? p.preorder_price : p.customer_price;

  const cartItems = useMemo(() => {
    return products
      .filter((p) => (cart[p.id] || 0) > 0)
      .map((p) => ({
        product: p,
        quantity: cart[p.id],
        unit_price: getProductPrice(p),
      }));
  }, [products, cart, pricing.isPreorder]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, it) => sum + it.quantity * it.unit_price, 0),
    [cartItems]
  );

  const handleSubmitOrderForWhatsAppApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch<{ id?: number; order?: { id: number } }>('/api/public/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          user_id: customer?.id ?? customerId,
          recipient_name: customer?.name || `לקוח #${customerId}`,
          phone: customer?.phone || '',
          notes: notes.trim(),
          items: cartItems.map((it) => ({ product_id: it.product.id, quantity: it.quantity })),
        }),
      });
      const newOrderId = res.order?.id ?? res.id ?? Date.now();
      const waText = formatPublicApprovalWhatsApp({
        id: newOrderId,
        business_name: settings?.business_name || APP_BRAND_NAME,
        recipient_name: customer?.name || `לקוח #${customerId}`,
        phone: customer?.phone || '',
        friday_date: fridayDate,
        pricing_mode: pricing.mode,
        items: cartItems.map((it) => ({
          product_name: it.product.name,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
        total_amount: cartTotal,
        notes: notes.trim(),
      });
      const waUrl = buildWhatsAppShareUrl(waText, settings?.admin_whatsapp_phone);
      setSubmittedOrderId(newOrderId);
      setSubmittedWaUrl(waUrl);
      setCart({});
      setNotes('');
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה לאישור');
    } finally {
      setSubmitting(false);
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
      {/* כותרת עליונה */}
      <header className="bg-[#1E242B] text-white px-4 py-4 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#C85A17] to-[#D97706] flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold leading-tight">
                {settings?.business_name || APP_BRAND_NAME}
              </h1>
              <p className="text-xs text-amber-300">
                אזור אישי · {customer ? customer.name : `לקוח #${customerId}`}
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-white/10 text-[11px] font-bold text-amber-200">
            ללא סיסמה
          </span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-5">
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {/* 1. סטטוס ההזמנה הנוכחית */}
        <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#C85A17]" />
              <span>סטטוס ההזמנה הנוכחית</span>
            </h2>
            {currentOrder && (
              <span className="text-xs font-extrabold px-2.5 py-1 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] tabular-nums">
                הזמנה #{currentOrder.id}
              </span>
            )}
          </div>

          {!currentOrder ? (
            <div className="py-4 text-center text-sm text-slate-500">
              אין כרגע הזמנה פעילה. ניתן לבצע הזמנה חדשה למטה!
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="text-xs text-slate-500 font-semibold">
                {formatFridayLabel(currentOrder.friday_date)} · סטטוס:{' '}
                <strong className="text-slate-900">{ORDER_STATUS_LABELS[currentOrder.status]}</strong>
              </div>

              {/* סרגל התקדמות 4 שלבים */}
              {(() => {
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
              })()}

              {/* פירוט פריטים וסה״כ */}
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

              <div className="flex items-center justify-between pt-2 border-t border-[#F3E9DC] text-sm tabular-nums">
                <span className="text-slate-600 font-semibold">סה״כ להזמנה:</span>
                <span className="font-extrabold text-lg text-[#C85A17]">
                  {formatILS(currentOrder.total_amount)}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* 2. מצב חשבון ויתרות קודמות */}
        <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#C85A17]" />
              <span>מצב חשבון ויתרות קודמות</span>
            </h2>
            <span
              className={`text-lg font-extrabold tabular-nums ${
                (customer?.balance ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {(customer?.balance ?? 0) < 0
                ? `חוב: ${formatILS(Math.abs(customer?.balance ?? 0))}`
                : (customer?.balance ?? 0) > 0
                ? `זיכוי: ${formatILS(customer?.balance ?? 0)}`
                : 'מאוזן (₪0.00)'}
            </span>
          </div>

          {pastOrders.length > 0 && (
            <div className="pt-2 border-t border-[#F3E9DC] space-y-2">
              <div className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <History className="w-3.5 h-3.5" />
                <span>היסטוריית הזמנות קודמות ({pastOrders.length})</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {pastOrders.slice(0, 6).map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE]/70 tabular-nums"
                  >
                    <div>
                      <span className="font-bold text-slate-800">{formatFridayLabel(o.friday_date)}</span>
                      <span className="text-slate-400 mr-1.5">#{o.id}</span>
                    </div>
                    <div className="font-extrabold text-slate-900">{formatILS(o.total_amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 3. טופס הזמנה עצמית / עדכון הזמנה עם אימות וואטסאפ ותצוגת זמינות בלבד */}
        <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#C85A17]" />
              <span>הזמנה עצמית לשישי ({formatFridayLabel(fridayDate)})</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ההזמנה נשלחת לאישור המנהל בוואטסאפ ונכנסת להכנה רק לאחר אישור.
            </p>
          </div>

          {submittedWaUrl && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2.5">
              <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>הזמנה #{submittedOrderId} נשמרה בממתין לאישור!</span>
              </div>
              <a
                href={submittedWaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
              >
                <ExternalLink className="w-4 h-4" />
                <span>פתח וואטסאפ לשליחה לאישור</span>
              </a>
            </div>
          )}

          <form onSubmit={handleSubmitOrderForWhatsAppApproval} className="space-y-3">
            <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-2xl overflow-hidden">
              {products.map((p) => {
                const inStock = isProductInStock(p.id, stockMap);
                const qty = cart[p.id] || 0;
                const price = getProductPrice(p);
                return (
                  <div
                    key={p.id}
                    className={`p-3 flex items-center justify-between gap-2 ${
                      !inStock ? 'bg-slate-50 opacity-65' : qty > 0 ? 'bg-[#FFF7ED]' : 'bg-white'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">{p.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            inStock
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {inStock ? 'במלאי' : 'אזל מהמלאי'}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#8A330B] tabular-nums mt-0.5">
                        {formatILS(price)}
                      </div>
                    </div>

                    {inStock ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] || 0) - 1) }))
                          }
                          className="w-9 h-9 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="w-7 text-center font-extrabold text-sm tabular-nums">{qty}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
                          }
                          className="w-9 h-9 rounded-xl bg-[#C85A17] text-white flex items-center justify-center"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-red-600 shrink-0">לא זמין</span>
                    )}
                  </div>
                );
              })}
            </div>

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הערות להזמנה (טעמים, שעת איסוף...)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
            />

            <button
              type="submit"
              disabled={submitting || cartItems.length === 0}
              className="w-full min-h-[52px] px-4 py-3 rounded-2xl bg-[#25D366] hover:bg-[#1EB958] disabled:opacity-45 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              <Send className="w-4 h-4" />
              <span>
                {submitting
                  ? 'שולח...'
                  : `שלח הזמנה לאישור בוואטסאפ (${formatILS(cartTotal)})`}
              </span>
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
