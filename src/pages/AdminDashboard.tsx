import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ClipboardList,
  ChefHat,
  TrendingUp,
  Users,
  Copy,
  Check,
  Save,
  Clock,
  CheckCircle2,
  Truck,
  PackageCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
} from '../lib/format';
import { formatOrderWhatsApp, formatProductionWhatsApp } from '../lib/whatsappFormat';
import { FridaySelector } from '../components/FridaySelector';
import { WhatsAppOrderParser } from '../components/WhatsAppOrderParser';
import type { AdminTab } from '../components/Layout';
import type {
  AdminProduct,
  BusinessSettings,
  FridayInventoryItem,
  Order,
  OrderStatus,
  OrderType,
  User,
} from '../types';

interface AdminDashboardProps {
  onNavigate: (tab: AdminTab) => void;
}

const NEXT_STATUS: Record<OrderStatus, OrderStatus> = {
  pending: 'ready',
  ready: 'delivered',
  delivered: 'pending',
};

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [inventory, setInventory] = useState<FridayInventoryItem[]>([]);
  const [bizSettings, setBizSettings] = useState<BusinessSettings | undefined>(undefined);
  const [extras, setExtras] = useState<Record<number, number>>({});
  const [savingExtraId, setSavingExtraId] = useState<number | null>(null);
  const [savedExtraId, setSavedExtraId] = useState<number | null>(null);
  const [copiedProd, setCopiedProd] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState<number | null>(null);
  const [boardFilter, setBoardFilter] = useState<string>('');
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
  }, [loadAll]);

  // מדדי KPI עליונים
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

  const saveExtraQty = async (item: FridayInventoryItem) => {
    const qty = Math.max(0, Math.floor(Number(extras[item.product_id] ?? 0)));
    setSavingExtraId(item.product_id);
    try {
      await apiFetch('/api/inventory', {
        method: 'PUT',
        body: JSON.stringify({
          friday_date: fridayDate,
          product_id: item.product_id,
          extra_stall_qty: qty,
        }),
      });
      setInventory((prev) =>
        prev.map((row) =>
          row.product_id === item.product_id
            ? { ...row, extra_stall_qty: qty, total_to_bake: row.ordered_total + qty }
            : row
        )
      );
      setSavedExtraId(item.product_id);
      setTimeout(() => setSavedExtraId((c) => (c === item.product_id ? null : c)), 1500);
    } finally {
      setSavingExtraId(null);
    }
  };

  const copyProductionWhatsApp = async () => {
    const liveItems = inventory.map((it) => {
      const ex = extras[it.product_id] ?? it.extra_stall_qty;
      return { ...it, extra_stall_qty: ex, total_to_bake: it.ordered_total + ex };
    });
    const text = formatProductionWhatsApp(fridayDate, liveItems, bizSettings);
    await navigator.clipboard.writeText(text);
    setCopiedProd(true);
    setTimeout(() => setCopiedProd(false), 2000);
  };

  const cycleOrderStatus = async (order: Order) => {
    const next = NEXT_STATUS[order.status];
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
  };

  const setOrderStatus = async (orderId: number, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  };

  const copyOrderSummary = async (order: Order) => {
    await navigator.clipboard.writeText(formatOrderWhatsApp(order, bizSettings));
    setCopiedOrderId(order.id);
    setTimeout(() => setCopiedOrderId((c) => (c === order.id ? null : c)), 1800);
  };

  const filteredBoardOrders = useMemo(() => {
    if (!boardFilter) return orders;
    return orders.filter((o) => o.status === boardFilter);
  }, [orders, boardFilter]);

  const typeBadge = (t: OrderType) => {
    if (t === 'supplier') return 'bg-orange-100 text-[#8A330B]';
    if (t === 'charity') return 'bg-purple-100 text-purple-800';
    return 'bg-sky-100 text-sky-800';
  };

  const statusMeta = (st: OrderStatus) => {
    if (st === 'delivered')
      return {
        cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        nextLabel: 'נמסר ✓ (לחץ לאיפוס)',
        icon: Truck,
      };
    if (st === 'ready')
      return {
        cls: 'bg-amber-100 text-amber-900 border-amber-300',
        nextLabel: 'מוכן · לחץ לסימון נמסר',
        icon: CheckCircle2,
      };
    return {
      cls: 'bg-slate-100 text-slate-700 border-slate-300',
      nextLabel: 'ממתין · לחץ לסימון מוכן',
      icon: Clock,
    };
  };

  return (
    <div className="space-y-6">
      {/* כותרת ובורר יום שישי */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
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
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">הזמנות פעילות לשישי</span>
            <div className="w-8 h-8 rounded-xl bg-[#FFF7ED] text-[#C85A17] flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2.5">
            {kpis.activeOrders}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {orders.filter((o) => o.status === 'delivered').length} נמסרו ·{' '}
            {orders.filter((o) => o.status === 'ready').length} מוכנות
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">סה״כ יחידות להכנה</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2.5">
            {kpis.totalUnitsToPrepare.toLocaleString('he-IL')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            עלות ייצור: {formatILS(kpis.totalProductionCost)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">הכנסה צפויה לשישי</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-700 mt-2.5">
            {formatILS(kpis.expectedFridayRevenue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            הזמנות: {formatILS(kpis.ordersRevenue)} + מלאי דוכן
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('supplier-orders')}
          className="text-right bg-white rounded-2xl p-4 sm:p-5 border border-[#E8D5BE]/80 hover:border-red-300 shadow-soft transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">חוב פתוח (ספקים ולקוחות)</span>
            <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-red-700 mt-2.5">
            {formatILS(kpis.totalOpenDebt)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {kpis.debtorsCount} חשבונות פתוחים ← לכרטסות
          </div>
        </button>
      </div>

      {/* קליטת הזמנה חכמה מוואטסאפ */}
      <WhatsAppOrderParser
        fridayDate={fridayDate}
        products={products}
        users={users}
        onOrderCreated={loadAll}
      />

      {/* ריכוז ייצור והכנה */}
      <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3E9DC] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ChefHat className="w-5 h-5 text-[#C85A17]" />
            <div>
              <h3 className="font-serif text-2xl font-bold text-slate-900">ריכוז ייצור והכנה לשישי</h3>
              <p className="text-xs text-slate-500">
                סיכום כמויות מכל ההזמנות (לקוחות, ספקים, משפחות נזקקות) + מלאי חופשי לדוכן ועלות ייצור.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={copyProductionWhatsApp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
          >
            {copiedProd ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copiedProd ? 'הועתק לוואטסאפ!' : 'העתק לוואטסאפ'}</span>
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">טוען ריכוז ייצור...</div>
        ) : (
          <div className="overflow-x-auto">
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
                          min="0"
                          value={curExtra}
                          onChange={(e) =>
                            setExtras((prev) => ({
                              ...prev,
                              [it.product_id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && dirty) saveExtraQty(it);
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
                            onClick={() => saveExtraQty(it)}
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
        )}
      </div>

      {/* לוח ליקוט ומסירה */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <PackageCheck className="w-6 h-6 text-[#C85A17]" />
            <div>
              <h3 className="font-serif text-2xl font-bold text-slate-900">לוח ליקוט ומסירה</h3>
              <p className="text-xs text-slate-500">
                מעקב אריזה לכל מקבל והחלפת סטטוס בלחיצה אחת: ממתין ← מוכן ← נמסר.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {[
              { key: '', label: `הכל (${orders.length})` },
              {
                key: 'pending',
                label: `ממתין (${orders.filter((o) => o.status === 'pending').length})`,
              },
              {
                key: 'ready',
                label: `מוכן (${orders.filter((o) => o.status === 'ready').length})`,
              },
              {
                key: 'delivered',
                label: `נמסר (${orders.filter((o) => o.status === 'delivered').length})`,
              },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setBoardFilter(tab.key)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  boardFilter === tab.key
                    ? 'bg-[#1E242B] text-white'
                    : 'bg-white border border-[#E8D5BE] text-slate-600 hover:bg-[#FFF7ED]'
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBoardOrders.map((order) => {
              const sm = statusMeta(order.status);
              const StatusIcon = sm.icon;
              const unpaid = Math.max(0, order.total_amount - order.paid_amount);

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border shadow-soft p-4 flex flex-col justify-between transition-all ${
                    order.status === 'delivered'
                      ? 'border-emerald-200 bg-emerald-50/20'
                      : order.status === 'ready'
                      ? 'border-amber-300'
                      : 'border-[#E8D5BE]/80'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <div className="font-bold text-base text-slate-900">{order.recipient_name}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${typeBadge(
                              order.order_type
                            )}`}
                          >
                            {ORDER_TYPE_LABELS[order.order_type]}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums">#{order.id}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => copyOrderSummary(order)}
                        className="p-2 rounded-xl bg-[#FAF6F0] hover:bg-emerald-50 text-slate-500 hover:text-emerald-700 transition-colors"
                        title="העתק סיכום לוואטסאפ"
                      >
                        {copiedOrderId === order.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    <div className="bg-[#FAF6F0] rounded-xl p-3 space-y-1.5 text-xs">
                      {order.items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between tabular-nums">
                          <span className="font-bold text-slate-800">{it.product_name}</span>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-[#E8D5BE] font-extrabold text-[#8A330B]">
                            × {it.quantity}
                          </span>
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <p className="mt-2 text-xs text-amber-900 bg-amber-50 rounded-lg px-2.5 py-1.5">
                        {order.notes}
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-[#F3E9DC] space-y-2.5">
                    <div className="flex items-center justify-between text-xs tabular-nums">
                      <span className="font-bold text-slate-700">
                        {order.order_type === 'charity'
                          ? 'תרומה (₪0.00)'
                          : `לתשלום: ${formatILS(order.total_amount)}`}
                      </span>
                      {order.order_type !== 'charity' && (
                        <span
                          className={`font-extrabold ${
                            unpaid > 0 ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {unpaid > 0 ? `נותר: ${formatILS(unpaid)}` : 'שולם במלואו ✓'}
                        </span>
                      )}
                    </div>

                    {/* כפתור החלפת סטטוס מהירה בלחיצה אחת */}
                    <button
                      type="button"
                      onClick={() => cycleOrderStatus(order)}
                      className={`w-full py-2 px-3 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all hover:brightness-95 ${sm.cls}`}
                    >
                      <StatusIcon className="w-4 h-4" />
                      <span>{sm.nextLabel}</span>
                    </button>

                    {/* בורר ישיר קטן לסטטוס */}
                    <div className="grid grid-cols-3 gap-1 text-[11px]">
                      {(['pending', 'ready', 'delivered'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setOrderStatus(order.id, st)}
                          className={`py-1 rounded-lg font-bold transition-colors ${
                            order.status === st
                              ? 'bg-[#1E242B] text-white'
                              : 'bg-[#FAF6F0] text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          {ORDER_STATUS_LABELS[st]}
                        </button>
                      ))}
                    </div>
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
