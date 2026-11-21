import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  Repeat,
  Download,
  CheckCircle2,
  Edit3,
  X,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ShoppingBag,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatFridayLabel,
  formatHebrewDate,
  formatILS,
  getNextFridayISO,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { downloadCsv } from '../lib/csvExport';
import { useFriday } from '../context/FridayContext';
import { useContactDrawer } from '../context/ContactDrawerContext';
import { loadAllCashRegisters } from '../lib/cashRegisterStore';
import type { FixedExpense, Order, PaymentMethod, Transaction, WasteLogResponse } from '../types';

type FinancePeriodKey = 'this_friday' | 'this_month' | 'prev_month' | 'yearly';

const PERIOD_TABS: Array<{ key: FinancePeriodKey; label: string }> = [
  { key: 'this_friday', label: 'שישי הזה' },
  { key: 'this_month', label: 'חודש נוכחי' },
  { key: 'prev_month', label: 'חודש קודם' },
  { key: 'yearly', label: 'שנתי' },
];

const EXPENSE_PRESETS: Array<{ label: string; defaultMethod?: PaymentMethod }> = [
  { label: 'רכש מאפייה (מזומן)', defaultMethod: 'cash' },
  { label: 'שכר עובד יומי', defaultMethod: 'cash' },
  { label: 'דלק / נסיעות', defaultMethod: 'cash' },
  { label: 'כביש 6', defaultMethod: 'transfer' },
  { label: 'אריזות וכלים חד-פעמיים', defaultMethod: 'cash' },
  { label: 'חומרי גלם (סלסה, כבד קצוץ ותבלינים)', defaultMethod: 'cash' },
  { label: 'שכירות / דמי דוכן', defaultMethod: 'transfer' },
  { label: 'שיווק ופרסום', defaultMethod: 'transfer' },
];

const HEBREW_MONTHS = [
  'ינו׳',
  'פבר׳',
  'מרץ',
  'אפר׳',
  'מאי',
  'יוני',
  'יולי',
  'אוג׳',
  'ספט׳',
  'אוק׳',
  'נוב׳',
  'דצמ׳',
];

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function getMonthRange(year: number, month1to12: number): { from: string; to: string; ym: string } {
  const ym = `${year}-${String(month1to12).padStart(2, '0')}`;
  const lastDay = new Date(year, month1to12, 0).getDate();
  return {
    from: `${ym}-01`,
    to: `${ym}-${String(lastDay).padStart(2, '0')}`,
    ym,
  };
}

function calcPctChange(current: number, previous: number): { pct: number; dir: 'up' | 'down' | 'flat' } {
  if (Math.abs(previous) < 0.01) {
    if (current > 0) return { pct: 100, dir: 'up' };
    if (current < 0) return { pct: -100, dir: 'down' };
    return { pct: 0, dir: 'flat' };
  }
  const raw = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return {
    pct: raw,
    dir: raw > 0 ? 'up' : raw < 0 ? 'down' : 'flat',
  };
}

