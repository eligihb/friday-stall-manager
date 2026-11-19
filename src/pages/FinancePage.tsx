import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Trash2,
  ArrowUpCircle,
  ArrowDownCircle,
  Repeat,
  Store,
  Receipt,
  Download,
  CheckCircle2,
  Edit3,
  X,
  Filter,
  PlayCircle,
  AlertOctagon,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatHebrewDate, formatILS, getNextFridayISO, PAYMENT_METHOD_LABELS } from '../lib/format';
import { downloadCsv } from '../lib/csvExport';
import { FridaySelector } from '../components/FridaySelector';
import { BottomSheet } from '../components/BottomSheet';
import { WasteTrackingSheet } from '../components/WasteTrackingSheet';
import type { FixedExpense, PaymentMethod, Transaction, WasteLogResponse } from '../types';

const EXPENSE_PRESETS: Array<{ label: string; defaultMethod?: PaymentMethod }> = [
  { label: 'רכש מאפייה (מזומן)', defaultMethod: 'cash' },
  { label: 'שכר עובד יומי', defaultMethod: 'cash' },
  { label: 'דלק / נסיעות', defaultMethod: 'cash' },
  { label: 'כביש 6', defaultMethod: 'transfer' },
  { label: 'אריזות וכלים חד-פעמיים', defaultMethod: 'cash' },
  { label: 'חומרי גלם (סלסה, כבד קצוץ ותבלינים)', defaultMethod: 'cash' },
];

