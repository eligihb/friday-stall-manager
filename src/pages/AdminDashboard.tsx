import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ClipboardList,
  ChefHat,
  TrendingUp,
  Users,
  Copy,
  Check,
  Save,
  PackageCheck,
  Plus,
  Minus,
  Share2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS } from '../lib/format';
import { buildWhatsAppShareUrl, formatProductionWhatsApp } from '../lib/whatsappFormat';
import { useFriday } from '../context/FridayContext';
import { FridaySelector } from '../components/FridaySelector';
import { WhatsAppOrderParser } from '../components/WhatsAppOrderParser';
import { OrderCard } from '../components/OrderCard';
import { QuickPaymentSheet } from '../components/QuickPaymentSheet';
import type { AdminTab } from '../components/Layout';
import type {
  AdminProduct,
  BusinessSettings,
  FridayInventoryItem,
  Order,
  OrderStatus,
  PaymentMethod,
  User,
} from '../types';

interface AdminDashboardProps {
  onNavigate: (tab: AdminTab) => void;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { fridayDate, setFridayDate, refreshTick } = useFriday();
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [inventory, setInventory] = useState<FridayInventoryItem[]>([]);
  const [bizSettings, setBizSettings] = useState<BusinessSettings | undefined>(undefined);
  const [extras, setExtras] = useState<Record<number, number>>({});
  const [savingExtraId, setSavingExtraId] = useState<number | null>(null);
  const [savedExtraId, setSavedExtraId] = useState<number | null>(null);
  const [copiedProd, setCopiedProd] = useState(false);
  const [boardFilter, setBoardFilter] = useState<string>('');
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, usrRes, prodRes, invRes, setRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>(`/api/orders?friday_date=${fridayDate}`),
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
        apiFetch<{ items: FridayInventoryItem[] }>(`/api/inventory?friday_date=${fridayDate}`),
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
      ]);
      setOrders(ordRes.orders);
      setUsers(usrRes.users);
      setProducts(prodRes.products);
      setInventory(invRes.items);
      setBizSettings(setRes.settings);
      const map: Record<number, number> = {};
      for (const it of invRes.items) {
        map[it.product_id] = it.extra_stall_qty;
      }
      setExtras(map);
    } finally {
      setLoading(false);
    }
  }, [fridayDate]);

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshTick]);

  const kpis = useMemo(() => {
    const activeOrders = orders.length;
    const totalUnitsToPrepare = inventory.reduce((sum, it) => {
      const ex = extras[it.product_id] ?? it.extra_stall_qty;
      return sum + it.ordered_total + ex;
    }, 0);
    const ordersRevenue = orders.reduce((s, o) => s + o.total_amount, 0);
    const stallPotential = inventory.reduce((sum, it) => {
      const ex = extras[it.product_id] ?? it.extra_stall_qty;
      return sum + ex * it.customer_price;
    }, 0);
    const expectedFridayRevenue = ordersRevenue + stallPotential;
    const totalOpenDebt = users
      .filter((u) => u.balance < 0)
      .reduce((s, u) => s + Math.abs(u.balance), 0);
    const totalProductionCost = inventory.reduce((sum, it) => {
      const ex = extras[it.product_id] ?? it.extra_stall_qty;
      return sum + (it.ordered_total + ex) * it.cost_price;
    }, 0);

    return {
      activeOrders,
      totalUnitsToPrepare,
      ordersRevenue,
      expectedFridayRevenue,
      totalOpenDebt,
      totalProductionCost,
      debtorsCount: users.filter((u) => u.balance < 0).length,
    };
  }, [orders, inventory, extras, users]);

  const saveExtraQty = async (productId: number, qtyValue: number) => {
    const qty = Math.max(0, Math.floor(qtyValue));
    setSavingExtraId(productId);
    try {
      await apiFetch('/api/inventory', {
        method: 'PUT',
        body: JSON.stringify({
          friday_date: fridayDate,
          product_id: productId,
          extra_stall_qty: qty,
        }),
      });
      setInventory((prev) =>
        prev.map((row) =>
          row.product_id === productId
            ? { ...row, extra_stall_qty: qty, total_to_bake: row.ordered_total + qty }
            : row
        )
      );
      setSavedExtraId(productId);
      setTimeout(() => setSavedExtraId((c) => (c === productId ? null : c)), 1400);
    } finally {
      setSavingExtraId(null);
    }
  };

  // כפתורי + / - במובייל מעדכנים ושומרים מיד ללא צורך במקלדת
  const stepExtraMobile = async (item: FridayInventoryItem, delta: number) => {
    const cur = extras[item.product_id] ?? item.extra_stall_qty;
    const next = Math.max(0, cur + delta);
    setExtras((prev) => ({ ...prev, [item.product_id]: next }));
    await saveExtraQty(item.product_id, next);
  };

  const liveProductionItems = useMemo(
    () =>
      inventory.map((it) => {
        const ex = extras[it.product_id] ?? it.extra_stall_qty;
        return { ...it, extra_stall_qty: ex, total_to_bake: it.ordered_total + ex };
      }),
    [inventory, extras]
  );

  const productionWaText = useMemo(
    () => formatProductionWhatsApp(fridayDate, liveProductionItems, bizSettings),
    [fridayDate, liveProductionItems, bizSettings]
  );

  const copyProductionWhatsApp = async () => {
    await navigator.clipboard.writeText(productionWaText);
    setCopiedProd(true);
    setTimeout(() => setCopiedProd(false), 2000);
  };

  const handleCycleStatus = async (order: Order, nextStatus: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
    await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
  };

  const handleConfirmQuickPay = async (
    orderId: number,
    paidAmount: number,
    method: PaymentMethod
  ) => {
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ paid_amount: paidAmount, payment_method: method }),
    });
    await loadAll();
  };

  const filteredBoardOrders = useMemo(() => {
    if (!boardFilter) return orders;
    return orders.filter((o) => o.status === boardFilter);
  }, [orders, boardFilter]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* כותרת ובורר יום שישי לדסקטופ */}
      <div className="hidden md:flex md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">מסך ראשי ותפעול שישי</h2>
          <p className="text-sm text-slate-600 mt-1">
            קליטת הזמנות מוואטסאפ, ריכוז ייצור ואפייה ולוח ליקוט ומסירה חי ליום שישי הנבחר.
          </p>
        </div>
        <FridaySelector value={fridayDate} onChange={setFridayDate} label="תאריך שישי:" />
      </div>

      {/* כרטיסי KPI עליונים */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500">הזמנות פעילות</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-[#FFF7ED] text-[#C85A17] flex items-center justify-center shrink-0">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {kpis.activeOrders}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {orders.filter((o) => o.status === 'delivered').length} נמסרו ·{' '}
            {orders.filter((o) => o.status === 'ready').length} מוכנות
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500">יחידות להכנה</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {kpis.totalUnitsToPrepare.toLocaleString('he-IL')}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            עלות: {formatILS(kpis.totalProductionCost)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500">הכנסה צפויה</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-emerald-700 mt-2">
            {formatILS(kpis.expectedFridayRevenue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            הזמנות: {formatILS(kpis.ordersRevenue)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('supplier-orders')}
          className="text-right bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 hover:border-red-300 shadow-soft transition-colors"
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500">חוב פתוח</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-3xl font-extrabold text-red-700 mt-2">
            {formatILS(kpis.totalOpenDebt)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">{kpis.debtorsCount} חשבונות ←</div>
        </button>
      </div>

      {/* קליטת הזמנה חכמה מוואטסאפ (בדסקטופ מוצג תמיד; במובייל נגיש גם כאן וגם דרך כפתור ה-+ המרכזי) */}
      <div className="hidden md:block">
        <WhatsAppOrderParser
          fridayDate={fridayDate}
          products={products}
          users={users}
          onOrderCreated={loadAll}
        />
      </div>

      {/* ריכוז ייצור והכנה — רשימה אנכית עם כפתורי +/- גדולים במובייל וטבלה בדסקטופ */}
      <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-[#F3E9DC] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ChefHat className="w-5 h-5 text-[#C85A17] shrink-0" />
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
                ריכוז ייצור והכנה לשישי
              </h3>
              <p className="text-xs text-slate-500 tabular-nums">
                סה״כ לייצור: <strong className="text-[#8A330B]">{kpis.totalUnitsToPrepare}</strong> יח׳ · עלות:{' '}
                <strong>{formatILS(kpis.totalProductionCost)}</strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyProductionWhatsApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
            >
              {copiedProd ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedProd ? 'הועתק!' : 'העתק לוואטסאפ'}</span>
            </button>
            <a
              href={buildWhatsAppShareUrl(productionWaText)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366]/15 border border-[#25D366]/40 text-emerald-900 font-bold text-xs"
            >
              <Share2 className="w-4 h-4 text-[#128C7E]" />
              <span>שתף</span>
            </a>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">טוען ריכוז ייצור...</div>
        ) : (
          <>
            {/* תצוגת מובייל: צ׳קליסט אנכי עם כפתורי +/- גדולים למלאי חופשי לדוכן */}
            <div className="md:hidden divide-y divide-[#F3E9DC]">
              {inventory.map((it) => {
                const curExtra = extras[it.product_id] ?? it.extra_stall_qty;
                const totalProduce = it.ordered_total + curExtra;
                const prodCost = totalProduce * it.cost_price;

                return (
                  <div
                    key={it.product_id}
                    className={`p-3.5 flex items-center justify-between gap-3 ${
                      totalProduce > 0 ? 'bg-white' : 'bg-slate-50/50 opacity-75'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base text-slate-900 truncate">
                          {it.product_name}
                        </span>
                        {savedExtraId === it.product_id && (
                          <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-0.5">
                            <Check className="w-3.5 h-3.5" /> נשמר
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] tabular-nums">
                        {it.customer_qty > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 font-bold">
                            לקוחות {it.customer_qty}
                          </span>
                        )}
                        {it.supplier_qty > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-orange-50 text-[#8A330B] font-bold">
                            ספקים {it.supplier_qty}
                          </span>
                        )}
                        {it.charity_qty > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 font-bold">
                            נזקקים {it.charity_qty}
                          </span>
                        )}
                        <span className="text-slate-400 font-semibold">
                          עלות {formatILS(prodCost)}
                        </span>
                      </div>

                      {/* פקדי +/- למלאי חופשי לדוכן */}
                      <div className="mt-2.5 flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500">מלאי דוכן:</span>
                        <button
                          type="button"
                          disabled={savingExtraId === it.product_id || curExtra <= 0}
                          onClick={() => stepExtraMobile(it, -5)}
                          className="w-10 h-10 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] font-extrabold text-xs text-slate-700 active:scale-95 disabled:opacity-40"
                        >
                          -5
                        </button>
                        <button
                          type="button"
                          disabled={savingExtraId === it.product_id || curExtra <= 0}
                          onClick={() => stepExtraMobile(it, -1)}
                          className="w-10 h-10 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center active:scale-95 disabled:opacity-40"
                          aria-label="הפחת 1"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <span className="min-w-[32px] text-center font-extrabold text-sm tabular-nums text-slate-900">
                          {curExtra}
                        </span>
                        <button
                          type="button"
                          disabled={savingExtraId === it.product_id}
                          onClick={() => stepExtraMobile(it, 1)}
                          className="w-10 h-10 rounded-xl bg-[#FFF7ED] border border-[#C85A17]/40 text-[#C85A17] flex items-center justify-center active:scale-95"
                          aria-label="הוסף 1"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={savingExtraId === it.product_id}
                          onClick={() => stepExtraMobile(it, 5)}
                          className="w-10 h-10 rounded-xl bg-[#C85A17] text-white font-extrabold text-xs active:scale-95"
                        >
                          +5
                        </button>
                      </div>
                    </div>

                    {/* תג כמות סופית גדולה לייצור */}
                    <div className="shrink-0 text-center bg-[#FFF7ED] border border-[#E8D5BE] rounded-2xl px-3 py-2.5 min-w-[68px] tabular-nums">
                      <div className="text-[10px] font-bold text-slate-500">לייצור</div>
                      <div className="text-2xl font-extrabold text-[#8A330B] leading-tight mt-0.5">
                        {totalProduce}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* תצוגת דסקטופ: טבלה מלאה */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F3E9DC]/70 text-slate-700 border-b border-[#E8D5BE]">
                    <th className="text-right py-3 px-4 font-bold">מוצר</th>
                    <th className="text-center py-3 px-2.5 font-bold">לקוחות</th>
                    <th className="text-center py-3 px-2.5 font-bold">ספקים</th>
                    <th className="text-center py-3 px-2.5 font-bold">נזקקים</th>
                    <th className="text-center py-3 px-3 font-bold">מלאי חופשי לדוכן</th>
                    <th className="text-center py-3 px-3 font-bold bg-[#FFF7ED]">סה״כ לייצור</th>
                    <th className="text-left py-3 px-4 font-bold">עלות ייצור</th>
                    <th className="text-center py-3 px-3 font-bold">שמירה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3E9DC] tabular-nums">
                  {inventory.map((it) => {
                    const curExtra = extras[it.product_id] ?? it.extra_stall_qty;
                    const dirty = curExtra !== it.extra_stall_qty;
                    const totalProduce = it.ordered_total + curExtra;
                    const prodCost = totalProduce * it.cost_price;

                    return (
                      <tr
                        key={it.product_id}
                        className={totalProduce > 0 ? 'hover:bg-[#FDFBF7]' : 'opacity-55 hover:opacity-100'}
                      >
                        <td className="py-2.5 px-4 font-bold text-slate-900">{it.product_name}</td>
                        <td className="py-2.5 px-2.5 text-center font-semibold text-sky-800">
                          {it.customer_qty || '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-semibold text-[#8A330B]">
                          {it.supplier_qty || '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-center font-semibold text-purple-800">
                          {it.charity_qty || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="number"
                            inputMode="numeric"
                            min="0"
                            value={curExtra}
                            onChange={(e) =>
                              setExtras((prev) => ({
                                ...prev,
                                [it.product_id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && dirty) saveExtraQty(it.product_id, curExtra);
                            }}
                            className="w-20 text-center py-1 rounded-lg border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-3 text-center bg-[#FFF7ED]/70 font-extrabold text-base text-[#8A330B]">
                          {totalProduce}
                        </td>
                        <td className="py-2.5 px-4 text-left font-bold text-slate-700">
                          {formatILS(prodCost)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {dirty ? (
                            <button
                              type="button"
                              disabled={savingExtraId === it.product_id}
                              onClick={() => saveExtraQty(it.product_id, curExtra)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#C85A17] text-white text-xs font-bold"
                            >
                              <Save className="w-3.5 h-3.5" />
                              <span>שמור</span>
                            </button>
                          ) : savedExtraId === it.product_id ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                              <Check className="w-3.5 h-3.5" />
                              נשמר
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1E242B] text-white font-bold tabular-nums">
                    <td className="py-3.5 px-4">סה״כ כולל</td>
                    <td className="py-3.5 px-2.5 text-center">
                      {inventory.reduce((s, i) => s + i.customer_qty, 0)}
                    </td>
                    <td className="py-3.5 px-2.5 text-center">
                      {inventory.reduce((s, i) => s + i.supplier_qty, 0)}
                    </td>
                    <td className="py-3.5 px-2.5 text-center">
                      {inventory.reduce((s, i) => s + i.charity_qty, 0)}
                    </td>
                    <td className="py-3.5 px-3 text-center">
                      {inventory.reduce((s, i) => s + (extras[i.product_id] ?? i.extra_stall_qty), 0)}
                    </td>
                    <td className="py-3.5 px-3 text-center text-amber-300 text-base">
                      {kpis.totalUnitsToPrepare}
                    </td>
                    <td className="py-3.5 px-4 text-left text-amber-300 text-base">
                      {formatILS(kpis.totalProductionCost)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* לוח ליקוט ומסירה בכרטיסיות מותאמות מובייל */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <PackageCheck className="w-6 h-6 text-[#C85A17]" />
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">לוח ליקוט ומסירה</h3>
              <p className="text-xs text-slate-500">
                החלפת סטטוס בלחיצה אחת, סימון תשלום מהיר ושיתוף וואטסאפ ישיר.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { key: '', label: `הכל (${orders.length})` },
              { key: 'pending', label: `ממתין (${orders.filter((o) => o.status === 'pending').length})` },
              { key: 'ready', label: `מוכן (${orders.filter((o) => o.status === 'ready').length})` },
              { key: 'delivered', label: `נמסר (${orders.filter((o) => o.status === 'delivered').length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setBoardFilter(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  boardFilter === tab.key
                    ? 'bg-[#1E242B] text-white'
                    : 'bg-white border border-[#E8D5BE] text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredBoardOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E8D5BE] p-10 text-center text-slate-400 text-sm">
            אין הזמנות להצגה בלוח הליקוט ליום שישי זה.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredBoardOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                bizSettings={bizSettings}
                onCycleStatus={handleCycleStatus}
                onQuickPay={(o) => setPayOrder(o)}
              />
            ))}
          </div>
        )}
      </div>

      {/* חלונית תשלום מהיר נפתחת מלמטה */}
      <QuickPaymentSheet
        order={payOrder}
        onClose={() => setPayOrder(null)}
        onConfirm={handleConfirmQuickPay}
      />
    </div>
  );
}