export function FinancePage() {
  const { fridayDate: globalFriday } = useFriday();
  const { openContactById } = useContactDrawer();

  const [period, setPeriod] = useState<FinancePeriodKey>('this_friday');
  const [orders, setOrders] = useState<Order[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [wasteByFriday, setWasteByFriday] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedChartIndex, setSelectedChartIndex] = useState<number | null>(null);

  // מודאל קופץ להזנת הוצאה שבועית / חודשית
  const [expenseModalMode, setExpenseModalMode] = useState<'weekly' | 'monthly' | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [expForm, setExpForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    friday_date: globalFriday || getNextFridayISO(),
    category: EXPENSE_PRESETS[0].label,
    payment_method: 'cash' as PaymentMethod,
    amount: '',
    notes: '',
    saveAsFixed: false,
  });

  // מודאל הוצאה קבועה
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [editingFixed, setEditingFixed] = useState<FixedExpense | null>(null);
  const [fixedForm, setFixedForm] = useState({
    name: '',
    amount: '',
    frequency: 'weekly' as 'weekly' | 'monthly',
    payment_method: 'transfer' as PaymentMethod,
  });

  // אישור מחיקת תנועה / הוצאה קבועה ללא window.confirm
  const [deleteTxId, setDeleteTxId] = useState<number | null>(null);
  const [deleteFixedId, setDeleteFixedId] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ordRes, txRes, fixRes, wasteRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>('/api/orders'),
        apiFetch<{ transactions: Transaction[] }>('/api/finance/transactions'),
        apiFetch<{ fixed_expenses: FixedExpense[] }>('/api/finance/fixed-expenses'),
        apiFetch<WasteLogResponse>(`/api/finance/waste?friday_date=${globalFriday}`).catch(() => ({
          friday_date: globalFriday,
          items: [],
          total_waste_units: 0,
          total_waste_cost: 0,
        })),
      ]);
      setOrders(ordRes.orders || []);
      setTransactions(txRes.transactions || []);
      setFixedExpenses(fixRes.fixed_expenses || []);
      setWasteByFriday((prev) => ({
        ...prev,
        [globalFriday]: wasteRes.total_waste_cost || 0,
      }));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני כספים');
    } finally {
      setLoading(false);
    }
  }, [globalFriday]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // חישוב טווחי תאריכים לתקופה הנוכחית ולתקופה הקודמת להשוואה
  const periodBounds = useMemo(() => {
    const baseDate = new Date(`${globalFriday || getNextFridayISO()}T12:00:00`);
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth() + 1;

    if (period === 'this_friday') {
      const curFri = globalFriday || getNextFridayISO();
      const prevFri = shiftDays(curFri, -7);
      return {
        current: { from: curFri, to: curFri, label: formatFridayLabel(curFri), weeks: 1, months: 1 / 4.33 },
        previous: { from: prevFri, to: prevFri, label: formatFridayLabel(prevFri), weeks: 1, months: 1 / 4.33 },
      };
    }

    if (period === 'this_month') {
      const curM = getMonthRange(y, m);
      const prevYear = m === 1 ? y - 1 : y;
      const prevMonth = m === 1 ? 12 : m - 1;
      const prevM = getMonthRange(prevYear, prevMonth);
      return {
        current: { from: curM.from, to: curM.to, label: `חודש ${curM.ym}`, weeks: 4.33, months: 1 },
        previous: { from: prevM.from, to: prevM.to, label: `חודש ${prevM.ym}`, weeks: 4.33, months: 1 },
      };
    }

    if (period === 'prev_month') {
      const prevYear = m === 1 ? y - 1 : y;
      const prevMonth = m === 1 ? 12 : m - 1;
      const curM = getMonthRange(prevYear, prevMonth);
      const twoAgoYear = prevMonth === 1 ? prevYear - 1 : prevYear;
      const twoAgoMonth = prevMonth === 1 ? 12 : prevMonth - 1;
      const prevM = getMonthRange(twoAgoYear, twoAgoMonth);
      return {
        current: { from: curM.from, to: curM.to, label: `חודש קודם (${curM.ym})`, weeks: 4.33, months: 1 },
        previous: { from: prevM.from, to: prevM.to, label: `חודש ${prevM.ym}`, weeks: 4.33, months: 1 },
      };
    }

    // yearly
    return {
      current: {
        from: `${y}-01-01`,
        to: `${y}-12-31`,
        label: `שנת ${y}`,
        weeks: 52,
        months: 12,
      },
      previous: {
        from: `${y - 1}-01-01`,
        to: `${y - 1}-12-31`,
        label: `שנת ${y - 1}`,
        weeks: 52,
        months: 12,
      },
    };
  }, [period, globalFriday]);

  // פונקציית חישוב מדדים לכל טווח תאריכים
  const computeRangeMetrics = useCallback(
    (from: string, to: string, weeksFactor: number, monthsFactor: number) => {
      const inRange = (d: string) => Boolean(d && d >= from && d <= to);
      const cashRegisters = loadAllCashRegisters();

      // הזמנות תקפות בטווח (ללא מבוטלות וללא ממתינות לאישור)
      const validOrders = orders.filter(
        (o) =>
          inRange(o.friday_date) &&
          o.status !== 'cancelled' &&
          o.status !== 'awaiting_approval'
      );

      // 1. הכנסות מהזמנות + פדיון מזומן נטו מהקופה / דוכן
      const ordersRevenue = validOrders
        .filter((o) => o.order_type !== 'charity')
        .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

      const rangeTx = transactions.filter((t) => inRange(t.friday_date || t.date));
      const stallTxIncome = rangeTx
        .filter((t) => t.type === 'income' && t.category.includes('דוכן'))
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

      let registerNetCash = 0;
      for (const [fDate, reg] of Object.entries(cashRegisters)) {
        if (!inRange(fDate)) continue;
        const alreadyInTx = rangeTx.some(
          (t) =>
            (t.friday_date || t.date) === fDate &&
            t.type === 'income' &&
            t.category.includes('דוכן')
        );
        if (!alreadyInTx && reg.netCashRevenue > 0) {
          registerNetCash += reg.netCashRevenue;
        }
      }

      const revenue = Math.round((ordersRevenue + stallTxIncome + registerNetCash) * 100) / 100;

      // 2. הוצאות (עלות סחורה / הוצאות תפעול + הוצאות קבועות יחסיות + פחת אבוד)
      const ordersCogs = validOrders.reduce(
        (s, o) =>
          s +
          (o.items || []).reduce(
            (isum, it) => isum + it.quantity * (Number(it.cost_price_snapshot) || 0),
            0
          ),
        0
      );

      const txExpenses = rangeTx
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

      const activeFixed = fixedExpenses.filter((f) => f.is_active);
      const proratedFixed = activeFixed.reduce(
        (s, f) => s + f.amount * (f.frequency === 'weekly' ? weeksFactor : monthsFactor),
        0
      );

      // אם כבר נרשמו רכישות מאפייה בתנועות, לא נכפיל מול ordersCogs
      const hasBakeryTx = rangeTx.some(
        (t) => t.type === 'expense' && t.category.includes('מאפייה')
      );
      const effectiveCogs = hasBakeryTx ? 0 : ordersCogs;

      let wasteLoss = 0;
      for (const [fDate, wCost] of Object.entries(wasteByFriday)) {
        if (inRange(fDate)) wasteLoss += wCost;
      }

      const expenses =
        Math.round((effectiveCogs + txExpenses + proratedFixed + wasteLoss) * 100) / 100;
      const netProfit = Math.round((revenue - expenses) * 100) / 100;

      // 4. כמות מוצרים שהוזמנו
      const unitsOrdered = validOrders.reduce(
        (s, o) => s + (o.items || []).reduce((isum, it) => isum + it.quantity, 0),
        0
      );

      // 5. כמות לקוחות שהזמינו
      const uniqueCustomers = new Set(
        validOrders.map((o) => (o.user_id ? `u_${o.user_id}` : `n_${o.recipient_name.trim()}`))
      ).size;

      return {
        revenue,
        expenses,
        netProfit,
        unitsOrdered,
        uniqueCustomers,
      };
    },
    [orders, transactions, fixedExpenses, wasteByFriday]
  );

  const currentMetrics = useMemo(
    () =>
      computeRangeMetrics(
        periodBounds.current.from,
        periodBounds.current.to,
        periodBounds.current.weeks,
        periodBounds.current.months
      ),
    [computeRangeMetrics, periodBounds]
  );

  const prevMetrics = useMemo(
    () =>
      computeRangeMetrics(
        periodBounds.previous.from,
        periodBounds.previous.to,
        periodBounds.previous.weeks,
        periodBounds.previous.months
      ),
    [computeRangeMetrics, periodBounds]
  );

  // נתוני הגרף האינטראקטיבי (לפי ימי שישי או לפי חודשים בשנת הבסיס)
  const chartSeries = useMemo(() => {
    const baseDate = new Date(`${globalFriday || getNextFridayISO()}T12:00:00`);
    const y = baseDate.getFullYear();

    if (period === 'yearly') {
      return HEBREW_MONTHS.map((mLabel, idx) => {
        const mRange = getMonthRange(y, idx + 1);
        const mMetrics = computeRangeMetrics(mRange.from, mRange.to, 4.33, 1);
        return {
          label: mLabel,
          fullLabel: `${mLabel} ${y}`,
          ...mMetrics,
        };
      });
    }

    // לימי שישי: אסוף את 6 ימי השישי הרלוונטיים לתקופה
    const curFri = globalFriday || getNextFridayISO();
    const fridaysList: string[] = [];
    if (period === 'this_friday') {
      for (let i = -5; i <= 0; i++) {
        fridaysList.push(shiftDays(curFri, i * 7));
      }
    } else {
      // כל ימי השישי בחודש הנבחר
      const start = new Date(`${periodBounds.current.from}T12:00:00`);
      const end = new Date(`${periodBounds.current.to}T12:00:00`);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 5) {
          fridaysList.push(d.toISOString().slice(0, 10));
        }
      }
    }

    return fridaysList.map((fIso) => {
      const m = computeRangeMetrics(fIso, fIso, 1, 1 / 4.33);
      const [, mm, dd] = fIso.split('-');
      return {
        label: `${dd}/${mm}`,
        fullLabel: formatFridayLabel(fIso),
        ...m,
      };
    });
  }, [period, globalFriday, periodBounds, computeRangeMetrics]);

  const maxChartVal = useMemo(() => {
    let max = 100;
    for (const pt of chartSeries) {
      max = Math.max(max, pt.revenue, Math.abs(pt.netProfit), pt.expenses);
    }
    return max;
  }, [chartSeries]);

  const openExpenseModal = (mode: 'weekly' | 'monthly', txToEdit?: Transaction) => {
    setExpenseModalMode(mode);
    if (txToEdit) {
      setEditingTx(txToEdit);
      setExpForm({
        date: txToEdit.date,
        friday_date: txToEdit.friday_date || globalFriday || getNextFridayISO(),
        category: txToEdit.category,
        payment_method: txToEdit.payment_method,
        amount: String(txToEdit.amount),
        notes: txToEdit.notes || '',
        saveAsFixed: false,
      });
    } else {
      setEditingTx(null);
      setExpForm({
        date: new Date().toISOString().slice(0, 10),
        friday_date: globalFriday || getNextFridayISO(),
        category: mode === 'monthly' ? 'שכירות / דמי דוכן' : EXPENSE_PRESETS[0].label,
        payment_method: mode === 'monthly' ? 'transfer' : 'cash',
        amount: '',
        notes: '',
        saveAsFixed: false,
      });
    }
  };

  const handleSaveExpenseModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseModalMode) return;
    try {
      if (editingTx) {
        await apiFetch(`/api/finance/transactions/${editingTx.id}`, { method: 'DELETE' });
      }
      const prefix =
        expenseModalMode === 'monthly' ? '[הוצאה חודשית]' : '[הוצאה שבועית]';
      const cleanNotes = expForm.notes.trim();
      const combinedNotes = cleanNotes.startsWith('[הוצאה')
        ? cleanNotes
        : [prefix, cleanNotes].filter(Boolean).join(' ');

      await apiFetch('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date: expForm.date,
          friday_date: expenseModalMode === 'weekly' ? expForm.friday_date : expForm.date,
          type: 'expense',
          category: expForm.category.trim(),
          payment_method: expForm.payment_method,
          amount: Number(expForm.amount),
          notes: combinedNotes,
        }),
      });

      if (expForm.saveAsFixed && !editingTx) {
        await apiFetch('/api/finance/fixed-expenses', {
          method: 'POST',
          body: JSON.stringify({
            name: expForm.category.trim(),
            amount: Number(expForm.amount),
            frequency: expenseModalMode,
            payment_method: expForm.payment_method,
          }),
        });
      }

      setExpenseModalMode(null);
      setEditingTx(null);
      showToast(editingTx ? 'ההוצאה עודכנה בהצלחה ✓' : 'ההוצאה נשמרה בהצלחה ✓');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההוצאה');
    }
  };

  const handleConfirmDeleteTx = async (id: number) => {
    setDeleteTxId(null);
    await apiFetch(`/api/finance/transactions/${id}`, { method: 'DELETE' });
    showToast('התנועה נמחקה מהיומן');
    await loadAll();
  };

  const handleSaveFixed = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingFixed) {
        await apiFetch(`/api/finance/fixed-expenses/${editingFixed.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...fixedForm, amount: Number(fixedForm.amount) }),
        });
      } else {
        await apiFetch('/api/finance/fixed-expenses', {
          method: 'POST',
          body: JSON.stringify({ ...fixedForm, amount: Number(fixedForm.amount) }),
        });
      }
      setShowFixedModal(false);
      showToast('ההוצאה הקבועה נשמרה');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת הוצאה קבועה');
    }
  };

  const toggleFixed = async (id: number) => {
    await apiFetch(`/api/finance/fixed-expenses/${id}/toggle`, { method: 'PATCH' });
    await loadAll();
  };

  const handleConfirmDeleteFixed = async (id: number) => {
    setDeleteFixedId(null);
    await apiFetch(`/api/finance/fixed-expenses/${id}`, { method: 'DELETE' });
    showToast('ההוצאה הקבועה נמחקה');
    await loadAll();
  };

  const exportTransactionsCsv = () => {
    downloadCsv(
      `דוח-כספים-${new Date().toISOString().slice(0, 10)}.csv`,
      ['תאריך', 'יום שישי', 'סוג', 'קטגוריה', 'אמצעי תשלום', 'סכום (₪)', 'לקוח/ספק', 'הערות'],
      transactions.map((t) => [
        t.date,
        t.friday_date || '',
        t.type === 'income' ? 'הכנסה' : 'הוצאה',
        t.category,
        PAYMENT_METHOD_LABELS[t.payment_method],
        t.type === 'income' ? t.amount : -t.amount,
        t.user_name || '',
        t.notes,
      ])
    );
  };

  const renderComparisonBadge = (currentVal: number, prevVal: number, invertColors = false) => {
    const cmp = calcPctChange(currentVal, prevVal);
    const isGood = invertColors ? cmp.dir === 'down' : cmp.dir === 'up';
    const isBad = invertColors ? cmp.dir === 'up' : cmp.dir === 'down';
    return (
      <span
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums ${
          isGood
            ? 'bg-emerald-100 text-emerald-800'
            : isBad
            ? 'bg-red-100 text-red-700'
            : 'bg-slate-100 text-slate-600'
        }`}
        title={`בהשוואה ל${periodBounds.previous.label} (${prevVal})`}
      >
        {cmp.dir === 'up' ? (
          <>
            <TrendingUp className="w-3 h-3" />
            <span dir="ltr">+{cmp.pct}% ▲</span>
          </>
        ) : cmp.dir === 'down' ? (
          <>
            <TrendingDown className="w-3 h-3" />
            <span dir="ltr">{cmp.pct}% ▼</span>
          </>
        ) : (
          <span>0%</span>
        )}
      </span>
    );
  };

  const activeChartPoint =
    selectedChartIndex !== null && chartSeries[selectedChartIndex]
      ? chartSeries[selectedChartIndex]
      : chartSeries[chartSeries.length - 1] || null;

  return (
    <div className="space-y-6 pb-16">
      {/* כותרת עליונה + כפתורי מודאל הוצאה קופץ */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">כספים וביצועים</h2>
          <p className="text-sm text-slate-600 mt-0.5">
            סיכום מכירות, הוצאות, רווח נקי, השוואת תקופות וגרף ביצועים ({periodBounds.current.label} מול {periodBounds.previous.label}).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openExpenseModal('weekly')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ הזן הוצאה שבועית</span>
          </button>
          <button
            type="button"
            onClick={() => openExpenseModal('monthly')}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#2B1B12] hover:bg-[#3d281c] text-amber-50 font-extrabold text-xs shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>+ הזן הוצאה חודשית</span>
          </button>
          <button
            type="button"
            onClick={exportTransactionsCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white border border-[#E8D5BE] hover:border-[#C85A17] text-slate-800 font-bold text-xs"
          >
            <Download className="w-4 h-4 text-[#C85A17]" />
            <span>ייצוא CSV</span>
          </button>
        </div>
      </div>

      {/* בורר תקופות מהיר: שישי הזה | חודש נוכחי | חודש קודם | שנתי */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1.5 rounded-2xl bg-white border border-[#E8D5BE] shadow-soft">
        {PERIOD_TABS.map((tab) => {
          const active = period === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setPeriod(tab.key);
                setSelectedChartIndex(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
                active
                  ? 'bg-[#C85A17] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-[#FAF6F0]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {toast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {/* 5 כרטיסי סיכום בראש דף הכספים + השוואה אוטומטית לתקופה הקודמת */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
        {/* 1. הכנסות (פדיון מכירות) */}
        <div className="bg-white rounded-2xl border border-[#E8D5BE] p-4 shadow-soft space-y-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-extrabold text-slate-600">הכנסות (פדיון מכירות)</span>
            {renderComparisonBadge(currentMetrics.revenue, prevMetrics.revenue)}
          </div>
          <div className="text-2xl font-extrabold text-emerald-700">
            {formatILS(currentMetrics.revenue)}
          </div>
          <div className="text-[11px] text-slate-400">
            קודם: {formatILS(prevMetrics.revenue)}
          </div>
        </div>

        {/* 2. הוצאות (כולל פחת אבוד) */}
        <div className="bg-white rounded-2xl border border-[#E8D5BE] p-4 shadow-soft space-y-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-extrabold text-slate-600">הוצאות (כולל פחת)</span>
            {renderComparisonBadge(currentMetrics.expenses, prevMetrics.expenses, true)}
          </div>
          <div className="text-2xl font-extrabold text-red-600">
            {formatILS(currentMetrics.expenses)}
          </div>
          <div className="text-[11px] text-slate-400">
            קודם: {formatILS(prevMetrics.expenses)}
          </div>
        </div>

        {/* 3. רווח נקי בפועל */}
        <div
          className={`rounded-2xl border-2 p-4 shadow-soft space-y-2 ${
            currentMetrics.netProfit >= 0
              ? 'bg-emerald-50/50 border-emerald-300'
              : 'bg-red-50/50 border-red-300'
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-extrabold text-slate-800">רווח נקי בפועל</span>
            {renderComparisonBadge(currentMetrics.netProfit, prevMetrics.netProfit)}
          </div>
          <div
            className={`text-2xl font-extrabold ${
              currentMetrics.netProfit >= 0 ? 'text-emerald-800' : 'text-red-700'
            }`}
          >
            {formatILS(currentMetrics.netProfit)}
          </div>
          <div className="text-[11px] text-slate-500">
            קודם: {formatILS(prevMetrics.netProfit)}
          </div>
        </div>

        {/* 4. כמות מוצרים שהוזמנו */}
        <div className="bg-white rounded-2xl border border-[#E8D5BE] p-4 shadow-soft space-y-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-extrabold text-slate-600 flex items-center gap-1">
              <ShoppingBag className="w-3.5 h-3.5 text-[#C85A17]" />
              <span>מוצרים שהוזמנו</span>
            </span>
            {renderComparisonBadge(currentMetrics.unitsOrdered, prevMetrics.unitsOrdered)}
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {currentMetrics.unitsOrdered.toLocaleString('he-IL')} יח׳
          </div>
          <div className="text-[11px] text-slate-400">
            קודם: {prevMetrics.unitsOrdered.toLocaleString('he-IL')} יח׳
          </div>
        </div>

        {/* 5. כמות לקוחות שהזמינו */}
        <div className="col-span-2 lg:col-span-1 bg-white rounded-2xl border border-[#E8D5BE] p-4 shadow-soft space-y-2">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs font-extrabold text-slate-600 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#C85A17]" />
              <span>לקוחות שהזמינו</span>
            </span>
            {renderComparisonBadge(currentMetrics.uniqueCustomers, prevMetrics.uniqueCustomers)}
          </div>
          <div className="text-2xl font-extrabold text-slate-900">
            {currentMetrics.uniqueCustomers} לקוחות
          </div>
          <div className="text-[11px] text-slate-400">
            קודם: {prevMetrics.uniqueCustomers} לקוחות
          </div>
        </div>
      </div>

      {/* גרף אינטראקטיבי של מכירות ורווחים לפי ימי שישי או חודשים */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#C85A17]" />
              <span>
                גרף מכירות ורווח נקי ({period === 'yearly' ? 'לפי חודשים' : 'לפי ימי שישי'})
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              לחץ על כל עמודה להצגת פירוט מלא של הכנסות, הוצאות, רווח נקי וכמות הזמנות.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-[#C85A17]" />
              <span>הכנסות (מכירות)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-600" />
              <span>רווח נקי</span>
            </span>
          </div>
        </div>

        {/* פירוט העמודה הנבחרת */}
        {activeChartPoint && (
          <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
            <span className="font-extrabold text-slate-900">{activeChartPoint.fullLabel}</span>
            <div className="flex flex-wrap items-center gap-4">
              <span>
                הכנסות: <strong className="text-[#C85A17]">{formatILS(activeChartPoint.revenue)}</strong>
              </span>
              <span>
                הוצאות: <strong className="text-red-600">{formatILS(activeChartPoint.expenses)}</strong>
              </span>
              <span>
                רווח נקי:{' '}
                <strong
                  className={
                    activeChartPoint.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }
                >
                  {formatILS(activeChartPoint.netProfit)}
                </strong>
              </span>
              <span>
                מוצרים: <strong>{activeChartPoint.unitsOrdered} יח׳</strong> ({activeChartPoint.uniqueCustomers} לקוחות)
              </span>
            </div>
          </div>
        )}

        {/* עמודות הגרף */}
        <div className="h-52 pt-4 pb-2 px-2 flex items-end justify-between gap-2 border-b border-[#E8D5BE]">
          {chartSeries.map((pt, idx) => {
            const revHeightPct = Math.max(6, Math.round((pt.revenue / maxChartVal) * 100));
            const profitHeightPct = Math.max(
              6,
              Math.round((Math.max(0, pt.netProfit) / maxChartVal) * 100)
            );
            const isSelected =
              selectedChartIndex === idx ||
              (selectedChartIndex === null && idx === chartSeries.length - 1);

            return (
              <button
                key={pt.label + idx}
                type="button"
                onClick={() => setSelectedChartIndex(idx)}
                className={`flex-1 h-full flex flex-col justify-end items-center gap-1.5 rounded-xl p-1 transition-colors ${
                  isSelected ? 'bg-[#FFF7ED] ring-1 ring-[#C85A17]' : 'hover:bg-[#FAF6F0]'
                }`}
              >
                <div className="w-full flex-1 flex items-end justify-center gap-1 px-1">
                  <div
                    style={{ height: `${revHeightPct}%` }}
                    className="w-3 sm:w-4 rounded-t-md bg-[#C85A17] transition-all"
                    title={`הכנסות: ${formatILS(pt.revenue)}`}
                  />
                  <div
                    style={{ height: `${profitHeightPct}%` }}
                    className={`w-3 sm:w-4 rounded-t-md transition-all ${
                      pt.netProfit >= 0 ? 'bg-emerald-600' : 'bg-red-500'
                    }`}
                    title={`רווח נקי: ${formatILS(pt.netProfit)}`}
                  />
                </div>
                <span className="text-[10px] font-extrabold text-slate-700 tabular-nums truncate max-w-full">
                  {pt.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ניהול הוצאות קבועות (שבועיות וחודשיות) */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Repeat className="w-5 h-5 text-[#C85A17]" />
            <div>
              <h3 className="font-serif text-xl font-bold text-slate-900">
                הוצאות קבועות (שבועיות וחודשיות)
              </h3>
              <p className="text-xs text-slate-500">
                משוקללות אוטומטית בחישוב הרווח הנקי לפי התקופה שנבחרה.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditingFixed(null);
              setFixedForm({ name: '', amount: '', frequency: 'weekly', payment_method: 'transfer' });
              setShowFixedModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] hover:border-[#C85A17] text-xs font-extrabold text-[#8A330B]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ הוצאה קבועה חדשה</span>
          </button>
        </div>

        {fixedExpenses.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-400">
            אין עדיין הוצאות קבועות מוגדרות.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {fixedExpenses.map((f) => (
              <div
                key={f.id}
                className={`p-3 rounded-2xl border flex items-center justify-between gap-2 ${
                  f.is_active ? 'bg-[#FAF6F0] border-[#E8D5BE]' : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="min-w-0">
                  <div className="font-extrabold text-xs text-slate-900 truncate">{f.name}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {formatILS(f.amount)} · {f.frequency === 'weekly' ? 'שבועי' : 'חודשי'}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleFixed(f.id)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold ${
                      f.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {f.is_active ? 'פעיל' : 'מושהה'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFixed(f);
                      setFixedForm({
                        name: f.name,
                        amount: String(f.amount),
                        frequency: f.frequency,
                        payment_method: f.payment_method,
                      });
                      setShowFixedModal(true);
                    }}
                    className="p-1.5 text-slate-500 hover:text-slate-900"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteFixedId(f.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* יומן תנועות כספיות */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#C85A17]" />
            <span>יומן תנועות והוצאות ({transactions.length})</span>
          </h3>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">טוען יומן תנועות...</div>
        ) : transactions.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">אין תנועות רשומות עדיין.</div>
        ) : (
          <div className="divide-y divide-[#F3E9DC]">
            {transactions.slice(0, 30).map((t) => (
              <div key={t.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-900">{t.category}</span>
                    <span className="px-2 py-0.5 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] text-[10px] font-bold text-slate-600">
                      {PAYMENT_METHOD_LABELS[t.payment_method]}
                    </span>
                    {t.user_id && t.user_name && (
                      <button
                        type="button"
                        onClick={() => openContactById(t.user_id!)}
                        className="text-[#C85A17] font-bold hover:underline"
                      >
                        {t.user_name}
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {formatHebrewDate(t.friday_date || t.date)}
                    {t.notes ? ` · ${t.notes}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 tabular-nums">
                  <span
                    className={`font-extrabold text-sm ${
                      t.type === 'income' ? 'text-emerald-700' : 'text-red-600'
                    }`}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {formatILS(t.amount)}
                  </span>
                  {t.type === 'expense' && (
                    <button
                      type="button"
                      onClick={() => openExpenseModal('weekly', t)}
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                      title="ערוך"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTxId(t.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
                    title="מחק"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* =====================================================================
          חלונית קופצת (Modal) ממורכזת ונקייה להזנת הוצאה שבועית / חודשית
      ===================================================================== */}
      {expenseModalMode && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setExpenseModalMode(null)}
        >
          <div
            className="max-w-md w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 sm:p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#F3E9DC]">
              <div>
                <h3 className="font-serif text-xl font-extrabold text-slate-900">
                  {editingTx
                    ? 'עריכת הוצאה'
                    : expenseModalMode === 'weekly'
                    ? 'הזנת הוצאה שבועית'
                    : 'הזנת הוצאה חודשית'}
                </h3>
                <p className="text-xs text-slate-500">
                  ההוצאה תתווסף מיד לחישוב הרווח וההפסד.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpenseModalMode(null)}
                className="w-8 h-8 rounded-xl bg-[#FAF6F0] hover:bg-slate-200 flex items-center justify-center text-slate-600"
                title="סגור"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveExpenseModal} className="space-y-3.5">
              {/* צ'יפים מהירים לקטגוריות */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  בחר קטגוריה מהירה או הקלד:
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {EXPENSE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setExpForm((f) => ({
                          ...f,
                          category: preset.label,
                          payment_method: preset.defaultMethod || f.payment_method,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                        expForm.category === preset.label
                          ? 'bg-[#C85A17] text-white'
                          : 'bg-[#FAF6F0] text-slate-700 hover:bg-[#F3E9DC]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={expForm.category}
                  onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
                  placeholder="שם הקטגוריה *"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">סכום (₪) *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    required
                    min="0.01"
                    step="0.01"
                    dir="ltr"
                    placeholder="0.00"
                    value={expForm.amount}
                    onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left font-extrabold text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">אמצעי תשלום</label>
                  <select
                    value={expForm.payment_method}
                    onChange={(e) =>
                      setExpForm({ ...expForm, payment_method: e.target.value as PaymentMethod })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-semibold"
                  >
                    {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                      <option key={pm} value={pm}>
                        {PAYMENT_METHOD_LABELS[pm]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {expenseModalMode === 'weekly' ? 'שיוך ליום שישי' : 'תאריך הוצאה'}
                  </label>
                  <input
                    type="date"
                    required
                    value={expenseModalMode === 'weekly' ? expForm.friday_date : expForm.date}
                    onChange={(e) =>
                      setExpForm(
                        expenseModalMode === 'weekly'
                          ? { ...expForm, friday_date: e.target.value }
                          : { ...expForm, date: e.target.value }
                      )
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">תיאור / הערה</label>
                  <input
                    type="text"
                    value={expForm.notes}
                    onChange={(e) => setExpForm({ ...expForm, notes: e.target.value })}
                    placeholder="פירוט אופציונלי..."
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs"
                  />
                </div>
              </div>

              {!editingTx && (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={expForm.saveAsFixed}
                    onChange={(e) => setExpForm({ ...expForm, saveAsFixed: e.target.checked })}
                    className="rounded border-[#E8D5BE] text-[#C85A17]"
                  />
                  <span>
                    שמור גם כהוצאה קבועה ({expenseModalMode === 'weekly' ? 'שבועית' : 'חודשית'})
                  </span>
                </label>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setExpenseModalMode(null)}
                  className="py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] text-slate-700 font-bold text-xs"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-sm"
                >
                  שמור הוצאה
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* חלונית קופצת להוצאה קבועה */}
      {showFixedModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowFixedModal(false)}
        >
          <div
            className="max-w-sm w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-[#F3E9DC]">
              <h3 className="font-serif text-lg font-extrabold text-slate-900">
                {editingFixed ? 'עריכת הוצאה קבועה' : 'הוצאה קבועה חדשה'}
              </h3>
              <button
                type="button"
                onClick={() => setShowFixedModal(false)}
                className="w-8 h-8 rounded-xl bg-[#FAF6F0] flex items-center justify-center text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveFixed} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">שם ההוצאה *</label>
                <input
                  type="text"
                  required
                  value={fixedForm.name}
                  onChange={(e) => setFixedForm({ ...fixedForm, name: e.target.value })}
                  placeholder="לדוגמה: שכירות דוכן / רואה חשבון"
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-bold"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">סכום (₪) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.5"
                    dir="ltr"
                    value={fixedForm.amount}
                    onChange={(e) => setFixedForm({ ...fixedForm, amount: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left font-bold text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">תדירות</label>
                  <select
                    value={fixedForm.frequency}
                    onChange={(e) =>
                      setFixedForm({
                        ...fixedForm,
                        frequency: e.target.value as 'weekly' | 'monthly',
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-semibold"
                  >
                    <option value="weekly">שבועי</option>
                    <option value="monthly">חודשי</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFixedModal(false)}
                  className="py-2.5 rounded-xl border border-[#E8D5BE] text-xs font-bold text-slate-600"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  className="py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-extrabold"
                >
                  שמור
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* מודאל אישור מחיקת תנועה */}
      {deleteTxId !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDeleteTxId(null)}
        >
          <div
            className="max-w-xs w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 text-center space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-lg font-extrabold text-slate-900">
              למחוק תנועה זו מהיומן?
            </h3>
            <p className="text-xs text-slate-600">הרווח וההפסד יתעדכנו מיידית.</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteTxId(null)}
                className="py-2 rounded-xl border border-[#E8D5BE] text-xs font-bold text-slate-600"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteTx(deleteTxId)}
                className="py-2 rounded-xl bg-red-600 text-white text-xs font-extrabold"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}

      {/* מודאל אישור מחיקת הוצאה קבועה */}
      {deleteFixedId !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDeleteFixedId(null)}
        >
          <div
            className="max-w-xs w-full bg-white rounded-3xl border border-[#E8D5BE] shadow-card p-5 text-center space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-lg font-extrabold text-slate-900">
              למחוק הוצאה קבועה זו?
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDeleteFixedId(null)}
                className="py-2 rounded-xl border border-[#E8D5BE] text-xs font-bold text-slate-600"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteFixed(deleteFixedId)}
                className="py-2 rounded-xl bg-red-600 text-white text-xs font-extrabold"
              >
                מחק
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
