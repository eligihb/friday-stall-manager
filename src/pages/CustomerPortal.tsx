import React, { useEffect, useState, useMemo } from 'react';
import { ShoppingBag, Sparkles, CheckCircle2, ClipboardList, Plus, Minus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  formatFridayLabel,
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
} from '../lib/format';
import { FridaySelector } from '../components/FridaySelector';
import { getPaymentVisualState } from '../components/SupplierInvoiceSheet';
import type { Order, Product } from '../types';

export function CustomerPortal() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [cart, setCart] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, oRes] = await Promise.all([
        apiFetch<{ products: Product[] }>('/api/products'),
        apiFetch<{ orders: Order[] }>('/api/orders'),
      ]);
      setProducts(pRes.products);
      setOrders(oRes.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const cartTotal = useMemo(() => {
    return products.reduce((sum, p) => sum + (cart[p.id] || 0) * Number(p.preorder_price ?? 0), 0);
  }, [products, cart]);

  const cartItemsCount = useMemo(() => Object.values(cart).reduce((s, q) => s + q, 0), [cart]);

  const submitPreorder = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));
    if (items.length === 0) return;

    setSubmitting(true);
    setError('');
    setSuccessMsg('');
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          items,
          notes: notes.trim(),
        }),
      });
      setCart({});
      setNotes('');
      setSuccessMsg(`הזמנתך המוקדמת ל-${formatFridayLabel(fridayDate)} נקלטה בהצלחה!`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-[#6D280B] via-[#8A330B] to-[#C85A17] text-white rounded-3xl p-6 sm:p-8 shadow-card">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-amber-100 text-xs font-bold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>אזור לקוחות — מחירון הזמנה מוקדמת לשישי</span>
        </div>
        <h2 className="font-serif text-3xl font-bold">שלום {user.name}!</h2>
        <p className="text-sm text-amber-100/90 mt-1.5 max-w-xl">
          המאפים הטריים שלנו מגיעים ישירות מהמאפייה לפנות בוקר ביום שישי. בהזמנה מוקדמת דרך האתר נהנים ממחיר מוזל ושמירה מראש בדוכן.
        </p>
      </div>

      {/* תפריט פעיל במחירון הזמנה מוקדמת */}
      <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#C85A17]" />
            <div>
              <h3 className="font-serif text-2xl font-bold text-slate-900">תפריט שישי (הזמנה מוקדמת)</h3>
              <p className="text-xs text-slate-500">מחירי הזמנה מוקדמת מוזלים לעומת מחיר הדוכן</p>
            </div>
          </div>
          <FridaySelector value={fridayDate} onChange={setFridayDate} label="איסוף ביום:" />
        </div>

        {successMsg && (
          <div className="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-slate-400">טוען תפריט...</div>
        ) : (
          <form onSubmit={submitPreorder} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {products.map((p) => {
                const qty = cart[p.id] || 0;
                const preorder = Number(p.preorder_price ?? 0);
                const stall = Number(p.customer_price ?? 0);
                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl p-4 border transition-all flex items-center justify-between gap-3 ${
                      qty > 0
                        ? 'border-[#C85A17] bg-[#FFF7ED]/70 shadow-sm'
                        : 'border-[#E8D5BE]/80 bg-[#FDFBF7]'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-900">{p.name}</div>
                      <div className="flex items-center gap-2 mt-1 tabular-nums">
                        <span className="text-sm font-extrabold text-[#C85A17]">
                          {formatILS(preorder)}
                        </span>
                        {stall > preorder && (
                          <span className="text-xs text-slate-400 line-through">{formatILS(stall)}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setCart((prev) => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] || 0) - 1) }))
                        }
                        className="w-8 h-8 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-8 text-center font-bold tabular-nums text-sm">{qty}</span>
                      <button
                        type="button"
                        onClick={() => setCart((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))}
                        className="w-8 h-8 rounded-xl bg-[#C85A17] text-white flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {cartItemsCount > 0 && (
              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-[#FAF6F0] p-4 rounded-2xl border border-[#E8D5BE]">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערה לשעת איסוף (לדוגמה: מגיע ב-10:30)"
                  className="flex-1 px-3.5 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm"
                />
                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="tabular-nums">
                    <div className="text-xs text-slate-500">{cartItemsCount} פריטים בסל</div>
                    <div className="text-xl font-extrabold text-[#C85A17]">{formatILS(cartTotal)}</div>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
                  >
                    {submitting ? 'שולח...' : 'שלח הזמנה מוקדמת'}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}
      </div>

      {/* היסטוריית הזמנות */}
      <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-5 h-5 text-[#C85A17]" />
          <h3 className="font-serif text-2xl font-bold text-slate-900">ההזמנות שלי</h3>
        </div>
        {orders.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">עדיין לא ביצעת הזמנות.</div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const payState = getPaymentVisualState(o);
              return (
              <div key={o.id} className="rounded-2xl border border-[#E8D5BE]/80 bg-[#FDFBF7] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                  <div className="font-bold text-slate-900">{formatFridayLabel(o.friday_date)}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${payState.badgeCls}`}>
                      {payState.label}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </div>
                </div>
                <div className="space-y-1 text-xs text-slate-700 tabular-nums">
                  {o.items.map((it) => (
                    <div key={it.id} className="flex justify-between">
                      <span>
                        {it.quantity} × {it.product_name}
                      </span>
                      <span>{formatILS(it.quantity * it.unit_price_snapshot)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-[#E8D5BE]/70 flex justify-between text-sm font-extrabold tabular-nums">
                  <span>סה״כ</span>
                  <span>{formatILS(o.total_amount)}</span>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
