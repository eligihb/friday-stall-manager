import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  ClipboardList,
  ChefHat,
  TrendingUp,
  Users,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Share2,
  Link2,
  Check,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS } from '../lib/format';
import {
  buildDigitalMenuUrl,
  buildWhatsAppShareUrl,
  formatDigitalMenuWhatsApp,
} from '../lib/whatsappFormat';
import { useFriday } from '../context/FridayContext';
import { FridaySelector } from '../components/FridaySelector';
import type { AdminTab } from '../components/Layout';
import type { AdminProduct, BusinessSettings, FridayInventoryItem, Order, User } from '../types';

interface AdminDashboardProps {
  onNavigate: (tab: AdminTab) => void;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { fridayDate, setFridayDate, refreshTick } = useFriday();
  const [orders, setOrders] = useState<Order[]>([]);
  const [awaitingOrders, setAwaitingOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [bizSettings, setBizSettings] = useState<BusinessSettings | undefined>(undefined);
  const [copiedMenuLink, setCopiedMenuLink] = useState(false);
  const [inventory, setInventory] = useState<FridayInventoryItem[]>([]);

  const loadAll = useCallback(async () => {
    const [ordRes, awaitRes, usrRes, invRes, prodRes, setRes] = await Promise.all([
      apiFetch<{ orders: Order[] }>(`/api/orders?friday_date=${fridayDate}`),
      apiFetch<{ orders: Order[] }>('/api/orders?status=awaiting_approval'),
      apiFetch<{ users: User[] }>('/api/users'),
      apiFetch<{ items: FridayInventoryItem[] }>(`/api/inventory?friday_date=${fridayDate}`),
      apiFetch<{ products: AdminProduct[] }>('/api/products'),
      apiFetch<{ settings: BusinessSettings }>('/api/settings'),
    ]);
    setOrders(ordRes.orders.filter((o) => o.status !== 'awaiting_approval'));
    setAwaitingOrders(awaitRes.orders);
    setUsers(usrRes.users);
    setInventory(invRes.items);
    setProducts(prodRes.products);
    setBizSettings(setRes.settings);
  }, [fridayDate]);

  const menuShareUrl = useMemo(() => {
    const text = formatDigitalMenuWhatsApp(products, bizSettings);
    return buildWhatsAppShareUrl(text);
  }, [products, bizSettings]);

  const handleCopyMenuLink = async () => {
    await navigator.clipboard.writeText(buildDigitalMenuUrl());
    setCopiedMenuLink(true);
    setTimeout(() => setCopiedMenuLink(false), 1800);
  };

  const handleApproveOrder = async (orderId: number) => {
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'pending' }),
    });
    await loadAll();
  };

  const handleRejectOrder = async (orderId: number) => {
    if (!window.confirm('למחוק הזמנה זו לצמיתות?')) return;
    await apiFetch(`/api/orders/${orderId}`, { method: 'DELETE' });
    await loadAll();
  };

  useEffect(() => {
    loadAll();
  }, [loadAll, refreshTick]);

  const kpis = useMemo(() => {
    const activeOrders = orders.length;
    const totalUnitsToPrepare = inventory.reduce(
      (sum, it) => sum + it.ordered_total + it.extra_stall_qty,
      0
    );
    const ordersRevenue = orders.reduce((s, o) => s + o.total_amount, 0);
    const stallPotential = inventory.reduce(
      (sum, it) => sum + it.extra_stall_qty * it.customer_price,
      0
    );
    const expectedFridayRevenue = ordersRevenue + stallPotential;
    const totalOpenDebt = users
      .filter((u) => u.balance < 0)
      .reduce((s, u) => s + Math.abs(u.balance), 0);
    const totalProductionCost = inventory.reduce(
      (sum, it) => sum + (it.ordered_total + it.extra_stall_qty) * it.cost_price,
      0
    );

    return {
      activeOrders,
      totalUnitsToPrepare,
      ordersRevenue,
      expectedFridayRevenue,
      totalOpenDebt,
      totalProductionCost,
      debtorsCount: users.filter((u) => u.balance < 0).length,
    };
  }, [orders, inventory, users]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* כותרת ובורר יום שישי לדסקטופ */}
      <div className="hidden md:flex md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">מסך ראשי</h2>
          <p className="text-sm text-slate-600 mt-1">
            תמונת מצב מהירה ליום שישי הנבחר — הזמנות, יחידות למאפייה, הכנסות וחובות פתוחים.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={menuShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-xs shadow-sm"
          >
            <Share2 className="w-4 h-4" />
            <span>שתף תפריט בוואטסאפ</span>
          </a>
          <button
            type="button"
            onClick={() => onNavigate('flyer')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FFF7ED] border border-[#C85A17]/40 hover:bg-[#FFEDD5] text-[#8A330B] font-extrabold text-xs shadow-sm"
          >
            <span>פלייר מחירון</span>
          </button>
          <button
            type="button"
            onClick={handleCopyMenuLink}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-[#E8D5BE] hover:border-[#C85A17] text-[#8A330B] font-extrabold text-xs shadow-sm"
          >
            {copiedMenuLink ? <Check className="w-4 h-4 text-emerald-600" /> : <Link2 className="w-4 h-4" />}
            <span>{copiedMenuLink ? 'הקישור הועתק!' : 'העתק קישור תפריט'}</span>
          </button>
          <FridaySelector value={fridayDate} onChange={setFridayDate} label="תאריך שישי:" />
        </div>
      </div>

      {/* כפתורי שיתוף תפריט ופלייר גם במובייל */}
      <div className="md:hidden grid grid-cols-3 gap-2">
        <a
          href={menuShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="py-2.5 px-2 rounded-xl bg-[#25D366] text-white font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-sm"
        >
          <Share2 className="w-3.5 h-3.5 shrink-0" />
          <span>שתף בוואטסאפ</span>
        </a>
        <button
          type="button"
          onClick={() => onNavigate('flyer')}
          className="py-2.5 px-2 rounded-xl bg-[#FFF7ED] border border-[#C85A17]/40 text-[#8A330B] font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-sm"
        >
          <span>פלייר מחירון</span>
        </button>
        <button
          type="button"
          onClick={handleCopyMenuLink}
          className="py-2.5 px-2 rounded-xl bg-white border border-[#E8D5BE] text-[#8A330B] font-extrabold text-[11px] flex items-center justify-center gap-1 shadow-sm"
        >
          {copiedMenuLink ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Link2 className="w-3.5 h-3.5 shrink-0" />}
          <span>{copiedMenuLink ? 'הועתק!' : 'קישור תפריט'}</span>
        </button>
      </div>

      {/* הזמנות ממתינות לאישור */}
      {awaitingOrders.length > 0 && (
        <div className="bg-gradient-to-l from-amber-50 via-[#FFF7ED] to-red-50/70 rounded-3xl border-2 border-[#C85A17]/60 shadow-card p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#C85A17] text-white flex items-center justify-center shadow-sm shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#6D280B] leading-tight">
                הזמנות ממתינות לאישור ({awaitingOrders.length})
              </h3>
              <p className="text-xs text-amber-950/80">
                הזמנות אלו התקבלו מהתפריט הציבורי ואינן נספרות עד לאישור.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {awaitingOrders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white rounded-2xl border border-[#E8D5BE] p-4 shadow-soft flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-base text-slate-900">{ord.recipient_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        #{ord.id} · {formatFridayLabel(ord.friday_date)}
                      </div>
                    </div>
                    <div className="font-extrabold text-lg text-[#C85A17] tabular-nums">
                      {formatILS(ord.total_amount)}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-12 gap-2 pt-2 border-t border-[#F3E9DC]">
                  <button
                    type="button"
                    onClick={() => handleApproveOrder(ord.id)}
                    className="col-span-8 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>אשר הזמנה</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRejectOrder(ord.id)}
                    className="col-span-4 min-h-[44px] rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-extrabold text-xs flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>מחק</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* כרטיסי KPI נקיים בלבד */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
        <button
          type="button"
          onClick={() => onNavigate('customer-orders')}
          className="text-right bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 hover:border-[#C85A17]/50 shadow-soft transition-colors"
        >
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
        </button>

        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-bold text-slate-500">יחידות לרכש מאפייה</span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
              <ChefHat className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-2">
            {kpis.totalUnitsToPrepare.toLocaleString('he-IL')}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            מזומן למאפייה: {formatILS(kpis.totalProductionCost)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('reports')}
          className="text-right bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 hover:border-emerald-300 shadow-soft transition-colors"
        >
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
        </button>

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
    </div>
  );
}
