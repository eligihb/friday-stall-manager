import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  History,
  Search,
  Calendar,
  ArrowDownWideNarrow,
  ShoppingBag,
  Wallet,
  Package,
  Filter,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS } from '../lib/format';
import { useFriday } from '../context/FridayContext';
import { OrderCard } from '../components/OrderCard';
import { QuickPaymentSheet } from '../components/QuickPaymentSheet';
import type { BusinessSettings, Order, OrderStatus, PaymentMethod, User } from '../types';

type PeriodMode = 'week' | 'month' | 'year' | 'all';
type ArchiveSort = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  return `${HEBREW_MONTHS[idx] || m} ${y}`;
}

export function PastOrdersArchivePage() {
  const { activeWeekRange, refreshTick } = useFriday();
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bizSettings, setBizSettings] = useState<BusinessSettings | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // סינון ומיון
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [selectedWeek, setSelectedWeek] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'supplier' | 'charity'>('all');
  const [showDeletedBin, setShowDeletedBin] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ArchiveSort>('date_desc');
  const [payOrder, setPayOrder] = useState<Order | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const ordersEndpoint = showDeletedBin ? '/api/orders?status=deleted_by_vendor' : '/api/orders';
      const [ordRes, usrRes, setRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>(ordersEndpoint),
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
      ]);
      setOrders(ordRes.orders);
      setUsers(usrRes.users);
      setBizSettings(setRes.settings);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת ארכיון ההזמנות');
    } finally {
      setLoading(false);
    }
  }, [showDeletedBin]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  // רשימת שבועות (תאריכי שישי), חודשים ושנים זמינים מתוך ההזמנות
  const periodOptions = useMemo(() => {
    const weeksSet = new Set<string>();
    const monthsSet = new Set<string>();
    const yearsSet = new Set<string>();

    for (const o of orders) {
      if (o.friday_date) {
        weeksSet.add(o.friday_date);
        monthsSet.add(o.friday_date.slice(0, 7));
        yearsSet.add(o.friday_date.slice(0, 4));
      }
    }

    const weeks = Array.from(weeksSet).sort((a, b) => b.localeCompare(a));
    const pastWeeks = weeks.filter((w) => w < activeWeekRange.fridayDate);
    const months = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
    const years = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));

    return {
      weeks: pastWeeks.length > 0 ? pastWeeks : weeks,
      allWeeks: weeks,
      months,
      years,
    };
  }, [orders, activeWeekRange.fridayDate]);

  useEffect(() => {
    if (!selectedWeek && periodOptions.weeks.length > 0) {
      setSelectedWeek(periodOptions.weeks[0]);
    }
    if (!selectedMonth && periodOptions.months.length > 0) {
      setSelectedMonth(periodOptions.months[0]);
    }
    if (!selectedYear && periodOptions.years.length > 0) {
      setSelectedYear(periodOptions.years[0]);
    }
  }, [periodOptions, selectedWeek, selectedMonth, selectedYear]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filteredOrders = useMemo(() => {
    let list = [...orders];

    // 1. סינון תקופה
    if (periodMode === 'week' && selectedWeek) {
      list = list.filter((o) => o.friday_date === selectedWeek);
    } else if (periodMode === 'month' && selectedMonth) {
      list = list.filter((o) => o.friday_date.startsWith(selectedMonth));
    } else if (periodMode === 'year' && selectedYear) {
      list = list.filter((o) => o.friday_date.startsWith(selectedYear));
    }

    // 2. סינון סוג הזמנה
    if (typeFilter !== 'all') {
      list = list.filter((o) => o.order_type === typeFilter);
    }

    // 3. חיפוש לפי שם לקוח / טלפון / מספר הזמנה
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, '');
      list = list.filter((o) => {
        const u = o.user_id ? userById.get(o.user_id) : undefined;
        const phoneDigits = String(u?.phone || '').replace(/\D/g, '');
        const itemsText = o.items.map((it) => it.product_name).join(' ').toLowerCase();
        return (
          o.recipient_name.toLowerCase().includes(q) ||
          String(o.id).includes(q) ||
          (o.notes || '').toLowerCase().includes(q) ||
          itemsText.includes(q) ||
          (qDigits.length >= 2 && phoneDigits.includes(qDigits))
        );
      });
    }

    // 4. מיון
    list.sort((a, b) => {
      if (sortBy === 'amount_desc') return b.total_amount - a.total_amount || b.id - a.id;
      if (sortBy === 'amount_asc') return a.total_amount - b.total_amount || b.id - a.id;
      if (sortBy === 'date_asc') {
        return a.friday_date.localeCompare(b.friday_date) || a.id - b.id;
      }
      return b.friday_date.localeCompare(a.friday_date) || b.id - a.id;
    });

    return list;
  }, [orders, periodMode, selectedWeek, selectedMonth, selectedYear, typeFilter, searchQuery, sortBy, userById]);

  // כרטיסי סיכום דינמיים לפי הסינון הנבחר
  const summary = useMemo(() => {
    const valid = filteredOrders.filter((o) => o.status !== 'cancelled');
    const totalRevenue = valid.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const totalPaid = valid.reduce((s, o) => s + (Number(o.paid_amount) || 0), 0);
    const totalItemsQty = valid.reduce(
      (s, o) => s + o.items.reduce((is, it) => is + (Number(it.quantity) || 0), 0),
      0
    );
    return {
      orderCount: filteredOrders.length,
      validCount: valid.length,
      totalRevenue,
      totalPaid,
      totalItemsQty,
    };
  }, [filteredOrders]);

  const handleCycleStatus = async (order: Order, nextStatus: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
    await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: nextStatus,
        ...(nextStatus === 'cancelled' ? { cancelled_by: 'vendor' } : {}),
      }),
    });
    if (
      nextStatus === 'cancelled' ||
      order.status === 'cancelled' ||
      nextStatus === 'deleted_by_vendor' ||
      order.status === 'deleted_by_vendor'
    ) {
      await loadData();
    }
  };

  const handleConfirmQuickPay = async (
    orderId: number,
    paid: number,
    method: PaymentMethod
  ) => {
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ paid_amount: paid, payment_method: method }),
    });
    await loadData();
  };

  const handleDelete = async (id: number) => {
    setOrders((prev) => prev.filter((o) => String(o.id) !== String(id)));
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const handlePermanentDelete = async (id: number) => {
    setOrders((prev) => prev.filter((o) => String(o.id) !== String(id)));
    await apiFetch(`/api/orders/${id}?permanent=true`, { method: 'DELETE' });
    await loadData();
  };

  return (
    <div className="space-y-5">
      {/* כותרת המסך */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800 flex items-center gap-2.5">
            <History className="w-7 h-7 text-[#C85A17]" />
            <span>ארכיון והזמנות קודמות</span>
          </h2>
            <p className="text-sm text-slate-600 mt-1">
            צפייה, חיפוש וסינון מתקדם של כל ההזמנות לפי שבוע, חודש, שנה או לקוח.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDeletedBin((v) => !v)}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold border transition-colors self-start sm:self-center ${
            showDeletedBin
              ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
              : 'bg-white hover:bg-slate-50 text-slate-700 border-[#E8D5BE]'
          }`}
        >
          <span>{showDeletedBin ? '← חזרה לארכיון ההזמנות' : '🗑️ הזמנות שנמחקו'}</span>
        </button>
      </div>

      {/* כרטיסי סיכום דינמיים בהתאם לסינון שנבחר */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4 tabular-nums">
        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
            <ShoppingBag className="w-3.5 h-3.5 text-[#C85A17]" />
            <span>סה״כ הזמנות בסינון</span>
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-1">
            {summary.orderCount}
          </div>
          {summary.validCount !== summary.orderCount && (
            <div className="text-[11px] text-slate-500 mt-0.5">
              מתוכן {summary.validCount} פעילות/נמסרו
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
            <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            <span>סה״כ הכנסות</span>
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-emerald-700 mt-1">
            {formatILS(summary.totalRevenue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            שולם בפועל: {formatILS(summary.totalPaid)}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
            <Package className="w-3.5 h-3.5 text-amber-600" />
            <span>כמות פריטים</span>
          </div>
          <div className="text-lg sm:text-2xl font-extrabold text-slate-900 mt-1">
            {summary.totalItemsQty.toLocaleString('he-IL')}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">יחידות / מארזים</div>
        </div>
      </div>

      {/* סרגל סינון ומיון מתקדם */}
      <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 space-y-3.5">
        {/* בחירת מצב תקופה */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-extrabold text-slate-600 ml-1">
              <Calendar className="w-3.5 h-3.5 text-[#C85A17]" />
              <span>תקופה:</span>
            </span>
            {(
              [
                ['week', 'לפי שבוע'],
                ['month', 'לפי חודש'],
                ['year', 'לפי שנה'],
                ['all', 'הכל'],
              ] as Array<[PeriodMode, string]>
            ).map(([mode, lbl]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setPeriodMode(mode)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-colors ${
                  periodMode === mode
                    ? 'bg-[#C85A17] text-white border-[#C85A17] shadow-sm'
                    : 'bg-[#FAF6F0] text-slate-700 border-[#E8D5BE] hover:bg-[#FFF7ED]'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* בחירת שבוע / חודש / שנה ספציפיים */}
          {periodMode === 'week' && (
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-bold text-slate-800"
            >
              {periodOptions.allWeeks.map((w) => (
                <option key={w} value={w}>
                  {formatFridayLabel(w)}
                  {w === activeWeekRange.fridayDate ? ' (השבוע הפעיל)' : ''}
                </option>
              ))}
            </select>
          )}
          {periodMode === 'month' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-bold text-slate-800"
            >
              {periodOptions.months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthLabel(m)}
                </option>
              ))}
            </select>
          )}
          {periodMode === 'year' && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-bold text-slate-800"
            >
              {periodOptions.years.map((y) => (
                <option key={y} value={y}>
                  שנת {y}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* שורת חיפוש + סוג הזמנה + מיון */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי שם לקוח, טלפון, #הזמנה או פריט..."
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-semibold focus:bg-white focus:border-[#C85A17] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]">
            <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as 'all' | 'customer' | 'supplier' | 'charity')
              }
              className="w-full text-xs font-bold text-slate-700 bg-transparent focus:outline-none"
            >
              <option value="all">כל סוגי ההזמנות</option>
              <option value="customer">הזמנות לקוחות</option>
              <option value="supplier">הזמנות ספקים</option>
              <option value="charity">הזמנות מסובסדות</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]">
            <ArrowDownWideNarrow className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ArchiveSort)}
              className="w-full text-xs font-bold text-slate-700 bg-transparent focus:outline-none"
            >
              <option value="date_desc">תאריך: מהחדש לישן</option>
              <option value="date_asc">תאריך: מהישן לחדש</option>
              <option value="amount_desc">סכום: מהגבוה לנמוך</option>
              <option value="amount_asc">סכום: מהנמוך לגבוה</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען ארכיון הזמנות...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-[#E8D5BE]">
          לא נמצאו הזמנות התואמות לסינון הנבחר.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filteredOrders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              bizSettings={bizSettings}
              showFridayDate
              onCycleStatus={handleCycleStatus}
              onQuickPay={(ord) => setPayOrder(ord)}
              onDelete={handleDelete}
              onPermanentDelete={handlePermanentDelete}
            />
          ))}
        </div>
      )}

      <QuickPaymentSheet
        order={payOrder}
        onClose={() => setPayOrder(null)}
        onConfirm={handleConfirmQuickPay}
      />
    </div>
  );
}
