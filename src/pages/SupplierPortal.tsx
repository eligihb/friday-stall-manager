import React, { useEffect, useState, useMemo } from 'react';
import { Wallet, Send, ClipboardList, CheckCircle2, Minus, Plus, ShoppingBag } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  formatFridayLabel,
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
} from '../lib/format';
import { FridaySelector } from '../components/FridaySelector';
import type { Order, Product } from '../types';

type SupplierMobileSection = 'new-order' | 'history' | 'balance';

export function SupplierPortal() {
  const { user, refreshUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [mobileTab, setMobileTab] = useState<SupplierMobileSection>('new-order');

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, ordRes] = await Promise.all([
        apiFetch<{ products: Product[] }>('/api/products'),
        apiFetch<{ orders: Order[] }>('/api/orders'),
      ]);
      setProducts(prodRes.products);
      setOrders(ordRes.orders);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const orderTotal = useMemo(() => {
    return products.reduce((sum, p) => {
      const q = quantities[p.id] || 0;
      return sum + q * Number(p.supplier_price ?? 0);
    }, 0);
  }, [products, quantities]);

  const totalUnits = useMemo(() => {
    return Object.values(quantities).reduce((s, q) => s + q, 0);
  }, [quantities]);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));

    if (items.length === 0) {
      setError('יש לבחור לפחות מוצר אחד להזמנה');
      return;
    }

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
      setQuantities({});
      setNotes('');
      setSuccessMsg(`ההזמנה הסיטונאית ל-${formatFridayLabel(fridayDate)} נשלחה בהצלחה!`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) return null;

  const isDebt = user.balance < 0;
  const isCredit = user.balance > 0;

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* כרטיס יתרת חוב / זכות (גלוי תמיד בדסקטופ, ובמובייל בלשונית היתרה או כפס קומפקטי) */}
      <div className={`${mobileTab === 'balance' ? 'block' : 'hidden md:grid'} md:grid-cols-3 gap-4 space-y-4 md:space-y-0`}>
        <div className="md:col-span-2 bg-gradient-to-br from-[#1E242B] to-[#3B261C] text-white rounded-3xl p-6 shadow-card flex flex-col justify-between">
          <div>
            <span className="inline-block px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
              פורטל ספק סיטונאי מבודד
            </span>
            <h2 className="font-serif text-3xl font-bold mt-3">שלום, {user.name}</h2>
            <p className="text-sm text-cream-200/85 mt-1">
              כאן ניתן להגיש הזמנה סיטונאית לפי מחיר ספק, לעקוב אחר הזמנותיך ולצפות ביתרת החוב/זכות הפתוחה.
            </p>
          </div>
          {user.notes && (
            <div className="mt-4 text-xs text-amber-200/90 bg-white/8 rounded-xl px-3.5 py-2 border border-white/10">
              הערת מערכת: {user.notes}
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl p-6 border border-[#E8D5BE] shadow-soft flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-600">יתרת חוב / זכות פתוחה</span>
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isDebt ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <div className="my-4">
            <div
              className={`text-3xl font-extrabold tabular-nums ${
                isDebt ? 'text-red-600' : isCredit ? 'text-emerald-700' : 'text-slate-900'
              }`}
            >
              {formatILS(Math.abs(user.balance))}
            </div>
            <div
              className={`text-xs font-bold mt-1 ${
                isDebt ? 'text-red-600' : isCredit ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {isDebt
                ? 'יתרת חוב פתוחה לתשלום'
                : isCredit
                ? 'יתרת זכות העומדת לרשותך'
                : 'החשבון מאוזן — אין חוב פתוח'}
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            מתעדכן אוטומטית עם כל הזמנה או קבלת תשלום.
          </div>
        </div>
      </div>

      {/* פס יתרה קומפקטי במובייל כשהספק בלשוניות אחרות */}
      {mobileTab !== 'balance' && (
        <div className="md:hidden bg-white rounded-2xl border border-[#E8D5BE] px-4 py-3 flex items-center justify-between shadow-soft tabular-nums">
          <span className="text-xs font-bold text-slate-600">יתרת חשבון ({user.name})</span>
          <span
            className={`text-sm font-extrabold ${
              isDebt ? 'text-red-600' : isCredit ? 'text-emerald-700' : 'text-slate-800'
            }`}
          >
            {isDebt
              ? `חוב ${formatILS(Math.abs(user.balance))}`
              : isCredit
              ? `זכות ${formatILS(user.balance)}`
              : 'מאוזן (₪0.00)'}
          </span>
        </div>
      )}

      {/* טופס הזמנה סיטונאית חדשה */}
      <div
        className={`${
          mobileTab === 'new-order' ? 'block' : 'hidden md:block'
        } bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-6`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h3 className="font-serif text-2xl font-bold text-slate-900">הזמנה סיטונאית לשישי</h3>
            <p className="text-xs text-slate-500 mt-0.5">המחירים המוצגים הינם מחירי ספק בלעדיים.</p>
          </div>
          <FridaySelector value={fridayDate} onChange={setFridayDate} label="תאריך אספקה:" />
        </div>

        {successMsg && (
          <div className="mb-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
        {error && (
          <div className="mb-4 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-slate-400">טוען קטלוג ספקים...</div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.map((p) => {
                const qty = quantities[p.id] || 0;
                const price = Number(p.supplier_price ?? 0);
                return (
                  <div
                    key={p.id}
                    className={`rounded-2xl p-3.5 border transition-all flex items-center justify-between gap-3 ${
                      qty > 0
                        ? 'border-[#C85A17] bg-[#FFF7ED]/70 shadow-sm'
                        : 'border-[#E8D5BE]/80 bg-[#FDFBF7]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm truncate">{p.name}</div>
                      <div className="text-xs text-[#8A330B] font-bold mt-0.5 tabular-nums">
                        {formatILS(price)} ליח׳
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((prev) => ({
                            ...prev,
                            [p.id]: Math.max(0, (prev[p.id] || 0) - 1),
                          }))
                        }
                        className="w-10 h-10 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={qty}
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [p.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          }))
                        }
                        className="w-14 h-10 text-center rounded-xl border border-[#E8D5BE] bg-white font-bold text-sm tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
                        }
                        className="w-10 h-10 rounded-xl bg-[#C85A17] text-white flex items-center justify-center active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end pt-2">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">הערות למשלוח / אריזה</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="לדוגמה: נא לארוז בארגזים סגורים עד השעה 06:30"
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm focus:bg-white focus:border-[#C85A17] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4 bg-[#FAF6F0] px-4 py-3 rounded-2xl border border-[#E8D5BE]">
                <div className="tabular-nums">
                  <div className="text-[11px] font-semibold text-slate-500">{totalUnits} יחידות נבחרו</div>
                  <div className="text-xl font-extrabold text-[#C85A17]">{formatILS(orderTotal)}</div>
                </div>
                <button
                  type="submit"
                  disabled={submitting || totalUnits === 0}
                  className="min-h-[48px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-bold text-sm shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'שולח...' : 'שלח הזמנה'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* היסטוריית ההזמנות של הספק בלבד */}
      <div
        className={`${
          mobileTab === 'history' ? 'block' : 'hidden md:block'
        } bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-6`}
      >
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-5 h-5 text-[#C85A17]" />
          <h3 className="font-serif text-2xl font-bold text-slate-900">היסטוריית ההזמנות שלי</h3>
        </div>

        {orders.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">עדיין לא הוגשו הזמנות.</div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <div key={o.id} className="rounded-2xl border border-[#E8D5BE]/80 bg-[#FDFBF7] p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-900">{formatFridayLabel(o.friday_date)}</span>
                    <span className="text-xs text-slate-400 mr-2 tabular-nums">הזמנה #{o.id}</span>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                    {ORDER_STATUS_LABELS[o.status]}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {o.items.map((it) => (
                    <span
                      key={it.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#E8D5BE] text-xs font-bold text-slate-800 tabular-nums"
                    >
                      <span className="text-[#C85A17] font-extrabold">{it.quantity}</span>
                      <span>{it.product_name}</span>
                    </span>
                  ))}
                </div>
                <div className="pt-2.5 border-t border-[#E8D5BE]/70 flex items-center justify-between text-sm tabular-nums">
                  <span className="text-slate-500">שולם: {formatILS(o.paid_amount)}</span>
                  <span className="font-extrabold text-slate-900">סה״כ: {formatILS(o.total_amount)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* סרגל ניווט תחתון קבוע למובייל עבור פורטל הספק בלבד (min-height: 56px) */}
      <nav
        aria-label="ניווט פורטל ספק"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8D5BE] shadow-[0_-6px_24px_rgba(30,36,43,0.1)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-3 px-2 py-1.5 gap-1">
          <button
            type="button"
            onClick={() => setMobileTab('new-order')}
            className={`min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl ${
              mobileTab === 'new-order' ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
            }`}
          >
            <ShoppingBag className="w-5 h-5" />
            <span className="text-xs font-bold">הזמנה חדשה</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('history')}
            className={`min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl ${
              mobileTab === 'history' ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-xs font-bold">ההזמנות שלי ({orders.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('balance')}
            className={`min-h-[56px] flex flex-col items-center justify-center gap-1 rounded-2xl ${
              mobileTab === 'balance' ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-xs font-bold">חוב / זכות</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
