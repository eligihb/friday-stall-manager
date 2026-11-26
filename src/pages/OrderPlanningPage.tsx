import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChefHat,
  Plus,
  Minus,
  Save,
  Copy,
  Check,
  Share2,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS } from '../lib/format';
import { buildWhatsAppShareUrl, formatProductionWhatsApp } from '../lib/whatsappFormat';
import { useFriday } from '../context/FridayContext';
import { FridaySelector } from '../components/FridaySelector';
import type { BusinessSettings, FridayInventoryItem } from '../types';

interface PlanningItem {
  product_id: number;
  product_name: string;
  cost_price: number;
  customer_price: number;
  customer_qty: number;
  supplier_qty: number;
  package_qty: number;
  closed_total: number;
  has_history: boolean;
  history_weeks_count: number;
  avg_free_sold: number;
  last_waste: number;
  recommended_extra: number;
  recommendation_reason: string;
  extra_stall_qty: number;
  has_saved_extra: boolean;
}

export function OrderPlanningPage() {
  const { fridayDate, setFridayDate, refreshTick, triggerRefresh } = useFriday();
  const [items, setItems] = useState<PlanningItem[]>([]);
  const [historyFridays, setHistoryFridays] = useState<string[]>([]);
  const [extras, setExtras] = useState<Record<number, number>>({});
  const [settings, setSettings] = useState<BusinessSettings | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, setRes] = await Promise.all([
        apiFetch<{ friday_date: string; history_fridays: string[]; items: PlanningItem[] }>(
          `/api/planning?friday_date=${fridayDate}`
        ),
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
      ]);
      setItems(planRes.items || []);
      setHistoryFridays(planRes.history_fridays || []);
      setSettings(setRes.settings);

      const initialExtras: Record<number, number> = {};
      for (const it of planRes.items || []) {
        initialExtras[it.product_id] = it.has_saved_extra
          ? it.extra_stall_qty
          : it.recommended_extra;
      }
      setExtras(initialExtras);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת תכנון ההזמנה');
    } finally {
      setLoading(false);
    }
  }, [fridayDate]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTick]);

  const setExtraFor = (productId: number, value: number) => {
    const clean = Math.max(0, Math.floor(Number(value) || 0));
    setExtras((prev) => ({ ...prev, [productId]: clean }));
    setSavedMsg('');
  };

  const applyAllRecommendations = () => {
    const next: Record<number, number> = {};
    for (const it of items) {
      next[it.product_id] = it.recommended_extra;
    }
    setExtras(next);
    setSavedMsg('');
  };

  const handleSavePlan = async () => {
    setSaving(true);
    setError('');
    setSavedMsg('');
    try {
      await apiFetch('/api/planning', {
        method: 'PUT',
        body: JSON.stringify({
          friday_date: fridayDate,
          items: items.map((it) => ({
            product_id: it.product_id,
            extra_stall_qty: extras[it.product_id] ?? 0,
          })),
        }),
      });
      triggerRefresh();
      setSavedMsg('התכנון נשמר וסונכרן לענן');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת התכנון');
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => {
    let customerUnits = 0;
    let supplierUnits = 0;
    let packageUnits = 0;
    let extraUnits = 0;
    let totalCost = 0;

    for (const it of items) {
      const ex = extras[it.product_id] ?? 0;
      const total = it.closed_total + ex;
      customerUnits += it.customer_qty;
      supplierUnits += it.supplier_qty;
      packageUnits += it.package_qty;
      extraUnits += ex;
      totalCost += total * it.cost_price;
    }

    const closedUnits = customerUnits + supplierUnits + packageUnits;
    return {
      customerUnits,
      supplierUnits,
      packageUnits,
      closedUnits,
      extraUnits,
      grandTotalUnits: closedUnits + extraUnits,
      totalCost: Math.round(totalCost * 100) / 100,
    };
  }, [items, extras]);

  const whatsappText = useMemo(() => {
    const invItems: FridayInventoryItem[] = items.map((it) => {
      const ex = extras[it.product_id] ?? 0;
      return {
        product_id: it.product_id,
        product_name: it.product_name,
        cost_price: it.cost_price,
        customer_price: it.customer_price,
        supplier_qty: it.supplier_qty,
        customer_qty: it.customer_qty,
        charity_qty: it.package_qty,
        ordered_total: it.closed_total,
        extra_stall_qty: ex,
        total_to_bake: it.closed_total + ex,
      };
    });
    return formatProductionWhatsApp(fridayDate, invItems, settings);
  }, [items, extras, fridayDate, settings]);

  const whatsappUrl = useMemo(() => buildWhatsAppShareUrl(whatsappText), [whatsappText]);

  const handleCopyWhatsApp = async () => {
    await navigator.clipboard.writeText(whatsappText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* כותרת ופעולות */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800 flex items-center gap-2.5">
            <ChefHat className="w-7 h-7 text-[#C85A17]" />
            <span>תכנון הזמנה למאפייה</span>
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            ריכוז הזמנות סגורות ל-{formatFridayLabel(fridayDate)} + המלצה למכירה חופשית לפי{' '}
            {historyFridays.length > 0
              ? `${historyFridays.length} שבועות קודמים`
              : 'אומדן התחלתי'}
            .
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FridaySelector value={fridayDate} onChange={setFridayDate} label="שישי:" />
          <button
            type="button"
            onClick={applyAllRecommendations}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-[#FAF6F0] border border-[#E8D5BE] text-xs font-extrabold text-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>אפס להמלצות</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSavePlan}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-60 text-white text-xs font-extrabold"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'שומר...' : 'שמור תכנון בענן'}</span>
          </button>
        </div>
      </div>

      {savedMsg && (
        <div className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{savedMsg}</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">הזמנות סגורות</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            {summary.closedUnits.toLocaleString('he-IL')}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            פרטיים: {summary.customerUnits} · ספקים: {summary.supplierUnits} · מארזים: {summary.packageUnits}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">תוספת למכירה חופשית</div>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">
            {summary.extraUnits.toLocaleString('he-IL')}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">מלאי חופשי לדוכן</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">סה״כ להזמנה למאפייה</div>
          <div className="text-2xl font-extrabold text-[#C85A17] mt-1">
            {summary.grandTotalUnits.toLocaleString('he-IL')}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">סגורות + תוספת לדוכן</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">עלות משוערת במזומן</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">
            {formatILS(summary.totalCost)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">לפי מחירי עלות במחירון</div>
        </div>
      </div>

      {/* טבלת תכנון מוצרים */}
      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען נתוני תכנון והיסטוריה...
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#FAF6F0] border-b border-[#E8D5BE] text-xs font-extrabold text-slate-600">
                <tr>
                  <th className="py-3 px-4">מוצר</th>
                  <th className="py-3 px-2.5 text-center">פרטיים</th>
                  <th className="py-3 px-2.5 text-center">ספקים</th>
                  <th className="py-3 px-2.5 text-center">פירוק מארזים</th>
                  <th className="py-3 px-3 text-center">סה״כ סגורות</th>
                  <th className="py-3 px-3">המלצה למכירה חופשית</th>
                  <th className="py-3 px-3 text-center">תוספת לדוכן (ידני)</th>
                  <th className="py-3 px-4 text-center">סה״כ להזמנה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9DC] tabular-nums">
                {items.map((it) => {
                  const extraVal = extras[it.product_id] ?? 0;
                  const finalTotal = it.closed_total + extraVal;
                  return (
                    <tr
                      key={it.product_id}
                      className={finalTotal > 0 ? 'bg-white hover:bg-[#FFFBF5]' : 'bg-slate-50/40'}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{it.product_name}</div>
                        <div className="text-[11px] text-slate-500">
                          עלות: {formatILS(it.cost_price)}
                        </div>
                      </td>
                      <td className="py-3 px-2.5 text-center font-semibold text-slate-700">
                        {it.customer_qty || '—'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-semibold text-slate-700">
                        {it.supplier_qty || '—'}
                      </td>
                      <td className="py-3 px-2.5 text-center font-semibold text-purple-800">
                        {it.package_qty || '—'}
                      </td>
                      <td className="py-3 px-3 text-center font-extrabold text-slate-900">
                        {it.closed_total}
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-900">
                            {it.recommended_extra} יח׳
                          </span>
                          {extraVal !== it.recommended_extra && (
                            <button
                              type="button"
                              onClick={() => setExtraFor(it.product_id, it.recommended_extra)}
                              className="text-[10px] font-bold text-[#C85A17] hover:underline"
                            >
                              החל
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {it.recommendation_reason}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setExtraFor(it.product_id, extraVal - 1)}
                            className="w-7 h-7 rounded-lg bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center hover:bg-[#F3E9DC]"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            inputMode="numeric"
                            dir="ltr"
                            value={extraVal}
                            onChange={(e) => setExtraFor(it.product_id, Number(e.target.value))}
                            className="w-14 h-7 rounded-lg border border-[#E8D5BE] bg-white text-center font-extrabold text-xs focus:border-[#C85A17] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setExtraFor(it.product_id, extraVal + 1)}
                            className="w-7 h-7 rounded-lg bg-[#C85A17] text-white flex items-center justify-center hover:bg-[#A9440F]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block min-w-[44px] px-2.5 py-1 rounded-xl font-extrabold text-sm ${
                            finalTotal > 0
                              ? 'bg-[#2B1B12] text-amber-50'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          {finalTotal}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-[#FAF6F0] border-t-2 border-[#E8D5BE] font-extrabold text-xs tabular-nums">
                <tr>
                  <td className="py-3.5 px-4 text-slate-900">סה״כ</td>
                  <td className="py-3.5 px-2.5 text-center">{summary.customerUnits}</td>
                  <td className="py-3.5 px-2.5 text-center">{summary.supplierUnits}</td>
                  <td className="py-3.5 px-2.5 text-center text-purple-800">{summary.packageUnits}</td>
                  <td className="py-3.5 px-3 text-center text-slate-900">{summary.closedUnits}</td>
                  <td className="py-3.5 px-3 text-slate-500">
                    עלות: {formatILS(summary.totalCost)}
                  </td>
                  <td className="py-3.5 px-3 text-center text-amber-800">{summary.extraUnits}</td>
                  <td className="py-3.5 px-4 text-center text-base text-[#C85A17]">
                    {summary.grandTotalUnits}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* סרגל שליחה והעתקה למאפייה */}
      <div className="bg-white rounded-2xl border border-[#E8D5BE] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-xs text-slate-600">
          <span className="font-extrabold text-slate-900">שליחת הזמנה למאפייה:</span>{' '}
          {summary.grandTotalUnits} יחידות בסה״כ ({formatILS(summary.totalCost)} עלות משוערת)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleCopyWhatsApp}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#FAF6F0] hover:bg-[#F3E9DC] border border-[#E8D5BE] text-xs font-extrabold text-slate-800"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'ההזמנה הועתקה' : 'העתק הזמנה'}</span>
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1EB958] text-white text-xs font-extrabold"
          >
            <Share2 className="w-4 h-4" />
            <span>שלח הזמנה בוואטסאפ</span>
          </a>
        </div>
      </div>
    </div>
  );
}
