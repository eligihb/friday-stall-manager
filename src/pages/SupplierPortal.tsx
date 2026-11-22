import React, { useEffect, useState, useMemo } from 'react';
import {
  Wallet,
  Send,
  ClipboardList,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingBag,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  formatFridayLabel,
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
} from '../lib/format';
import { FridaySelector } from '../components/FridaySelector';
import { APP_BRAND_NAME } from '../lib/version';
import type { Order, Product } from '../types';

type SupplierMobileSection = 'history' | 'new-order' | 'balance';

interface SupplierPortalProps {
  supplierId?: number;
}

export function SupplierPortal({ supplierId }: SupplierPortalProps) {
  const { user, refreshUser } = useAuth();
  const [publicSupplier, setPublicSupplier] = useState<{
    id: number;
    name: string;
    phone?: string;
    notes?: string;
    total_ordered: number;
    total_paid: number;
    open_balance: number;
  } | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');
  const [mobileTab, setMobileTab] = useState<SupplierMobileSection>('history');

  const isPublicLinkMode = Boolean(supplierId);

  const loadData = async () => {
    setLoading(true);
    try {
      if (supplierId) {
        const res = await apiFetch<{
          supplier: {
            id: number;
            name: string;
            phone?: string;
            notes?: string;
            total_ordered: number;
            total_paid: number;
            open_balance: number;
          } | null;
          orders: Order[];
        }>(`/api/public/supplier-portal?supplier_id=${supplierId}`);
        setPublicSupplier(res.supplier);
        setOrders(res.orders || []);
      } else {
        const [prodRes, ordRes] = await Promise.all([
          apiFetch<{ products: Product[] }>('/api/products'),
          apiFetch<{ orders: Order[] }>('/api/orders'),
        ]);
        setProducts(prodRes.products);
        setOrders(ordRes.orders);
        await refreshUser();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני הספק');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [supplierId]);

  const totalUnits = useMemo(() => {
    return Object.values(quantities).reduce((s, q) => s + q, 0);
  }, [quantities]);

  // סיכום יתרות והזמנות בזמן אמת מכל ההזמנות הפעילות של הספק
  const summary = useMemo(() => {
    const valid = orders.filter((o) => o.status !== 'cancelled');
    const totalOrdered = valid.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const totalPaid = valid.reduce((s, o) => s + (Number(o.paid_amount) || 0), 0);
    const openBalance = Math.max(0, Math.round((totalOrdered - totalPaid) * 100) / 100);
    const unpaidOrPartialCount = valid.filter(
      (o) => (Number(o.paid_amount) || 0) < (Number(o.total_amount) || 0) - 0.01
    ).length;
    return {
      totalOrdered: Math.round(totalOrdered * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      openBalance,
      unpaidOrPartialCount,
    };
  }, [orders]);

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
      setSuccessMsg(`ההזמנה ל-${formatFridayLabel(fridayDate)} נשלחה בהצלחה!`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  const supplierName = publicSupplier?.name || user?.name || (supplierId ? `ספק #${supplierId}` : 'ספק');
  const supplierNotes = publicSupplier?.notes || user?.notes || '';

  const content = (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* כרטיסי סיכום יתרה פתוחה לתשלום מול הספק */}
      <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="inline-block px-3 py-0.5 rounded-full bg-amber-100 text-[#8A330B] text-xs font-extrabold">
              כרטסת ספק והיסטוריית הזמנות
            </span>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              {supplierName}
            </h2>
          </div>
          {summary.unpaidOrPartialCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 border border-red-300 text-red-800 text-xs font-extrabold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{summary.unpaidOrPartialCount} הזמנות ממתינות להשלמת תשלום</span>
            </span>
          )}
        </div>

        {supplierNotes && (
          <div className="text-xs text-amber-950 bg-amber-50 rounded-xl px-3.5 py-2 border border-amber-200">
            הערה: {supplierNotes}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5 text-center tabular-nums">
          <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]">
            <div className="text-[11px] font-bold text-slate-500">סה״כ הזמנות</div>
            <div className="text-lg sm:text-xl font-extrabold text-slate-900 mt-1">
              {formatILS(summary.totalOrdered)}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-[11px] font-bold text-emerald-700">שולם בפועל</div>
            <div className="text-lg sm:text-xl font-extrabold text-emerald-700 mt-1">
              {formatILS(summary.totalPaid)}
            </div>
          </div>

          <div
            className={`p-3.5 rounded-2xl border-2 ${
              summary.openBalance > 0
                ? 'bg-red-50/90 border-red-300'
                : 'bg-emerald-50/70 border-emerald-200'
            }`}
          >
            <div
              className={`text-[11px] font-extrabold ${
                summary.openBalance > 0 ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              יתרה פתוחה לתשלום
            </div>
            <div
              className={`text-lg sm:text-xl font-extrabold mt-1 ${
                summary.openBalance > 0 ? 'text-red-600' : 'text-emerald-700'
              }`}
            >
              {formatILS(summary.openBalance)}
            </div>
          </div>
        </div>
      </div>

      {/* היסטוריית כל ההזמנות הקודמות של הספק (ללא מחירי עלות, עם הדגשת תשלום חלקי / לא שולם) */}
      <div
        className={`${
          isPublicLinkMode || mobileTab === 'history' ? 'block' : 'hidden md:block'
        } bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-6 space-y-4`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-[#C85A17]" />
            <h3 className="font-serif text-2xl font-bold text-slate-900">
              היסטוריית הזמנות וסטטוס תשלומים ({orders.length})
            </h3>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400 text-sm">טוען היסטוריית הזמנות...</div>
        ) : orders.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">עדיין לא קיימות הזמנות בהיסטוריה.</div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => {
              const total = Number(o.total_amount) || 0;
              const paid = Number(o.paid_amount) || 0;
              const remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
              const isPaidFull = total <= 0 || paid >= total - 0.01;
              const isPartial = !isPaidFull && paid > 0.01;
              const isUnpaid = !isPaidFull && !isPartial;
              const totalOrderUnits = (o.items || []).reduce((s, it) => s + it.quantity, 0);

              return (
                <div
                  key={o.id}
                  className={`rounded-2xl border-2 p-4 space-y-3 transition-all ${
                    isUnpaid
                      ? 'border-red-300 bg-red-50/40'
                      : isPartial
                      ? 'border-amber-400 bg-amber-50/40'
                      : 'border-[#E8D5BE]/80 bg-[#FDFBF7]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-extrabold text-base text-slate-900">
                        {formatFridayLabel(o.friday_date)}
                      </span>
                      <span className="text-xs text-slate-500 mr-2 tabular-nums">
                        הזמנה #{o.id} ({totalOrderUnits} יח׳)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                          isPaidFull
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : isPartial
                            ? 'bg-amber-200 text-amber-950 border-amber-400'
                            : 'bg-red-200 text-red-950 border-red-400'
                        }`}
                      >
                        {isPaidFull
                          ? 'שולם מלא ✓'
                          : isPartial
                          ? '⚠️ שולם חלקית'
                          : '❗ לא שולם'}
                      </span>
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white border border-[#E8D5BE] text-slate-800">
                        סטטוס: {ORDER_STATUS_LABELS[o.status]}
                      </span>
                    </div>
                  </div>

                  {/* פירוט מוצרים וכמויות בלבד — ללא חשיפת מחירי עלות פנימיים */}
                  <div className="flex flex-wrap gap-1.5">
                    {(o.items || []).map((it) => (
                      <span
                        key={it.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#E8D5BE] text-xs font-bold text-slate-800 tabular-nums"
                      >
                        <span className="text-[#C85A17] font-extrabold">{it.quantity} יח׳</span>
                        <span>{it.product_name}</span>
                      </span>
                    ))}
                  </div>

                  {/* שורת מצב תשלום מודגשת וברורה */}
                  <div className="pt-2.5 border-t border-[#E8D5BE]/70 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm tabular-nums">
                    {isPaidFull ? (
                      <span className="font-extrabold text-emerald-800">
                        ✓ שולם במלואו ({formatILS(paid)} מתוך {formatILS(total)})
                      </span>
                    ) : isPartial ? (
                      <span className="font-extrabold text-amber-950 bg-amber-100 px-2.5 py-1 rounded-xl border border-amber-300">
                        שולם חלקית: {formatILS(paid)} מתוך {formatILS(total)} · יתרה לתשלום:{' '}
                        <strong className="text-red-700">{formatILS(remaining)}</strong>
                      </span>
                    ) : (
                      <span className="font-extrabold text-red-800 bg-red-100 px-2.5 py-1 rounded-xl border border-red-300">
                        לא שולם כלל (₪0.00 מתוך {formatILS(total)}) · יתרה לתשלום:{' '}
                        <strong>{formatILS(remaining)}</strong>
                      </span>
                    )}
                    <span className="font-extrabold text-slate-900">
                      סה״כ הזמנה: {formatILS(total)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* טופס הזמנה חדשה לספק מחובר — שמות מוצרים וכמויות בלבד ללא חשיפת עלויות פנימיות */}
      {!isPublicLinkMode && (
        <div
          className={`${
            mobileTab === 'new-order' ? 'block' : 'hidden md:block'
          } bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-6`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
            <div>
              <h3 className="font-serif text-2xl font-bold text-slate-900">הזמנת מוצרים לשישי</h3>
              <p className="text-xs text-slate-500 mt-0.5">בחר מוצרים וכמויות לאספקה ביום שישי הקרוב.</p>
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

          <form onSubmit={handleSubmitOrder} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.map((p) => {
                const qty = quantities[p.id] || 0;
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
                        className="w-9 h-9 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center active:scale-95"
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
                        className="w-14 h-9 text-center rounded-xl border border-[#E8D5BE] bg-white font-bold text-sm tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
                        }
                        className="w-9 h-9 rounded-xl bg-[#C85A17] text-white flex items-center justify-center active:scale-95"
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
                <label className="block text-xs font-bold text-slate-600 mb-1.5">הערות להזמנה</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערות לאריזה / שעת איסוף..."
                  className="w-full px-4 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                />
              </div>

              <div className="flex items-center justify-between md:justify-end gap-4 bg-[#FAF6F0] px-4 py-3 rounded-2xl border border-[#E8D5BE]">
                <div className="tabular-nums text-xs font-extrabold text-slate-700">
                  {totalUnits} יחידות נבחרו
                </div>
                <button
                  type="submit"
                  disabled={submitting || totalUnits === 0}
                  className="min-h-[44px] inline-flex items-center gap-2 px-5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-bold text-sm shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  <span>{submitting ? 'שולח...' : 'שלח הזמנה'}</span>
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {!isPublicLinkMode && (
        <nav
          aria-label="ניווט פורטל ספק"
          className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E8D5BE] shadow-[0_-6px_24px_rgba(30,36,43,0.1)] pb-[env(safe-area-inset-bottom)]"
        >
          <div className="grid grid-cols-2 px-2 py-1.5 gap-1">
            <button
              type="button"
              onClick={() => setMobileTab('history')}
              className={`min-h-[52px] flex flex-col items-center justify-center gap-1 rounded-2xl ${
                mobileTab === 'history' ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
              }`}
            >
              <ClipboardList className="w-5 h-5" />
              <span className="text-xs font-bold">היסטוריה ויתרות ({orders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('new-order')}
              className={`min-h-[52px] flex flex-col items-center justify-center gap-1 rounded-2xl ${
                mobileTab === 'new-order' ? 'text-[#C85A17] bg-[#FFF7ED]' : 'text-slate-500'
              }`}
            >
              <ShoppingBag className="w-5 h-5" />
              <span className="text-xs font-bold">הזמנה חדשה</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );

  if (isPublicLinkMode) {
    return (
      <div className="min-h-screen bg-[#FAF6F0] text-[#1E242B]">
        <header className="sticky top-0 z-40 bg-[#1E242B] text-white px-4 py-3.5 shadow-md">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#C85A17] flex items-center justify-center">
                <Flame className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-serif text-lg font-extrabold">{APP_BRAND_NAME}</h1>
                <p className="text-xs text-amber-300">כרטסת ספק · {supplierName}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-3xl mx-auto p-4">{content}</main>
      </div>
    );
  }

  return content;
}
