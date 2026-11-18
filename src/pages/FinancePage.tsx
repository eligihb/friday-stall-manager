import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, ArrowUpCircle, ArrowDownCircle, Repeat, X } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatHebrewDate, formatILS, getNextFridayISO, PAYMENT_METHOD_LABELS } from '../lib/format';
import type { FixedExpense, PaymentMethod, Transaction } from '../types';

export function FinancePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [cogsSummary, setCogsSummary] = useState({
    sales_cogs: 0,
    charity_cogs: 0,
    charity_units: 0,
    total_cogs: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // מודאל תנועה חדשה
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    friday_date: getNextFridayISO(),
    type: 'expense' as 'income' | 'expense',
    category: '',
    payment_method: 'cash' as PaymentMethod,
    amount: '',
    notes: '',
  });

  // מודאל הוצאה קבועה
  const [showFixedModal, setShowFixedModal] = useState(false);
  const [fixedForm, setFixedForm] = useState({
    name: '',
    amount: '',
    frequency: 'weekly' as 'weekly' | 'monthly',
    payment_method: 'transfer' as PaymentMethod,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [txRes, fixRes, sumRes] = await Promise.all([
        apiFetch<{ transactions: Transaction[] }>('/api/finance/transactions'),
        apiFetch<{ fixed_expenses: FixedExpense[] }>('/api/finance/fixed-expenses'),
        apiFetch<{ sales_cogs: number; charity_cogs: number; charity_units: number; total_cogs: number }>(
          '/api/finance/summary'
        ),
      ]);
      setTransactions(txRes.transactions);
      setFixedExpenses(fixRes.fixed_expenses);
      setCogsSummary(sumRes);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתונים כספיים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const weeklyFixed = fixedExpenses
      .filter((f) => f.is_active && f.frequency === 'weekly')
      .reduce((s, f) => s + f.amount, 0);
    const monthlyFixed = fixedExpenses
      .filter((f) => f.is_active && f.frequency === 'monthly')
      .reduce((s, f) => s + f.amount, 0);
    return { income, expense, net: income - expense, weeklyFixed, monthlyFixed };
  }, [transactions, fixedExpenses]);

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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום תנועה');
    }
  };

  const handleDeleteTx = async (id: number) => {
    if (!window.confirm('למחוק תנועה זו?')) return;
    await apiFetch(`/api/finance/transactions/${id}`, { method: 'DELETE' });
    await load();
  };

  const handleCreateFixed = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/finance/fixed-expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...fixedForm,
          amount: Number(fixedForm.amount),
        }),
      });
      setShowFixedModal(false);
      setFixedForm({ name: '', amount: '', frequency: 'weekly', payment_method: 'transfer' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהוספת הוצאה קבועה');
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

  const applyFixedToTransactions = async (f: FixedExpense) => {
    await apiFetch('/api/finance/transactions', {
      method: 'POST',
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        friday_date: getNextFridayISO(),
        type: 'expense',
        category: f.name,
        payment_method: f.payment_method,
        amount: f.amount,
        notes: `רישום מהוצאה קבועה (${f.frequency === 'weekly' ? 'שבועי' : 'חודשי'})`,
      }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">כספים ותזרים</h2>
          <p className="text-sm text-slate-600 mt-1">
            מעקב הכנסות והוצאות (מזומן, ביט, העברה בנקאית) וניהול הוצאות קבועות שבועיות וחודשיות.
          </p>
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => setShowTxModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>רישום תנועה</span>
          </button>
          <button
            type="button"
            onClick={() => setShowFixedModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-[#E8D5BE] hover:border-[#C85A17] text-slate-800 font-bold text-sm"
          >
            <Repeat className="w-4 h-4 text-[#C85A17]" />
            <span>הוצאה קבועה</span>
          </button>
        </div>
      </div>

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 tabular-nums">
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">סה״כ הכנסות</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1.5">{formatILS(summary.income)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">סה״כ הוצאות תזרים</div>
          <div className="text-2xl font-extrabold text-red-700 mt-1.5">{formatILS(summary.expense)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">מאזן תזרימי נטו</div>
          <div
            className={`text-2xl font-extrabold mt-1.5 ${
              summary.net >= 0 ? 'text-slate-900' : 'text-red-700'
            }`}
          >
            {formatILS(summary.net)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">עלות מכר הזמנות (COGS)</div>
          <div className="text-2xl font-extrabold text-amber-800 mt-1.5">{formatILS(cogsSummary.sales_cogs)}</div>
        </div>
        <div className="bg-purple-50/70 rounded-2xl p-4 border border-purple-200 shadow-soft">
          <div className="text-xs font-bold text-purple-900">עלות חבילות חסד (נזקקים)</div>
          <div className="text-2xl font-extrabold text-purple-900 mt-1.5">{formatILS(cogsSummary.charity_cogs)}</div>
          <div className="text-[11px] text-purple-700 mt-0.5">{cogsSummary.charity_units} יח׳ תרומה (₪0 הכנסה)</div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ספר תנועות */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F3E9DC] flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-900">יומן תנועות כספיות</h3>
            <span className="text-xs text-slate-500 tabular-nums">{transactions.length} תנועות</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400">טוען...</div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400">אין תנועות רשומות.</div>
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
                      <div className="text-xs text-slate-500 mt-0.5">
                        {formatHebrewDate(t.date)} · {PAYMENT_METHOD_LABELS[t.payment_method]}
                        {t.user_name ? ` · ${t.user_name}` : ''}
                      </div>
                      {t.notes && <div className="text-xs text-slate-400 mt-0.5">{t.notes}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
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
        <div className="bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft p-5 space-y-4">
          <div>
            <h3 className="font-bold text-lg text-slate-900">הוצאות קבועות</h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              שבועי פעיל: {formatILS(summary.weeklyFixed)} · חודשי פעיל: {formatILS(summary.monthlyFixed)}
            </p>
          </div>

          <div className="space-y-2.5">
            {fixedExpenses.map((f) => (
              <div
                key={f.id}
                className={`p-3.5 rounded-xl border ${
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
                    onClick={() => applyFixedToTransactions(f)}
                    className="text-xs font-bold text-[#C85A17] hover:underline"
                  >
                    + רשום בתזרים היום
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleFixed(f.id)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      {f.is_active ? 'השבת' : 'הפעל'}
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

      {/* מודאל תנועה */}
      {showTxModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-bold">רישום תנועה כספית</h3>
              <button type="button" onClick={() => setShowTxModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTx} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTxForm({ ...txForm, type: 'income' })}
                  className={`py-2 rounded-xl text-sm font-bold border ${
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
                  className={`py-2 rounded-xl text-sm font-bold border ${
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
                  placeholder="לדוגמה: מכירות דוכן מזומן / רכישת קמח"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">סכום (₪)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    dir="ltr"
                    value={txForm.amount}
                    onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
                  <select
                    value={txForm.payment_method}
                    onChange={(e) => setTxForm({ ...txForm, payment_method: e.target.value as PaymentMethod })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  >
                    {(['cash', 'bit', 'transfer'] as const).map((pm) => (
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
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">שיוך לשישי</label>
                  <input
                    type="date"
                    value={txForm.friday_date}
                    onChange={(e) => setTxForm({ ...txForm, friday_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
                <input
                  type="text"
                  value={txForm.notes}
                  onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
              >
                שמור תנועה
              </button>
            </form>
          </div>
        </div>
      )}

      {/* מודאל הוצאה קבועה */}
      {showFixedModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-xl font-bold">הוספת הוצאה קבועה</h3>
              <button type="button" onClick={() => setShowFixedModal(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateFixed} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">שם ההוצאה</label>
                <input
                  type="text"
                  required
                  value={fixedForm.name}
                  onChange={(e) => setFixedForm({ ...fixedForm, name: e.target.value })}
                  placeholder="לדוגמה: גז וחשמל למאפייה"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">סכום (₪)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    dir="ltr"
                    value={fixedForm.amount}
                    onChange={(e) => setFixedForm({ ...fixedForm, amount: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">תדירות</label>
                  <select
                    value={fixedForm.frequency}
                    onChange={(e) =>
                      setFixedForm({ ...fixedForm, frequency: e.target.value as 'weekly' | 'monthly' })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
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
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                >
                  {(['cash', 'bit', 'transfer'] as const).map((pm) => (
                    <option key={pm} value={pm}>
                      {PAYMENT_METHOD_LABELS[pm]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
              >
                שמור הוצאה קבועה
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