export function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [wasteSummary, setWasteSummary] = useState<{ units: number; cost: number }>({ units: 0, cost: 0 });
  const [wasteOpen, setWasteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // סינון יומן הכנסות והוצאות
  const [filterFriday, setFilterFriday] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [filterType, setFilterType] = useState<'' | 'income' | 'expense'>('');
  const [filterPayment, setFilterPayment] = useState<'' | PaymentMethod>('');

  // טופס מהיר 1: סיכום קופת דוכן (מזומן + פייבוקס + העברה בנקאית)
  const [stallFriday, setStallFriday] = useState(getNextFridayISO());
  const [stallCash, setStallCash] = useState('');
  const [stallPaybox, setStallPaybox] = useState('');
  const [stallTransfer, setStallTransfer] = useState('');
  const [stallNotes, setStallNotes] = useState('');
  const [savingStall, setSavingStall] = useState(false);

  // טופס מהיר 2: הזנת הוצאה משתנה
  const [expFriday, setExpFriday] = useState(getNextFridayISO());
  const [expCategory, setExpCategory] = useState(EXPENSE_PRESETS[0].label);
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<PaymentMethod>('cash');
  const [expNotes, setExpNotes] = useState('');
  const [savingExp, setSavingExp] = useState(false);

  // מודאל תנועה כללית
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    friday_date: getNextFridayISO(),
    type: 'income' as 'income' | 'expense',
    category: '',
    payment_method: 'cash' as PaymentMethod,
    amount: '',
    notes: '',
  });

  // מודאל הוצאה קבועה (יצירה / עריכה)
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [editingFixed, setEditingFixed] = useState<FixedExpense | null>(null);
  const [fixedForm, setFixedForm] = useState({
    name: '',
    amount: '',
    frequency: 'weekly' as 'weekly' | 'monthly',
    payment_method: 'transfer' as PaymentMethod,
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterFriday) qs.set('friday_date', filterFriday);
      if (filterFrom) qs.set('from_date', filterFrom);
      if (filterTo) qs.set('to_date', filterTo);
      if (filterType) qs.set('type', filterType);
      if (filterPayment) qs.set('payment_method', filterPayment);

      const [txRes, fixRes, wasteRes] = await Promise.all([
        apiFetch<{ transactions: Transaction[] }>(`/api/finance/transactions?${qs.toString()}`),
        apiFetch<{ fixed_expenses: FixedExpense[] }>('/api/finance/fixed-expenses'),
        apiFetch<WasteLogResponse>(`/api/finance/waste?friday_date=${stallFriday}`),
      ]);
      setTransactions(txRes.transactions);
      setFixedExpenses(fixRes.fixed_expenses);
      setWasteSummary({ units: wasteRes.total_waste_units, cost: wasteRes.total_waste_cost });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים כספיים');
    } finally {
      setLoading(false);
    }
  }, [filterFriday, filterFrom, filterTo, filterType, filterPayment, stallFriday]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    let cashIn = 0;
    let cashOut = 0;
    let payboxIn = 0;
    let payboxOut = 0;
    let transferIn = 0;
    let transferOut = 0;
    for (const t of transactions) {
      if (t.type === 'income') {
        if (t.payment_method === 'cash') cashIn += t.amount;
        else if (t.payment_method === 'paybox') payboxIn += t.amount;
        else transferIn += t.amount;
      } else {
        if (t.payment_method === 'cash') cashOut += t.amount;
        else if (t.payment_method === 'paybox') payboxOut += t.amount;
        else transferOut += t.amount;
      }
    }
    const income = cashIn + payboxIn + transferIn;
    const expense = cashOut + payboxOut + transferOut;
    const weeklyFixed = fixedExpenses
      .filter((f) => f.is_active && f.frequency === 'weekly')
      .reduce((s, f) => s + f.amount, 0);
    const monthlyFixed = fixedExpenses
      .filter((f) => f.is_active && f.frequency === 'monthly')
      .reduce((s, f) => s + f.amount, 0);
    return {
      income,
      expense,
      net: income - expense,
      cashNet: cashIn - cashOut,
      payboxNet: payboxIn - payboxOut,
      transferNet: transferIn - transferOut,
      weeklyFixed,
      monthlyFixed,
    };
  }, [transactions, fixedExpenses]);

  const handleStallCloseout = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingStall(true);
    setError('');
    try {
      await apiFetch('/api/finance/stall-closeout', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: stallFriday,
          cash_amount: Number(stallCash) || 0,
          paybox_amount: Number(stallPaybox) || 0,
          transfer_amount: Number(stallTransfer) || 0,
          notes: stallNotes.trim(),
        }),
      });
      setStallCash('');
      setStallPaybox('');
      setStallTransfer('');
      setStallNotes('');
      showToast('סיכום קופת הדוכן (מזומן, פייבוקס והעברה) נרשם ביומן ההכנסות!');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום סיכום הקופה');
    } finally {
      setSavingStall(false);
    }
  };

  const handleQuickExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingExp(true);
    setError('');
    try {
      await apiFetch('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          date: new Date().toISOString().slice(0, 10),
          friday_date: expFriday || null,
          type: 'expense',
          category: expCategory.trim(),
          payment_method: expMethod,
          amount: Number(expAmount),
          notes: expNotes.trim(),
        }),
      });
      setExpAmount('');
      setExpNotes('');
      showToast('ההוצאה המשתנה נרשמה בהצלחה!');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום ההוצאה');
    } finally {
      setSavingExp(false);
    }
  };

  const handleCreateTx = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/finance/transactions', {
        method: 'POST',
        body: JSON.stringify({
          ...txForm,
          friday_date: txForm.friday_date || null,
          amount: Number(txForm.amount),
        }),
      });
      setShowTxModal(false);
      setTxForm((f) => ({ ...f, category: '', amount: '', notes: '' }));
      showToast('התנועה נשמרה ביומן!');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום תנועה');
    }
  };

  const handleDeleteTx = async (id: number) => {
    if (!window.confirm('למחוק תנועה זו מהיומן?')) return;
    await apiFetch(`/api/finance/transactions/${id}`, { method: 'DELETE' });
    await load();
  };

  const openAddFixed = () => {
    setEditingFixed(null);
    setFixedForm({ name: '', amount: '', frequency: 'weekly', payment_method: 'transfer' });
    setShowFixedModal(true);
  };

  const openEditFixed = (f: FixedExpense) => {
    setEditingFixed(f);
    setFixedForm({
      name: f.name,
      amount: String(f.amount),
      frequency: f.frequency,
      payment_method: f.payment_method,
    });
    setShowFixedModal(true);
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההוצאה הקבועה');
    }
  };

  const handleApplyFixedBulk = async (frequency: 'weekly' | 'monthly') => {
    const lbl = frequency === 'weekly' ? 'השבועיות' : 'החודשיות';
    if (!window.confirm(`להחיל את כל ההוצאות הקבועות ${lbl} הפעילות ליומן התנועות?`)) return;
    try {
      const res = await apiFetch<{ count: number }>('/api/finance/fixed-expenses/apply', {
        method: 'POST',
        body: JSON.stringify({ frequency, friday_date: stallFriday }),
      });
      showToast(`נרשמו ${res.count} הוצאות קבועות ${lbl} ביומן!`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהחלת הוצאות קבועות');
    }
  };

  const toggleFixed = async (id: number) => {
    await apiFetch(`/api/finance/fixed-expenses/${id}/toggle`, { method: 'PATCH' });
    await load();
  };

  const deleteFixed = async (id: number) => {
    if (!window.confirm('למחוק הוצאה קבועה זו?')) return;
    await apiFetch(`/api/finance/fixed-expenses/${id}`, { method: 'DELETE' });
    await load();
  };

  const exportTransactionsCsv = () => {
    downloadCsv(
      `יומן-תנועות-${new Date().toISOString().slice(0, 10)}.csv`,
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

  const stallTotalInput =
    (Number(stallCash) || 0) + (Number(stallPaybox) || 0) + (Number(stallTransfer) || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">
            יומן הכנסות והוצאות (מזומן, פייבוקס והעברה)
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            סיכום קופת הדוכן, תיעוד הוצאות שישי ופחת סוף יום, והוצאות קבועות.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setWasteOpen(true)}
            className="flex-1 sm:flex-none min-h-[48px] md:min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-800 font-bold text-xs shadow-sm"
          >
            <AlertOctagon className="w-4 h-4 shrink-0" />
            <span>
              ניהול פחת סוף יום{wasteSummary.cost > 0 ? ` (${formatILS(wasteSummary.cost)})` : ''}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowTxModal(true)}
            className="flex-1 sm:flex-none min-h-[48px] md:min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E242B] hover:bg-slate-800 text-white font-bold text-xs shadow-sm"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>תנועה ידנית</span>
          </button>
          <button
            type="button"
            onClick={exportTransactionsCsv}
            className="w-full sm:w-auto min-h-[48px] md:min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#E8D5BE] hover:border-[#C85A17] text-slate-800 font-bold text-xs"
          >
            <Download className="w-4 h-4 text-[#C85A17] shrink-0" />
            <span>ייצוא יומן (CSV)</span>
          </button>
        </div>
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

      {/* שני טפסים מהירים: סיכום קופת דוכן + הוצאה משתנה */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* טופס 1: סיכום קופת דוכן */}
        <form
          onSubmit={handleStallCloseout}
          className="bg-gradient-to-br from-[#FFF7ED] to-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#C85A17] text-white flex items-center justify-center shrink-0">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif text-xl font-bold text-slate-900">סיכום קופת דוכן (סוף יום שישי)</h3>
                <p className="text-xs text-slate-500">
                  הזנת פדיון מכירות חופשיות בדוכן במזומן, פייבוקס והעברה בנקאית.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">יום שישי</label>
              <input
                type="date"
                required
                value={stallFriday}
                onChange={(e) => setStallFriday(e.target.value)}
                className="w-full px-2.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-emerald-800 mb-1">מזומן (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                dir="ltr"
                placeholder="0.00"
                value={stallCash}
                onChange={(e) => setStallCash(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-left tabular-nums font-extrabold text-emerald-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-sky-800 mb-1">פייבוקס (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                dir="ltr"
                placeholder="0.00"
                value={stallPaybox}
                onChange={(e) => setStallPaybox(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-sky-300 bg-white text-left tabular-nums font-extrabold text-sky-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-amber-800 mb-1">העברה (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                dir="ltr"
                placeholder="0.00"
                value={stallTransfer}
                onChange={(e) => setStallTransfer(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-left tabular-nums font-extrabold text-amber-800"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <input
              type="text"
              value={stallNotes}
              onChange={(e) => setStallNotes(e.target.value)}
              placeholder="הערה (לדוגמה: דוכן שוק ראש העין)"
              className="flex-1 px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm"
            />
            <button
              type="submit"
              disabled={savingStall || stallTotalInput <= 0}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-bold text-sm shadow-sm whitespace-nowrap"
            >
              {savingStall ? 'רושם...' : `רשום קופה (${formatILS(stallTotalInput)})`}
            </button>
          </div>
        </form>

        {/* טופס 2: הזנת הוצאה משתנה מהירה */}
        <form
          onSubmit={handleQuickExpense}
          className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-3.5"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-slate-900">רישום הוצאות תפעול שישי</h3>
              <p className="text-xs text-slate-500">
                רכש מאפייה במזומן, שכר עובד יומי, דלק / נסיעות, כביש 6 ועוד.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setExpCategory(preset.label);
                  if (preset.defaultMethod) setExpMethod(preset.defaultMethod);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                  expCategory === preset.label
                    ? 'bg-red-700 text-white'
                    : 'bg-[#FAF6F0] text-slate-600 hover:bg-[#F3E9DC]'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              required
              value={expCategory}
              onChange={(e) => setExpCategory(e.target.value)}
              placeholder="קטגוריה"
              className="sm:col-span-1 px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
            />
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              required
              dir="ltr"
              placeholder="סכום (₪)"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums font-bold text-sm"
            />
            <select
              value={expMethod}
              onChange={(e) => setExpMethod(e.target.value as PaymentMethod)}
              className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-semibold"
            >
              {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                <option key={pm} value={pm}>
                  {PAYMENT_METHOD_LABELS[pm]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            <input
              type="date"
              value={expFriday}
              onChange={(e) => setExpFriday(e.target.value)}
              className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-semibold"
              title="שיוך לשישי"
            />
            <input
              type="text"
              value={expNotes}
              onChange={(e) => setExpNotes(e.target.value)}
              placeholder="פירוט / הערה"
              className="flex-1 px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
            />
            <button
              type="submit"
              disabled={savingExp}
              className="min-h-[48px] px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm whitespace-nowrap"
            >
              {savingExp ? 'שומר...' : 'רשום הוצאה'}
            </button>
          </div>
        </form>
      </div>

      {/* כרטיסי תזרים לפי 3 אמצעי התשלום (לפי הסינון הנוכחי) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 tabular-nums">
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">הכנסות (מסונן)</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{formatILS(summary.income)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">הוצאות (מסונן)</div>
          <div className="text-xl font-extrabold text-red-700 mt-1">{formatILS(summary.expense)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-emerald-200 shadow-soft">
          <div className="text-xs font-bold text-emerald-800">נטו מזומן</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatILS(summary.cashNet)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-sky-200 shadow-soft">
          <div className="text-xs font-bold text-sky-800">נטו פייבוקס</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatILS(summary.payboxNet)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-amber-200 shadow-soft">
          <div className="text-xs font-bold text-amber-800">נטו העברה בנקאית</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatILS(summary.transferNet)}</div>
        </div>
      </div>

      {/* יומן תנועות + הוצאות קבועות */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ספר תנועות עם סינון מלא */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
          <div className="p-4 border-b border-[#F3E9DC] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-[#C85A17]" />
                <h3 className="font-bold text-lg text-slate-900">יומן תנועות כספיות</h3>
              </div>
              <span className="text-xs font-bold text-slate-500 tabular-nums">
                {transactions.length} רשומות
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
              <FridaySelector value={filterFriday} onChange={setFilterFriday} allowAll label="" />
              <input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="w-full min-h-[48px] md:min-h-[38px] px-2.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]"
                title="מתאריך"
              />
              <input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="w-full min-h-[48px] md:min-h-[38px] px-2.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]"
                title="עד תאריך"
              />
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as '' | 'income' | 'expense')}
                className="w-full min-h-[48px] md:min-h-[38px] px-2.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] font-semibold"
              >
                <option value="">הכנסות והוצאות</option>
                <option value="income">הכנסות בלבד</option>
                <option value="expense">הוצאות בלבד</option>
              </select>
              <select
                value={filterPayment}
                onChange={(e) => setFilterPayment(e.target.value as '' | PaymentMethod)}
                className="w-full min-h-[48px] md:min-h-[38px] px-2.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] font-semibold"
              >
                <option value="">כל אמצעי התשלום</option>
                <option value="cash">מזומן</option>
                <option value="paybox">פייבוקס</option>
                <option value="transfer">העברה בנקאית</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400">טוען תנועות...</div>
          ) : transactions.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              לא נמצאו תנועות לפי הסינון הנוכחי.
            </div>
          ) : (
            <div className="divide-y divide-[#F3E9DC]">
              {transactions.map((t) => (
                <div key={t.id} className="p-4 flex items-center justify-between gap-3 hover:bg-[#FDFBF7]">
                  <div className="flex items-start gap-3">
                    {t.type === 'income' ? (
                      <ArrowUpCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <ArrowDownCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold text-sm text-slate-900">{t.category}</div>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <span>{formatHebrewDate(t.date)}</span>
                        <span>·</span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                            t.payment_method === 'cash'
                              ? 'bg-emerald-50 text-emerald-800'
                              : t.payment_method === 'paybox'
                              ? 'bg-sky-50 text-sky-800'
                              : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {PAYMENT_METHOD_LABELS[t.payment_method]}
                        </span>
                        {t.user_name && <span>· {t.user_name}</span>}
                      </div>
                      {t.notes && <div className="text-xs text-slate-400 mt-0.5">{t.notes}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span
                      className={`font-extrabold tabular-nums text-sm ${
                        t.type === 'income' ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {t.type === 'income' ? '+' : '-'}
                      {formatILS(t.amount)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTx(t.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* הוצאות קבועות */}
        <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#C85A17]" />
                <span>הוצאות קבועות</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                שבועי פעיל: {formatILS(summary.weeklyFixed)} · חודשי פעיל: {formatILS(summary.monthlyFixed)}
              </p>
            </div>
            <button
              type="button"
              onClick={openAddFixed}
              className="p-2 rounded-xl bg-[#FFF7ED] text-[#C85A17] hover:bg-[#FFEDD5]"
              title="הוסף הוצאה קבועה"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleApplyFixedBulk('weekly')}
              className="min-h-[48px] md:min-h-[40px] py-2 px-2.5 rounded-xl bg-[#FAF6F0] hover:bg-[#FFF7ED] border border-[#E8D5BE] text-[11px] font-bold text-[#8A330B] flex items-center justify-center gap-1"
            >
              <PlayCircle className="w-3.5 h-3.5 shrink-0" />
              <span>החל שבועיות ליומן</span>
            </button>
            <button
              type="button"
              onClick={() => handleApplyFixedBulk('monthly')}
              className="min-h-[48px] md:min-h-[40px] py-2 px-2.5 rounded-xl bg-[#FAF6F0] hover:bg-[#FFF7ED] border border-[#E8D5BE] text-[11px] font-bold text-[#8A330B] flex items-center justify-center gap-1"
            >
              <PlayCircle className="w-3.5 h-3.5 shrink-0" />
              <span>החל חודשיות ליומן</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {fixedExpenses.map((f) => (
              <div
                key={f.id}
                className={`p-3.5 rounded-2xl border ${
                  f.is_active ? 'border-[#E8D5BE] bg-[#FDFBF7]' : 'border-slate-200 bg-slate-50 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-slate-900">{f.name}</span>
                  <span className="font-extrabold text-sm text-slate-900 tabular-nums">
                    {formatILS(f.amount)}
                  </span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {f.frequency === 'weekly' ? 'שבועי' : 'חודשי'} · {PAYMENT_METHOD_LABELS[f.payment_method]}
                </div>
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#F3E9DC]">
                  <button
                    type="button"
                    onClick={() => toggleFixed(f.id)}
                    className={`text-xs font-bold ${
                      f.is_active ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {f.is_active ? 'פעיל (השבת)' : 'מושבת (הפעל)'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditFixed(f)}
                      className="text-slate-400 hover:text-slate-800"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteFixed(f.id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* חלונית ניהול פחת סוף יום */}
      <WasteTrackingSheet
        open={wasteOpen}
        initialFriday={stallFriday}
        onClose={() => setWasteOpen(false)}
        onSaved={load}
      />

      {/* חלונית תנועה ידנית */}
      <BottomSheet
        open={showTxModal}
        onClose={() => setShowTxModal(false)}
        title="רישום תנועה ידנית"
        subtitle="הוספת הכנסה או הוצאה ישירות ליומן הכספים"
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleCreateTx} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTxForm({ ...txForm, type: 'income' })}
              className={`min-h-[48px] py-2 rounded-xl text-sm font-bold border ${
                txForm.type === 'income'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'border-[#E8D5BE] text-slate-600'
              }`}
            >
              הכנסה
            </button>
            <button
              type="button"
              onClick={() => setTxForm({ ...txForm, type: 'expense' })}
              className={`min-h-[48px] py-2 rounded-xl text-sm font-bold border ${
                txForm.type === 'expense'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'border-[#E8D5BE] text-slate-600'
              }`}
            >
              הוצאה
            </button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">קטגוריה / תיאור</label>
            <input
              type="text"
              required
              value={txForm.category}
              onChange={(e) => setTxForm({ ...txForm, category: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">סכום (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                dir="ltr"
                value={txForm.amount}
                onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
              <select
                value={txForm.payment_method}
                onChange={(e) => setTxForm({ ...txForm, payment_method: e.target.value as PaymentMethod })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
              >
                {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                  <option key={pm} value={pm}>
                    {PAYMENT_METHOD_LABELS[pm]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך</label>
              <input
                type="date"
                value={txForm.date}
                onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">שיוך לשישי</label>
              <input
                type="date"
                value={txForm.friday_date}
                onChange={(e) => setTxForm({ ...txForm, friday_date: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
            <input
              type="text"
              value={txForm.notes}
              onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full min-h-[50px] py-2.5 rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-base"
          >
            שמור תנועה
          </button>
        </form>
      </BottomSheet>

      {/* חלונית הוצאה קבועה */}
      <BottomSheet
        open={showFixedModal}
        onClose={() => setShowFixedModal(false)}
        title={editingFixed ? 'עריכת הוצאה קבועה' : 'הוספת הוצאה קבועה'}
        subtitle="משוקלל אוטומטית בדוח הרווח וההפסד לפי תקופה"
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleSaveFixed} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">שם ההוצאה</label>
            <input
              type="text"
              required
              value={fixedForm.name}
              onChange={(e) => setFixedForm({ ...fixedForm, name: e.target.value })}
              placeholder="לדוגמה: שכירות דוכן / ביטוח / אחסון / תוכנה"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">סכום (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                dir="ltr"
                value={fixedForm.amount}
                onChange={(e) => setFixedForm({ ...fixedForm, amount: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">תדירות</label>
              <select
                value={fixedForm.frequency}
                onChange={(e) =>
                  setFixedForm({ ...fixedForm, frequency: e.target.value as 'weekly' | 'monthly' })
                }
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
              >
                <option value="weekly">שבועי</option>
                <option value="monthly">חודשי</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
            <select
              value={fixedForm.payment_method}
              onChange={(e) =>
                setFixedForm({ ...fixedForm, payment_method: e.target.value as PaymentMethod })
              }
              className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
            >
              {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                <option key={pm} value={pm}>
                  {PAYMENT_METHOD_LABELS[pm]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="w-full min-h-[50px] py-2.5 rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-base"
          >
            {editingFixed ? 'עדכן הוצאה קבועה' : 'שמור הוצאה קבועה'}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
