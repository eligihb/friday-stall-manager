import React, { useEffect, useState, useMemo } from 'react';
import {
  ClipboardList,
  Wallet,
  TrendingUp,
  Users,
  ChefHat,
  ArrowLeft,
  Tag,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, getNextFridayISO, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from '../lib/format';
import { FridaySelector } from '../components/FridaySelector';
import type { AdminTab } from '../components/Layout';
import type { Order, User, Transaction, FridayInventoryItem } from '../types';

interface AdminDashboardProps {
  onNavigate: (tab: AdminTab) => void;
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [inventory, setInventory] = useState<FridayInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [ordRes, usrRes, txRes, invRes] = await Promise.all([
          apiFetch<{ orders: Order[] }>(`/api/orders?friday_date=${fridayDate}`),
          apiFetch<{ users: User[] }>('/api/users'),
          apiFetch<{ transactions: Transaction[] }>(`/api/finance/transactions?friday_date=${fridayDate}`),
          apiFetch<{ items: FridayInventoryItem[] }>(`/api/inventory?friday_date=${fridayDate}`),
        ]);
        if (!active) return;
        setOrders(ordRes.orders);
        setUsers(usrRes.users);
        setTransactions(txRes.transactions);
        setInventory(invRes.items);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [fridayDate]);

  const metrics = useMemo(() => {
    const totalSales = orders.reduce((s, o) => s + o.total_amount, 0);
    const totalCost = orders.reduce((s, o) => s + (o.estimated_cost ?? 0), 0);
    const grossProfit = totalSales - totalCost;
    const openDebt = users.filter((u) => u.balance < 0).reduce((s, u) => s + Math.abs(u.balance), 0);
    const totalToBake = inventory.reduce((s, i) => s + i.total_to_bake, 0);
    const incomeTx = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenseTx = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    return { totalSales, grossProfit, openDebt, totalToBake, incomeTx, expenseTx };
  }, [orders, users, transactions, inventory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">לוח בקרה — המטבח התימני</h2>
          <p className="text-sm text-slate-600 mt-1">
            תמונת מצב מרוכזת להזמנות, תכנון אפייה, רווחיות ויתרות פתוחות ליום שישי הנבחר.
          </p>
        </div>
        <FridaySelector value={fridayDate} onChange={setFridayDate} />
      </div>

      {/* כרטיסי KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">מכירות מוזמנות לשישי</span>
            <div className="w-9 h-9 rounded-xl bg-[#FFF7ED] text-[#C85A17] flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-3 tabular-nums">
            {formatILS(metrics.totalSales)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">{orders.length} הזמנות רשומות</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">רווח גולמי משוער (הזמנות)</span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-3 tabular-nums">
            {formatILS(metrics.grossProfit)}
          </div>
          <div className="text-xs text-slate-500 mt-1">לאחר קיזוז עלות ייצור</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">סה״כ יחידות לאפייה</span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <ChefHat className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-3 tabular-nums">
            {metrics.totalToBake.toLocaleString('he-IL')}
          </div>
          <div className="text-xs text-slate-500 mt-1">כולל אקסטרה לדוכן</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">חובות פתוחים (ספקים ולקוחות)</span>
            <div className="w-9 h-9 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-red-700 mt-3 tabular-nums">
            {formatILS(metrics.openDebt)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {users.filter((u) => u.balance < 0).length} חשבונות עם יתרת חוב
          </div>
        </div>
      </div>

      {/* קיצורי דרך מהירים */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('products')}
          className="group text-right bg-gradient-to-br from-[#C85A17] to-[#8A330B] text-white rounded-2xl p-5 shadow-card hover:opacity-95 transition-all"
        >
          <div className="flex items-center justify-between">
            <Tag className="w-6 h-6 text-amber-200" />
            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
          </div>
          <div className="font-bold text-lg mt-3">מחירון מוצרים ורווחיות</div>
          <div className="text-xs text-amber-100/90 mt-1">עדכון 4 מדרגות מחיר, מרווחים והוספת מאפים</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('orders')}
          className="group text-right bg-white rounded-2xl p-5 border border-[#E8D5BE] hover:border-[#C85A17] shadow-soft transition-all"
        >
          <div className="flex items-center justify-between">
            <ClipboardList className="w-6 h-6 text-[#C85A17]" />
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-[#C85A17] transition-transform group-hover:-translate-x-1" />
          </div>
          <div className="font-bold text-lg text-slate-900 mt-3">ניהול הזמנות שישי</div>
          <div className="text-xs text-slate-500 mt-1">לקוחות, ספקים סיטונאיים וחלוקת חסד</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('inventory')}
          className="group text-right bg-white rounded-2xl p-5 border border-[#E8D5BE] hover:border-[#C85A17] shadow-soft transition-all"
        >
          <div className="flex items-center justify-between">
            <ChefHat className="w-6 h-6 text-amber-700" />
            <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-[#C85A17] transition-transform group-hover:-translate-x-1" />
          </div>
          <div className="font-bold text-lg text-slate-900 mt-3">גיליון אפייה ומלאי דוכן</div>
          <div className="text-xs text-slate-500 mt-1">סיכום אוטומטי של כמויות להכנה + מלאי דוכן</div>
        </button>
      </div>

      {/* הזמנות אחרונות + תזרים שישי */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg text-slate-900">הזמנות ליום השישי הנבחר</h3>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="text-xs font-bold text-[#C85A17] hover:underline"
            >
              לכל ההזמנות
            </button>
          </div>
          {loading ? (
            <div className="py-8 text-center text-slate-400 text-sm">טוען נתונים...</div>
          ) : orders.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">אין עדיין הזמנות ליום שישי זה.</div>
          ) : (
            <div className="divide-y divide-[#F3E9DC]">
              {orders.slice(0, 6).map((o) => (
                <div key={o.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{o.recipient_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ORDER_TYPE_LABELS[o.order_type]} · {o.items.length} פריטים · {ORDER_STATUS_LABELS[o.status]}
                    </div>
                  </div>
                  <div className="text-left tabular-nums">
                    <div className="font-extrabold text-slate-900 text-sm">{formatILS(o.total_amount)}</div>
                    <div className="text-[11px] text-slate-500">שולם: {formatILS(o.paid_amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-[#C85A17]" />
              <h3 className="font-bold text-lg text-slate-900">סיכום תזרים לשישי</h3>
            </div>
            <div className="space-y-3 tabular-nums">
              <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50/70">
                <span className="text-sm font-semibold text-emerald-900">הכנסות בפועל</span>
                <span className="font-extrabold text-emerald-700">{formatILS(metrics.incomeTx)}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-xl bg-red-50/70">
                <span className="text-sm font-semibold text-red-900">הוצאות שנרשמו</span>
                <span className="font-extrabold text-red-700">{formatILS(metrics.expenseTx)}</span>
              </div>
              <div className="flex justify-between items-center p-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE]">
                <span className="text-sm font-bold text-slate-800">נטו תזרימי</span>
                <span className="font-extrabold text-lg text-slate-900">
                  {formatILS(metrics.incomeTx - metrics.expenseTx)}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="mt-5 w-full py-2.5 rounded-xl border border-[#E8D5BE] hover:border-[#C85A17] text-sm font-bold text-slate-800 hover:text-[#C85A17] transition-colors"
          >
            מעבר למסך כספים ותזרים
          </button>
        </div>
      </div>
    </div>
  );
}
