import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  Download,
  Banknote,
  Smartphone,
  Landmark,
  Users,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, formatPercent, getNextFridayISO, ROLE_LABELS } from '../lib/format';
import { downloadCsv } from '../lib/csvExport';
import { FridaySelector } from '../components/FridaySelector';
import type { PnlReportResponse } from '../types';

export function ReportsPage() {
  const [mode, setMode] = useState<'friday' | 'month' | 'custom'>('friday');
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(getNextFridayISO());

  const [report, setReport] = useState<PnlReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ mode });
      if (mode === 'friday') qs.set('friday_date', fridayDate);
      else if (mode === 'month') qs.set('month', month);
      else {
        qs.set('from_date', fromDate);
        qs.set('to_date', toDate);
      }

      const data = await apiFetch<PnlReportResponse>(`/api/finance/pnl?${qs.toString()}`);
      setReport(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הדוחות');
    } finally {
      setLoading(false);
    }
  }, [mode, fridayDate, month, fromDate, toDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const exportPnlCsv = () => {
    if (!report) return;
    const p = report.pnl;
    downloadCsv(
      `דוח-רווח-והפסד-${report.period.label}.csv`,
      ['סעיף', 'סכום (₪)'],
      [
        ['הכנסות — הזמנות לקוחות', p.customer_orders_revenue],
        ['הכנסות — הזמנות ספקים', p.supplier_orders_revenue],
        ['הכנסות — קופת דוכן (מזומן)', p.walkin_stall_cash],
        ['הכנסות — קופת דוכן (ביט)', p.walkin_stall_bit],
        ['סה״כ הכנסות', p.total_revenue],
        ['עלות מכר — הזמנות (לקוחות וספקים)', -p.orders_cogs],
        ['עלות מכר — מלאי דוכן חופשי', -p.extra_stall_cogs],
        ['עלות מכר — תרומות למשפחות נזקקות', -p.charity_cogs],
        ['סה״כ עלות מכר (COGS)', -p.total_cogs],
        ['רווח גולמי', p.gross_profit],
        ['אחוז רווח גולמי (%)', p.gross_margin_pct],
        ['הוצאות תפעול משתנות', -p.variable_expenses],
        ['הוצאות קבועות יחסיות', -p.prorated_fixed_expenses],
        ['רווח נקי', p.net_profit],
        ['אחוז רווח נקי (%)', p.net_margin_pct],
      ]
    );
  };

  const exportReconciliationCsv = () => {
    if (!report) return;
    const r = report.reconciliation;
    downloadCsv(
      `התאמת-קופה-${report.period.label}.csv`,
      ['אמצעי תשלום', 'נכנס (₪)', 'יצא (₪)', 'נטו בקופה / חשבון (₪)'],
      [
        ['מזומן (קופה פיזית)', r.cash.in, r.cash.out, r.cash.net],
        ['ביט', r.bit.in, r.bit.out, r.bit.net],
        ['העברה בנקאית', r.transfer.in, r.transfer.out, r.transfer.net],
        ['סה״כ דיגיטלי (ביט + העברה)', r.digital_combined.in, r.digital_combined.out, r.digital_combined.net],
        ['סה״כ כולל', r.total_in, r.total_out, r.total_net],
      ]
    );
  };

  const exportBalancesCsv = () => {
    if (!report) return;
    downloadCsv(
      `דוח-חייבים-וזכאים-${new Date().toISOString().slice(0, 10)}.csv`,
      ['שם', 'תפקיד', 'טלפון', 'אימייל', 'סטטוס', 'יתרה (₪)', 'הערות'],
      report.open_balances.items.map((u) => [
        u.name,
        ROLE_LABELS[u.role],
        u.phone,
        u.email,
        u.balance < 0 ? 'חוב פתוח' : 'יתרת זכות',
        u.balance,
        u.notes,
      ])
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">דוחות ורווח והפסד</h2>
          <p className="text-sm text-slate-600 mt-1">
            דוח רווח והפסד מלא, התאמת קופה (מזומן מול ביט והעברות), ודוח חייבים וזכאים עם ייצוא לאקסל.
          </p>
        </div>

        {/* בורר תקופה */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-[#E8D5BE] shadow-soft">
          {(
            [
              ['friday', 'לפי שישי'],
              ['month', 'חודשי'],
              ['custom', 'טווח תאריכים'],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                mode === m ? 'bg-[#C85A17] text-white' : 'text-slate-600 hover:bg-[#FAF6F0]'
              }`}
            >
              {label}
            </button>
          ))}

          {mode === 'friday' && <FridaySelector value={fridayDate} onChange={setFridayDate} label="" />}
          {mode === 'month' && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-bold"
            />
          )}
          {mode === 'custom' && (
            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] font-semibold"
              />
              <span className="text-slate-400">עד</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] font-semibold"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {loading || !report ? (
        <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-[#E8D5BE]">
          מפיק דוחות כספיים...
        </div>
      ) : (
        <>
          {/* כרטיסי שורה תחתונה */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
            <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE] shadow-soft">
              <div className="text-xs font-bold text-slate-500">סה״כ הכנסות</div>
              <div className="text-2xl font-extrabold text-slate-900 mt-2">
                {formatILS(report.pnl.total_revenue)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE] shadow-soft">
              <div className="text-xs font-bold text-slate-500">רווח גולמי</div>
              <div className="text-2xl font-extrabold text-amber-800 mt-2">
                {formatILS(report.pnl.gross_profit)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                מרווח: {formatPercent(report.pnl.gross_margin_pct)}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE] shadow-soft">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                <span>רווח נקי</span>
                {report.pnl.net_profit >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-600" />
                )}
              </div>
              <div
                className={`text-2xl font-extrabold mt-2 ${
                  report.pnl.net_profit >= 0 ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {formatILS(report.pnl.net_profit)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                שיעור רווח נקי: {formatPercent(report.pnl.net_margin_pct)}
              </div>
            </div>
            <div className="bg-emerald-50/70 rounded-2xl p-5 border border-emerald-200 shadow-soft">
              <div className="text-xs font-bold text-emerald-900">צפי מזומן פיזי בקופה</div>
              <div className="text-2xl font-extrabold text-emerald-800 mt-2">
                {formatILS(report.reconciliation.cash.net)}
              </div>
              <div className="text-xs text-emerald-700 mt-0.5">
                נכנס {formatILS(report.reconciliation.cash.in)} · יצא{' '}
                {formatILS(report.reconciliation.cash.out)}
              </div>
            </div>
          </div>

          {/* 1. דוח רווח והפסד (P&L) */}
          <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3E9DC] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-[#C85A17]" />
                <div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">
                    דוח רווח והפסד (P&L)
                  </h3>
                  <p className="text-xs text-slate-500">תקופה: {report.period.label}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={exportPnlCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#FFF7ED] border border-[#E8D5BE] text-xs font-bold text-slate-800"
              >
                <Download className="w-4 h-4 text-[#C85A17]" />
                <span>ייצוא P&L לאקסל (CSV)</span>
              </button>
            </div>

            <div className="p-5 space-y-4 tabular-nums text-sm">
              {/* הכנסות */}
              <div className="space-y-1.5">
                <div className="text-xs font-extrabold uppercase tracking-wide text-emerald-800">
                  הכנסות (Revenue)
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-slate-600">הזמנות לקוחות</span>
                  <span className="font-semibold">{formatILS(report.pnl.customer_orders_revenue)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-slate-600">הזמנות ספקים סיטונאיים</span>
                  <span className="font-semibold">{formatILS(report.pnl.supplier_orders_revenue)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-slate-600">
                    פדיון דוכן חופשי (מזומן: {formatILS(report.pnl.walkin_stall_cash)} · ביט:{' '}
                    {formatILS(report.pnl.walkin_stall_bit)})
                  </span>
                  <span className="font-semibold">{formatILS(report.pnl.walkin_stall_revenue)}</span>
                </div>
                <div className="flex justify-between py-2 bg-emerald-50/70 px-3 rounded-xl font-extrabold text-emerald-900">
                  <span>סה״כ הכנסות</span>
                  <span>{formatILS(report.pnl.total_revenue)}</span>
                </div>
              </div>

              {/* עלות מכר */}
              <div className="space-y-1.5">
                <div className="text-xs font-extrabold uppercase tracking-wide text-amber-800">
                  בניכוי: עלות המכר והייצור (COGS)
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-slate-600">עלות ייצור הזמנות (לקוחות + ספקים)</span>
                  <span className="font-semibold text-red-700">-{formatILS(report.pnl.orders_cogs)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-slate-600">
                    עלות מלאי דוכן חופשי ({report.pnl.extra_stall_units} יח׳)
                  </span>
                  <span className="font-semibold text-red-700">-{formatILS(report.pnl.extra_stall_cogs)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-purple-800 font-medium">
                    עלות תרומות למשפחות נזקקות ({report.pnl.charity_units} יח׳)
                  </span>
                  <span className="font-semibold text-purple-800">-{formatILS(report.pnl.charity_cogs)}</span>
                </div>
                <div className="flex justify-between py-2.5 bg-amber-50 px-3 rounded-xl font-extrabold text-amber-950 text-base">
                  <span>= רווח גולמי ({formatPercent(report.pnl.gross_margin_pct)})</span>
                  <span>{formatILS(report.pnl.gross_profit)}</span>
                </div>
              </div>

              {/* הוצאות תפעול וקבועות */}
              <div className="space-y-1.5">
                <div className="text-xs font-extrabold uppercase tracking-wide text-red-800">
                  בניכוי: הוצאות תפעול והוצאות קבועות
                </div>
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-slate-600">הוצאות תפעול משתנות (יומן תנועות)</span>
                  <span className="font-semibold text-red-700">
                    -{formatILS(report.pnl.variable_expenses)}
                  </span>
                </div>
                {report.pnl.expense_breakdown.length > 0 && (
                  <div className="pr-4 space-y-1 text-xs text-slate-500">
                    {report.pnl.expense_breakdown.map((eb) => (
                      <div key={eb.category} className="flex justify-between">
                        <span>• {eb.category}</span>
                        <span>-{formatILS(eb.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between py-1.5 border-b border-[#F3E9DC]">
                  <span className="text-slate-600">הוצאות קבועות יחסיות לתקופה</span>
                  <span className="font-semibold text-red-700">
                    -{formatILS(report.pnl.prorated_fixed_expenses)}
                  </span>
                </div>
                {report.pnl.prorated_fixed_items.length > 0 && (
                  <div className="pr-4 space-y-1 text-xs text-slate-500">
                    {report.pnl.prorated_fixed_items.map((fi) => (
                      <div key={fi.id} className="flex justify-between">
                        <span>
                          • {fi.name} ({fi.frequency === 'weekly' ? 'שבועי' : 'חודשי'}:{' '}
                          {formatILS(fi.base_amount)})
                        </span>
                        <span>-{formatILS(fi.prorated_amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* שורה תחתונה - רווח נקי */}
              <div
                className={`flex items-center justify-between p-4 rounded-2xl font-extrabold text-lg ${
                  report.pnl.net_profit >= 0
                    ? 'bg-[#1E242B] text-white'
                    : 'bg-red-700 text-white'
                }`}
              >
                <div>
                  <div>= רווח נקי לתקופה</div>
                  <div className="text-xs font-normal text-amber-300">
                    שיעור רווחיות נטו: {formatPercent(report.pnl.net_margin_pct)}
                  </div>
                </div>
                <span className="text-2xl">{formatILS(report.pnl.net_profit)}</span>
              </div>
            </div>
          </div>

          {/* 2. התאמת קופה — מזומן מול ביט והעברה */}
          <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3E9DC] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-serif text-2xl font-bold text-slate-900">
                  התאמת קופה — ביט מול מזומן
                </h3>
                <p className="text-xs text-slate-500">
                  הפרדה מלאה בין צפי המזומן הפיזי במגירה לבין תקבולים ותשלומים דיגיטליים (ביט והעברות בנקאיות).
                </p>
              </div>
              <button
                type="button"
                onClick={exportReconciliationCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#FFF7ED] border border-[#E8D5BE] text-xs font-bold text-slate-800"
              >
                <Download className="w-4 h-4 text-[#C85A17]" />
                <span>ייצוא התאמת קופה (CSV)</span>
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-950">מזומן (קופה פיזית)</span>
                  <Banknote className="w-5 h-5 text-emerald-700" />
                </div>
                <div className="text-xs flex justify-between text-slate-600">
                  <span>מזומן נכנס:</span>
                  <span className="font-bold text-emerald-700">+{formatILS(report.reconciliation.cash.in)}</span>
                </div>
                <div className="text-xs flex justify-between text-slate-600">
                  <span>מזומן יוצא:</span>
                  <span className="font-bold text-red-700">-{formatILS(report.reconciliation.cash.out)}</span>
                </div>
                <div className="pt-2 border-t border-emerald-200 flex justify-between font-extrabold text-base text-emerald-900">
                  <span>צפי במגירה:</span>
                  <span>{formatILS(report.reconciliation.cash.net)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sky-950">ביט (Bit)</span>
                  <Smartphone className="w-5 h-5 text-sky-700" />
                </div>
                <div className="text-xs flex justify-between text-slate-600">
                  <span>נכנס בביט:</span>
                  <span className="font-bold text-emerald-700">+{formatILS(report.reconciliation.bit.in)}</span>
                </div>
                <div className="text-xs flex justify-between text-slate-600">
                  <span>יצא בביט:</span>
                  <span className="font-bold text-red-700">-{formatILS(report.reconciliation.bit.out)}</span>
                </div>
                <div className="pt-2 border-t border-sky-200 flex justify-between font-extrabold text-base text-sky-900">
                  <span>נטו ביט:</span>
                  <span>{formatILS(report.reconciliation.bit.net)}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-950">העברה בנקאית</span>
                  <Landmark className="w-5 h-5 text-amber-700" />
                </div>
                <div className="text-xs flex justify-between text-slate-600">
                  <span>נכנס בהעברה:</span>
                  <span className="font-bold text-emerald-700">
                    +{formatILS(report.reconciliation.transfer.in)}
                  </span>
                </div>
                <div className="text-xs flex justify-between text-slate-600">
                  <span>יצא בהעברה:</span>
                  <span className="font-bold text-red-700">
                    -{formatILS(report.reconciliation.transfer.out)}
                  </span>
                </div>
                <div className="pt-2 border-t border-amber-200 flex justify-between font-extrabold text-base text-amber-900">
                  <span>נטו בנק:</span>
                  <span>{formatILS(report.reconciliation.transfer.net)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. דוח חייבים וזכאים */}
          <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F3E9DC] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-[#C85A17]" />
                <div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900">דוח חייבים וזכאים</h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    סה״כ חובות פתוחים לגבייה:{' '}
                    <span className="font-bold text-red-700">
                      {formatILS(report.open_balances.total_receivables)}
                    </span>{' '}
                    · סה״כ יתרות זכות:{' '}
                    <span className="font-bold text-emerald-700">
                      {formatILS(report.open_balances.total_credits)}
                    </span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={exportBalancesCsv}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF6F0] hover:bg-[#FFF7ED] border border-[#E8D5BE] text-xs font-bold text-slate-800"
              >
                <Download className="w-4 h-4 text-[#C85A17]" />
                <span>ייצוא חייבים וזכאים (CSV)</span>
              </button>
            </div>

            {report.open_balances.items.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                כל החשבונות מאוזנים! אין יתרות חוב או זכות פתוחות.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#F3E9DC]/70 text-slate-700 border-b border-[#E8D5BE]">
                      <th className="text-right py-3 px-4 font-bold">שם</th>
                      <th className="text-right py-3 px-4 font-bold">תפקיד</th>
                      <th className="text-right py-3 px-4 font-bold">טלפון</th>
                      <th className="text-right py-3 px-4 font-bold">הערות</th>
                      <th className="text-left py-3 px-4 font-bold">יתרה (חוב / זכות)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3E9DC] tabular-nums">
                    {report.open_balances.items.map((u) => (
                      <tr key={u.id} className="hover:bg-[#FDFBF7]">
                        <td className="py-3 px-4 font-bold text-slate-900">{u.name}</td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-600">
                          {ROLE_LABELS[u.role]}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{u.phone || '—'}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{u.notes || '—'}</td>
                        <td className="py-3 px-4 text-left font-extrabold">
                          {u.balance < 0 ? (
                            <span className="text-red-600">חוב {formatILS(Math.abs(u.balance))}</span>
                          ) : (
                            <span className="text-emerald-700">זכות {formatILS(u.balance)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
