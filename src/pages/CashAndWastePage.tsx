import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Coins,
  Banknote,
  Plus,
  Minus,
  RotateCcw,
  Save,
  CheckCircle2,
  AlertOctagon,
  ArrowLeftRight,
  PackageCheck,
  Percent,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useFriday } from '../context/FridayContext';
import { FridaySelector } from '../components/FridaySelector';
import { formatFridayLabel, formatILS } from '../lib/format';
import {
  ISRAELI_DENOMINATIONS,
  calculateProductWasteLoss,
  computeCountsTotal,
  loadFridayCashRegister,
  loadFridayWasteConfigs,
  saveFridayCashRegister,
  saveFridayWasteConfigs,
  type FridayCashRegisterEntry,
  type ProductWasteConfig,
  type WasteDisposition,
} from '../lib/cashRegisterStore';
import type { WasteLogResponse } from '../types';

export function CashAndWastePage() {
  const { fridayDate, setFridayDate } = useFriday();
  const [cashMode, setCashMode] = useState<'opening' | 'closing'>('opening');
  const [regEntry, setRegEntry] = useState<FridayCashRegisterEntry>(() =>
    loadFridayCashRegister(fridayDate)
  );
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  // ניהול פחת גמיש
  const [productsList, setProductsList] = useState<
    Array<{ product_id: number; product_name: string; cost_price: number }>
  >([]);
  const [wasteConfigs, setWasteConfigs] = useState<Record<number, ProductWasteConfig>>({});
  const [loadingWaste, setLoadingWaste] = useState(true);
  const [savingWaste, setSavingWaste] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  // טעינת נתוני קופה ופחת לתאריך שישי הנבחר
  const loadFridayData = useCallback(async () => {
    setRegEntry(loadFridayCashRegister(fridayDate));
    setLoadingWaste(true);
    try {
      const res = await apiFetch<WasteLogResponse>(`/api/finance/waste?friday_date=${fridayDate}`);
      const savedConfigs = loadFridayWasteConfigs(fridayDate);
      const nextConfigs: Record<number, ProductWasteConfig> = {};
      const prods: Array<{ product_id: number; product_name: string; cost_price: number }> = [];

      for (const item of res.items) {
        prods.push({
          product_id: item.product_id,
          product_name: item.product_name,
          cost_price: item.cost_price,
        });
        const existingCfg = savedConfigs[item.product_id];
        if (existingCfg) {
          nextConfigs[item.product_id] = {
            ...existingCfg,
            quantity: existingCfg.quantity ?? item.quantity,
          };
        } else {
          nextConfigs[item.product_id] = {
            productId: item.product_id,
            quantity: item.quantity || 0,
            disposition: 'lost',
            salvagePct: 50,
            manualSalvageValue: null,
            notes: item.notes || '',
          };
        }
      }
      setProductsList(prods);
      setWasteConfigs(nextConfigs);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני פחת');
    } finally {
      setLoadingWaste(false);
    }
  }, [fridayDate]);

  useEffect(() => {
    loadFridayData();
  }, [loadFridayData]);

  const activeCounts = cashMode === 'opening' ? regEntry.openingCounts : regEntry.closingCounts;
  const activeManualTotal =
    cashMode === 'opening' ? regEntry.openingManualTotal : regEntry.closingManualTotal;

  const updateDenomCount = (denomVal: number, nextCount: number) => {
    const clean = Math.max(0, Math.floor(Number(nextCount) || 0));
    const key = String(denomVal);
    setRegEntry((prev) => {
      const targetCounts = {
        ...(cashMode === 'opening' ? prev.openingCounts : prev.closingCounts),
        [key]: clean,
      };
      const updated: FridayCashRegisterEntry =
        cashMode === 'opening'
          ? { ...prev, openingCounts: targetCounts, openingManualTotal: null }
          : { ...prev, closingCounts: targetCounts, closingManualTotal: null };
      return saveFridayCashRegister(updated);
    });
  };

  const updateManualTotal = (valStr: string) => {
    const trimmed = valStr.trim();
    const num = trimmed === '' ? null : Math.max(0, Number(trimmed) || 0);
    setRegEntry((prev) => {
      const updated: FridayCashRegisterEntry =
        cashMode === 'opening'
          ? { ...prev, openingManualTotal: num }
          : { ...prev, closingManualTotal: num };
      return saveFridayCashRegister(updated);
    });
  };

  const resetCurrentCounts = () => {
    setRegEntry((prev) => {
      const updated: FridayCashRegisterEntry =
        cashMode === 'opening'
          ? { ...prev, openingCounts: {}, openingManualTotal: null }
          : { ...prev, closingCounts: {}, closingManualTotal: null };
      return saveFridayCashRegister(updated);
    });
    showToast(cashMode === 'opening' ? 'ספירת פתיחת הקופה אופסה' : 'ספירת סגירת הקופה אופסה');
  };

  // עדכון הגדרת פחת למוצר
  const updateProductWaste = (
    productId: number,
    patch: Partial<ProductWasteConfig>
  ) => {
    setWasteConfigs((prev) => {
      const cur = prev[productId] || {
        productId,
        quantity: 0,
        disposition: 'lost' as WasteDisposition,
        salvagePct: 50,
        manualSalvageValue: null,
      };
      return {
        ...prev,
        [productId]: { ...cur, ...patch },
      };
    });
  };

  // סיכום חי של הפחת לפי 3 הקטגוריות
  const wasteTotals = useMemo(() => {
    let totalUnits = 0;
    let nextWeekUnits = 0;
    let totalSalvagedILS = 0;
    let totalNetLostILS = 0;

    for (const p of productsList) {
      const cfg = wasteConfigs[p.product_id];
      if (!cfg || cfg.quantity <= 0) continue;
      const calc = calculateProductWasteLoss(p.cost_price, cfg);
      totalUnits += cfg.quantity;
      if (cfg.disposition === 'next_week') {
        nextWeekUnits += cfg.quantity;
      }
      totalSalvagedILS += calc.salvagedValue;
      totalNetLostILS += calc.netLostCost;
    }

    return {
      totalUnits,
      nextWeekUnits,
      totalSalvagedILS: Math.round(totalSalvagedILS * 100) / 100,
      totalNetLostILS: Math.round(totalNetLostILS * 100) / 100,
    };
  }, [productsList, wasteConfigs]);

  const handleSaveWaste = async () => {
    setSavingWaste(true);
    setError('');
    try {
      saveFridayWasteConfigs(fridayDate, wasteConfigs);
      const itemsPayload = productsList.map((p) => {
        const cfg = wasteConfigs[p.product_id] || {
          productId: p.product_id,
          quantity: 0,
          disposition: 'lost' as WasteDisposition,
          salvagePct: 50,
          manualSalvageValue: null,
        };
        const calc = calculateProductWasteLoss(p.cost_price, cfg);
        const dispLabel =
          cfg.disposition === 'next_week'
            ? 'יימכר שבוע הבא'
            : cfg.disposition === 'partial'
            ? `יימכר חלקית (הצלה: ${formatILS(calc.salvagedValue)})`
            : 'פחת אבוד';
        return {
          product_id: p.product_id,
          quantity: cfg.quantity,
          effective_unit_cost: calc.effectiveUnitLossCost,
          notes: cfg.quantity > 0 ? dispLabel : '',
        };
      });

      await apiFetch('/api/finance/waste', {
        method: 'PUT',
        body: JSON.stringify({
          friday_date: fridayDate,
          items: itemsPayload,
        }),
      });
      showToast('נתוני הפחת נשמרו ועודכנו אוטומטית בחישוב הרווח וההפסד ✓');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת הפחת');
    } finally {
      setSavingWaste(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* כותרת ובורר יום שישי */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">קופה ופחת</h2>
          <p className="text-sm text-slate-600 mt-1">
            סופר שטרות ומטבעות לפתיחת וסגירת קופה + ניהול פחת גמיש המסונכרן אוטומטית לרווח והפסד.
          </p>
        </div>
        <FridaySelector value={fridayDate} onChange={setFridayDate} />
      </div>

      {toast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm font-extrabold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {/* =====================================================================
          חלק א' — פתיחת וסגירת קופה עם סופר שטרות ומטבעות ישראליים
      ===================================================================== */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Coins className="w-6 h-6 text-[#C85A17]" />
              <span>חלק א׳ — פתיחת וסגירת קופה ({formatFridayLabel(fridayDate)})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              לחץ על אייקון השטר או המטבע להוספת +1, השתמש בכפתורי + / - או הקלד כמות ידנית.
            </p>
          </div>
          <button
            type="button"
            onClick={resetCurrentCounts}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] text-xs font-bold text-slate-600 hover:text-red-600"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>אפס ספירה נוכחית</span>
          </button>
        </div>

        {/* כרטיסי סיכום קופה ורווח מזומן נטו (סגירה פחות פתיחה) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
          <button
            type="button"
            onClick={() => setCashMode('opening')}
            className={`text-right p-4 rounded-2xl border-2 transition-all ${
              cashMode === 'opening'
                ? 'border-[#C85A17] bg-[#FFF7ED] shadow-sm'
                : 'border-[#E8D5BE] bg-[#FAF6F0] hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700">
                1. פתיחת קופה (תחילת יום)
              </span>
              {cashMode === 'opening' && (
                <span className="px-2 py-0.5 rounded-full bg-[#C85A17] text-white text-[10px] font-extrabold">
                  בעריכה
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1.5">
              {formatILS(regEntry.openingTotal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">עודף התחלתי בקופה (מופחת מהסגירה)</div>
          </button>

          <button
            type="button"
            onClick={() => setCashMode('closing')}
            className={`text-right p-4 rounded-2xl border-2 transition-all ${
              cashMode === 'closing'
                ? 'border-[#C85A17] bg-[#FFF7ED] shadow-sm'
                : 'border-[#E8D5BE] bg-[#FAF6F0] hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-700">
                2. סגירת קופה (סוף יום)
              </span>
              {cashMode === 'closing' && (
                <span className="px-2 py-0.5 rounded-full bg-[#C85A17] text-white text-[10px] font-extrabold">
                  בעריכה
                </span>
              )}
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1.5">
              {formatILS(regEntry.closingTotal)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">סה״כ מזומן שנספר בסיום היום</div>
          </button>

          <div className="p-4 rounded-2xl border-2 border-emerald-300 bg-emerald-50/70 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-emerald-900">
                פדיון מזומן נטו (סגירה - פתיחה)
              </span>
              <ArrowLeftRight className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1.5">
              {formatILS(regEntry.netCashRevenue)}
            </div>
            <div className="text-[11px] text-emerald-800 font-semibold mt-0.5">
              משוקלל אוטומטית ברווח הנקי של יום שישי
            </div>
          </div>
        </div>

        {/* בורר מצב עריכה מהיר */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]">
          <button
            type="button"
            onClick={() => setCashMode('opening')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
              cashMode === 'opening'
                ? 'bg-[#2B1B12] text-amber-50 shadow-sm'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            🌅 פתיחת קופה (תחילת יום)
          </button>
          <button
            type="button"
            onClick={() => setCashMode('closing')}
            className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all ${
              cashMode === 'closing'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-white'
            }`}
          >
            🌙 סגירת קופה (סוף יום)
          </button>
        </div>

        {/* רשת אייקונים מעוצבים של שטרות ומטבעות ישראליים */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ISRAELI_DENOMINATIONS.map((denom) => {
            const count = Number(activeCounts[String(denom.value)]) || 0;
            const subtotal = Math.round(count * denom.value * 100) / 100;
            const isBill = denom.kind === 'bill';

            return (
              <div
                key={denom.value}
                className={`rounded-2xl border p-3 flex flex-col justify-between gap-2.5 transition-all ${
                  count > 0
                    ? 'bg-[#FFF7ED] border-[#C85A17] shadow-sm'
                    : 'bg-[#FAF6F0]/60 border-[#E8D5BE]'
                }`}
              >
                {/* אייקון שטר / מטבע לחיץ — מוסיף +1 בכל לחיצה */}
                <button
                  type="button"
                  onClick={() => updateDenomCount(denom.value, count + 1)}
                  className="w-full flex flex-col items-center justify-center gap-1.5 group focus:outline-none"
                  title={`לחץ להוספת ${denom.label}`}
                >
                  {isBill ? (
                    <div
                      className={`w-full h-14 rounded-xl bg-gradient-to-br ${denom.colorCls} border-2 shadow-sm flex items-center justify-between px-3 group-active:scale-95 transition-transform`}
                    >
                      <Banknote className="w-5 h-5 opacity-85" />
                      <span className="font-black text-lg tracking-tight tabular-nums" dir="ltr">
                        {denom.label}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`w-14 h-14 rounded-full bg-gradient-to-br ${denom.colorCls} border-2 shadow-sm flex items-center justify-center group-active:scale-95 transition-transform`}
                    >
                      <span className="font-black text-sm tabular-nums" dir="ltr">
                        {denom.label}
                      </span>
                    </div>
                  )}
                  <span className="text-[10px] font-bold text-slate-500">
                    לחץ על ה{isBill ? 'שטר' : 'מטבע'} להוספה (+1)
                  </span>
                </button>

                {/* בקרי + / - ושדה קלט מספרי לחיץ להקלדה ידנית */}
                <div className="flex items-center justify-between gap-1">
                  <button
                    type="button"
                    onClick={() => updateDenomCount(denom.value, count - 1)}
                    className="w-8 h-8 rounded-lg bg-white border border-[#E8D5BE] hover:bg-slate-100 flex items-center justify-center text-slate-700 active:scale-95 shrink-0"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    dir="ltr"
                    value={count === 0 ? '' : count}
                    placeholder="0"
                    onChange={(e) => updateDenomCount(denom.value, Number(e.target.value) || 0)}
                    className="w-full h-8 text-center rounded-lg border border-[#E8D5BE] bg-white font-extrabold text-sm tabular-nums focus:border-[#C85A17] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => updateDenomCount(denom.value, count + 1)}
                    className="w-8 h-8 rounded-lg bg-[#C85A17] hover:bg-[#A9440F] text-white flex items-center justify-center active:scale-95 shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* סכום ביניים לשטר/מטבע */}
                <div className="text-center text-xs font-extrabold text-[#8A330B] tabular-nums border-t border-[#E8D5BE]/70 pt-1">
                  סה״כ: {formatILS(subtotal)}
                </div>
              </div>
            );
          })}
        </div>

        {/* שדה הזנת סכום כולל ישיר (במידת הצורך) */}
        <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold text-slate-800">
              הזנת סכום כולל ישיר ל{cashMode === 'opening' ? 'פתיחת קופה' : 'סגירת קופה'} (אופציונלי)
            </div>
            <div className="text-[11px] text-slate-500">
              סכום מחושב מהשטרות והמטבעות: {formatILS(computeCountsTotal(activeCounts))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              dir="ltr"
              placeholder={String(computeCountsTotal(activeCounts))}
              value={activeManualTotal !== null ? String(activeManualTotal) : ''}
              onChange={(e) => updateManualTotal(e.target.value)}
              className="w-40 px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-left font-extrabold text-sm tabular-nums"
            />
            {activeManualTotal !== null && (
              <button
                type="button"
                onClick={() => updateManualTotal('')}
                className="px-2.5 py-2 rounded-xl bg-white border border-[#E8D5BE] text-xs font-bold text-slate-600"
              >
                חזור לספירה
              </button>
            )}
          </div>
        </div>
      </section>

      {/* =====================================================================
          חלק ב' — ניהול פחת עם הגדרות שליטה עצמית (3 אפשרויות לכל מוצר)
      ===================================================================== */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-2xl font-bold text-slate-900 flex items-center gap-2">
              <AlertOctagon className="w-6 h-6 text-[#C85A17]" />
              <span>חלק ב׳ — ניהול פחת גמיש בסוף היום ({formatFridayLabel(fridayDate)})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              הזן כמות שנותרה לכל מוצר ובחר סיווג: יימכר שבוע הבא (ללא הפסד), יימכר חלקית, או פחת אבוד.
            </p>
          </div>
          <button
            type="button"
            disabled={savingWaste}
            onClick={handleSaveWaste}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm shadow-sm"
          >
            <Save className="w-4 h-4" />
            <span>{savingWaste ? 'שומר...' : 'שמור ועדכן פחת ברווח והפסד'}</span>
          </button>
        </div>

        {/* סיכום פחת חי */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 tabular-nums">
          <div className="p-3.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]">
            <div className="text-xs font-bold text-slate-600">סה״כ יחידות שנותרו בסוף היום</div>
            <div className="text-xl font-extrabold text-slate-900 mt-1">
              {wasteTotals.totalUnits} יח׳
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              מתוכן {wasteTotals.nextWeekUnits} יח׳ עוברות לשבוע הבא
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200">
            <div className="text-xs font-bold text-emerald-800 flex items-center gap-1">
              <PackageCheck className="w-4 h-4" />
              <span>שווי שניצל / עובר לשבוע הבא (ללא הפסד)</span>
            </div>
            <div className="text-xl font-extrabold text-emerald-700 mt-1">
              {formatILS(wasteTotals.totalSalvagedILS)}
            </div>
            <div className="text-[11px] text-emerald-700 mt-0.5">אינו נרשם כהפסד ברווח והפסד</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-red-50/80 border border-red-200">
            <div className="text-xs font-bold text-red-800">הוצאת פחת אבוד לרווח והפסד</div>
            <div className="text-xl font-extrabold text-red-600 mt-1">
              {formatILS(wasteTotals.totalNetLostILS)}
            </div>
            <div className="text-[11px] text-red-700 mt-0.5">מופחת אוטומטית מהרווח הנקי</div>
          </div>
        </div>

        {loadingWaste ? (
          <div className="py-10 text-center text-sm text-slate-400">טוען רשימת מוצרים...</div>
        ) : (
          <div className="space-y-3">
            {productsList.map((prod) => {
              const cfg = wasteConfigs[prod.product_id] || {
                productId: prod.product_id,
                quantity: 0,
                disposition: 'lost' as WasteDisposition,
                salvagePct: 50,
                manualSalvageValue: null,
              };
              const calc = calculateProductWasteLoss(prod.cost_price, cfg);

              return (
                <div
                  key={prod.product_id}
                  className={`p-3.5 rounded-2xl border transition-all space-y-3 ${
                    cfg.quantity > 0
                      ? 'bg-[#FFFDF9] border-[#C85A17] shadow-soft'
                      : 'bg-[#FAF6F0]/50 border-[#E8D5BE]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-extrabold text-sm sm:text-base text-slate-900">
                        {prod.product_name}
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        עלות ייצור/קנייה ליחידה: <strong>{formatILS(prod.cost_price)}</strong>
                      </div>
                    </div>

                    {/* הזנת כמות שנותרה */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600">כמות שנותרה:</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateProductWaste(prod.product_id, {
                            quantity: Math.max(0, cfg.quantity - 1),
                          })
                        }
                        className="w-8 h-8 rounded-lg bg-white border border-[#E8D5BE] flex items-center justify-center"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        dir="ltr"
                        value={cfg.quantity === 0 ? '' : cfg.quantity}
                        placeholder="0"
                        onChange={(e) =>
                          updateProductWaste(prod.product_id, {
                            quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                          })
                        }
                        className="w-16 h-8 text-center rounded-lg border border-[#E8D5BE] bg-white font-extrabold text-sm tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateProductWaste(prod.product_id, {
                            quantity: cfg.quantity + 1,
                          })
                        }
                        className="w-8 h-8 rounded-lg bg-[#C85A17] text-white flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 3 אפשרויות סיווג גמישות לבחירה */}
                  {cfg.quantity > 0 && (
                    <div className="pt-2 border-t border-[#F3E9DC] space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateProductWaste(prod.product_id, { disposition: 'next_week' })
                          }
                          className={`py-2 px-3 rounded-xl border text-xs font-extrabold text-right transition-all ${
                            cfg.disposition === 'next_week'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : 'bg-white text-slate-700 border-[#E8D5BE] hover:bg-emerald-50/50'
                          }`}
                        >
                          <div>1. יימכר שבוע הבא</div>
                          <div className="text-[10px] opacity-85 font-semibold">
                            מלאי לשבוע הבא (0 ₪ הפסד)
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateProductWaste(prod.product_id, { disposition: 'partial' })
                          }
                          className={`py-2 px-3 rounded-xl border text-xs font-extrabold text-right transition-all ${
                            cfg.disposition === 'partial'
                              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                              : 'bg-white text-slate-700 border-[#E8D5BE] hover:bg-amber-50/50'
                          }`}
                        >
                          <div>2. חלקי / יימכר חלקית</div>
                          <div className="text-[10px] opacity-85 font-semibold">
                            הגדרה עצמית של אחוז/שווי ההצלה
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateProductWaste(prod.product_id, { disposition: 'lost' })
                          }
                          className={`py-2 px-3 rounded-xl border text-xs font-extrabold text-right transition-all ${
                            cfg.disposition === 'lost'
                              ? 'bg-red-600 text-white border-red-600 shadow-sm'
                              : 'bg-white text-slate-700 border-[#E8D5BE] hover:bg-red-50/50'
                          }`}
                        >
                          <div>3. לא יכול להימכר (פחת אבוד)</div>
                          <div className="text-[10px] opacity-85 font-semibold">
                            100% עלות ייצור נרשמת כהפסד
                          </div>
                        </button>
                      </div>

                      {/* הגדרות שליטה עצמית כאשר נבחר "חלקי / יימכר חלקית" */}
                      {cfg.disposition === 'partial' && (
                        <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <Percent className="w-4 h-4 text-amber-700" />
                            <span className="font-bold text-amber-950">אחוז הצלה/מכירה (%):</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="5"
                              dir="ltr"
                              value={cfg.salvagePct}
                              onChange={(e) =>
                                updateProductWaste(prod.product_id, {
                                  salvagePct: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                                  manualSalvageValue: null,
                                })
                              }
                              className="w-16 px-2 py-1 rounded-lg border border-amber-300 bg-white text-center font-extrabold tabular-nums"
                            />
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-bold text-amber-950">או שווי הצלה ידני (₪):</span>
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              dir="ltr"
                              placeholder={String(calc.salvagedValue)}
                              value={
                                cfg.manualSalvageValue !== null ? String(cfg.manualSalvageValue) : ''
                              }
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                updateProductWaste(prod.product_id, {
                                  manualSalvageValue: v === '' ? null : Math.max(0, Number(v) || 0),
                                });
                              }}
                              className="w-24 px-2 py-1 rounded-lg border border-amber-300 bg-white text-left font-extrabold tabular-nums"
                            />
                          </div>
                        </div>
                      )}

                      {/* שורת סיכום כספי לפריט */}
                      <div className="flex items-center justify-between text-xs font-bold tabular-nums px-1">
                        <span className="text-slate-500">
                          עלות כוללת ({cfg.quantity} יח׳): {formatILS(calc.grossCost)} · שווי שניצל:{' '}
                          <span className="text-emerald-700">{formatILS(calc.salvagedValue)}</span>
                        </span>
                        <span
                          className={
                            calc.netLostCost > 0
                              ? 'text-red-600 font-extrabold'
                              : 'text-emerald-700 font-extrabold'
                          }
                        >
                          נרשם כהוצאת פחת: {formatILS(calc.netLostCost)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
