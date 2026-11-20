import React, { useEffect, useMemo, useState } from 'react';
import { Award, TrendingUp, AlertTriangle, BarChart2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, formatPercent, formatShortFriday } from '../lib/format';
import type { AdminProduct, Order, WasteLogResponse } from '../types';

interface AnalyticsSectionProps {
  mode: 'friday' | 'month' | 'custom';
  fridayDate: string;
  month: string;
  fromDate: string;
  toDate: string;
}

interface ProductPerformanceRow {
  productId: number;
  name: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  wasteUnits: number;
  wasteCost: number;
  netProfit: number;
  marginPct: number;
  wastePct: number;
}

function getPreviousDateISO(iso: string, daysBack: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

function getPreviousMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / Math.abs(prev)) * 1000) / 10;
}

export function AnalyticsSection({ mode, fridayDate, month, fromDate, toDate }: AnalyticsSectionProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [wasteByFriday, setWasteByFriday] = useState<Record<string, WasteLogResponse>>({});
  const [rankTab, setRankTab] = useState<'bestseller' | 'profitable' | 'waste'>('bestseller');
  const [compareMode, setCompareMode] = useState<'week' | 'month'>('week');
  const [trendMetric, setTrendMetric] = useState<'revenue' | 'profit' | 'customers' | 'units'>('revenue');

  useEffect(() => {
    let active = true;
    Promise.all([
      apiFetch<{ orders: Order[] }>('/api/orders'),
      apiFetch<{ products: AdminProduct[] }>('/api/products'),
    ]).then(async ([oRes, pRes]) => {
      if (!active) return;
      const validOrders = oRes.orders.filter(
        (o) => o.status !== 'awaiting_approval' && o.order_type !== 'charity'
      );
      setOrders(validOrders);
      setProducts(pRes.products);

      const uniqueFridays = Array.from(
        new Set([fridayDate, getPreviousDateISO(fridayDate, 7), ...validOrders.map((o) => o.friday_date)])
      )
        .filter(Boolean)
        .slice(0, 8);

      const wasteEntries = await Promise.all(
        uniqueFridays.map(async (f) => {
          try {
            const w = await apiFetch<WasteLogResponse>(`/api/finance/waste?friday_date=${f}`);
            return [f, w] as const;
          } catch {
            return null;
          }
        })
      );
      if (!active) return;
      const map: Record<string, WasteLogResponse> = {};
      for (const entry of wasteEntries) {
        if (entry) map[entry[0]] = entry[1];
      }
      setWasteByFriday(map);
    });
    return () => {
      active = false;
    };
  }, [fridayDate]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filterOrdersByPeriod = (oList: Order[], pMode: 'friday' | 'month' | 'custom', fDate: string, mStr: string, from: string, to: string) => {
    return oList.filter((o) => {
      if (pMode === 'friday') return o.friday_date === fDate;
      if (pMode === 'month') return o.friday_date.startsWith(mStr);
      return o.friday_date >= from && o.friday_date <= to;
    });
  };

  // 1. דירוג ביצועי מוצרים
  const productPerformance = useMemo<ProductPerformanceRow[]>(() => {
    const periodOrders = filterOrdersByPeriod(orders, mode, fridayDate, month, fromDate, toDate);
    const periodFridays = new Set(periodOrders.map((o) => o.friday_date));
    if (mode === 'friday') periodFridays.add(fridayDate);

    const map = new Map<number, ProductPerformanceRow>();
    const ensure = (pid: number, name: string) => {
      let row = map.get(pid);
      if (!row) {
        row = {
          productId: pid,
          name,
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          wasteUnits: 0,
          wasteCost: 0,
          netProfit: 0,
          marginPct: 0,
          wastePct: 0,
        };
        map.set(pid, row);
      }
      return row;
    };

    for (const o of periodOrders) {
      for (const it of o.items) {
        const prod = productMap.get(it.product_id);
        const row = ensure(it.product_id, it.product_name || prod?.name || `#${it.product_id}`);
        const unitCost = it.cost_price_snapshot ?? prod?.cost_price ?? 0;
        row.unitsSold += it.quantity;
        row.revenue += it.quantity * it.unit_price_snapshot;
        row.cost += it.quantity * unitCost;
      }
    }

    for (const f of periodFridays) {
      const w = wasteByFriday[f];
      if (!w) continue;
      for (const wi of w.items) {
        if (wi.quantity <= 0) continue;
        const row = ensure(wi.product_id, wi.product_name);
        row.wasteUnits += wi.quantity;
        row.wasteCost += wi.line_cost;
      }
    }

    const list = Array.from(map.values()).map((r) => {
      const netProfit = Math.round((r.revenue - r.cost - r.wasteCost) * 100) / 100;
      const marginPct = r.revenue > 0 ? Math.round((netProfit / r.revenue) * 1000) / 10 : 0;
      const totalHandled = r.unitsSold + r.wasteUnits;
      const wastePct = totalHandled > 0 ? Math.round((r.wasteUnits / totalHandled) * 1000) / 10 : 0;
      return { ...r, netProfit, marginPct, wastePct };
    });

    if (rankTab === 'bestseller') {
      list.sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue);
    } else if (rankTab === 'profitable') {
      list.sort((a, b) => b.netProfit - a.netProfit);
    } else {
      list.sort((a, b) => b.wasteCost - a.wasteCost || a.wastePct - b.wastePct);
    }
    return list;
  }, [orders, mode, fridayDate, month, fromDate, toDate, productMap, wasteByFriday, rankTab]);

  // 2. השוואת תקופות (שבוע מול שבוע / חודש מול חודש)
  const comparison = useMemo(() => {
    const calcBucket = (oList: Order[], fridaysInBucket: string[]) => {
      const revenue = oList.reduce((s, o) => s + o.total_amount, 0);
      const units = oList.reduce((s, o) => s + o.items.reduce((is, it) => is + it.quantity, 0), 0);
      const customers = new Set(oList.map((o) => o.user_id || o.recipient_name)).size;
      const cogs = oList.reduce(
        (s, o) =>
          s +
          o.items.reduce((is, it) => {
            const p = productMap.get(it.product_id);
            return is + it.quantity * (it.cost_price_snapshot ?? p?.cost_price ?? 0);
          }, 0),
        0
      );
      const wasteCost = fridaysInBucket.reduce((s, f) => s + (wasteByFriday[f]?.total_waste_cost ?? 0), 0);
      const netProfit = Math.round((revenue - cogs - wasteCost) * 100) / 100;
      return { revenue, netProfit, customers, units, wasteCost };
    };

    if (compareMode === 'week') {
      const prevFri = getPreviousDateISO(fridayDate, 7);
      const currOrders = orders.filter((o) => o.friday_date === fridayDate);
      const prevOrders = orders.filter((o) => o.friday_date === prevFri);
      return {
        currLabel: formatShortFriday(fridayDate),
        prevLabel: formatShortFriday(prevFri),
        curr: calcBucket(currOrders, [fridayDate]),
        prev: calcBucket(prevOrders, [prevFri]),
      };
    } else {
      const prevM = getPreviousMonth(month);
      const currOrders = orders.filter((o) => o.friday_date.startsWith(month));
      const prevOrders = orders.filter((o) => o.friday_date.startsWith(prevM));
      const currFris = Array.from(new Set(currOrders.map((o) => o.friday_date)));
      const prevFris = Array.from(new Set(prevOrders.map((o) => o.friday_date)));
      return {
        currLabel: month,
        prevLabel: prevM,
        curr: calcBucket(currOrders, currFris),
        prev: calcBucket(prevOrders, prevFris),
      };
    }
  }, [compareMode, fridayDate, month, orders, productMap, wasteByFriday]);

  // 3. גרף מגמות אינטראקטיבי (6 שבועות אחרונים, מותאם למובייל ללא גלילה אופקית)
  const trendPoints = useMemo(() => {
    const fridaysList: string[] = [];
    for (let i = 5; i >= 0; i--) {
      fridaysList.push(getPreviousDateISO(fridayDate, i * 7));
    }
    return fridaysList.map((f) => {
      const fOrders = orders.filter((o) => o.friday_date === f);
      const revenue = fOrders.reduce((s, o) => s + o.total_amount, 0);
      const units = fOrders.reduce((s, o) => s + o.items.reduce((is, it) => is + it.quantity, 0), 0);
      const customers = new Set(fOrders.map((o) => o.user_id || o.recipient_name)).size;
      const cogs = fOrders.reduce(
        (s, o) =>
          s +
          o.items.reduce((is, it) => {
            const p = productMap.get(it.product_id);
            return is + it.quantity * (it.cost_price_snapshot ?? p?.cost_price ?? 0);
          }, 0),
        0
      );
      const waste = wasteByFriday[f]?.total_waste_cost ?? 0;
      const profit = Math.max(0, Math.round((revenue - cogs - waste) * 100) / 100);
      return {
        label: f.slice(5).replace('-', '/'),
        revenue,
        profit,
        customers,
        units,
      };
    });
  }, [fridayDate, orders, productMap, wasteByFriday]);

  const maxTrendVal = useMemo(() => {
    return Math.max(1, ...trendPoints.map((pt) => pt[trendMetric]));
  }, [trendPoints, trendMetric]);

  return (
    <div className="space-y-6">
      {/* 1. השוואת תקופות */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#C85A17]" />
              <span>השוואת תקופות</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {comparison.currLabel} מול {comparison.prevLabel}
            </p>
          </div>
          <div className="inline-flex bg-[#FAF6F0] p-1 rounded-xl border border-[#E8D5BE]">
            <button
              type="button"
              onClick={() => setCompareMode('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                compareMode === 'week' ? 'bg-[#C85A17] text-white' : 'text-slate-600'
              }`}
            >
              שבוע מול שבוע
            </button>
            <button
              type="button"
              onClick={() => setCompareMode('month')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                compareMode === 'month' ? 'bg-[#C85A17] text-white' : 'text-slate-600'
              }`}
            >
              חודש מול חודש
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 tabular-nums">
          {(
            [
              ['הכנסות', comparison.curr.revenue, comparison.prev.revenue, true, false],
              ['רווח נקי', comparison.curr.netProfit, comparison.prev.netProfit, true, false],
              ['לקוחות', comparison.curr.customers, comparison.prev.customers, false, false],
              ['יחידות שנמכרו', comparison.curr.units, comparison.prev.units, false, false],
              ['עלות פחת', comparison.curr.wasteCost, comparison.prev.wasteCost, true, true],
            ] as const
          ).map(([label, currVal, prevVal, isCurrency, invertGood]) => {
            const delta = pctChange(currVal, prevVal);
            const isPositive = invertGood ? delta <= 0 : delta >= 0;
            return (
              <div key={label} className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]/80">
                <div className="text-[11px] font-bold text-slate-500">{label}</div>
                <div className="text-base sm:text-lg font-extrabold text-slate-900 mt-1">
                  {isCurrency ? formatILS(currVal) : currVal.toLocaleString('he-IL')}
                </div>
                <div
                  className={`inline-flex items-center gap-0.5 mt-1 px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                    isPositive ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {delta >= 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  <span>
                    {delta >= 0 ? '+' : ''}
                    {delta}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. גרף מגמות אינטראקטיבי מותאם למובייל (ללא גלילה אופקית) */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-[#C85A17]" />
            <span>גרף מגמות (6 שבועות אחרונים)</span>
          </h3>
          <div className="grid grid-cols-4 gap-1 bg-[#FAF6F0] p-1 rounded-xl border border-[#E8D5BE]">
            {(
              [
                ['revenue', 'הכנסות (₪)'],
                ['profit', 'רווחים (₪)'],
                ['customers', 'לקוחות'],
                ['units', 'כמויות'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTrendMetric(k)}
                className={`px-2 py-1.5 rounded-lg text-[11px] font-extrabold transition-colors ${
                  trendMetric === k ? 'bg-[#1E242B] text-white' : 'text-slate-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2 items-end h-44 pt-4 px-1">
          {trendPoints.map((pt) => {
            const val = pt[trendMetric];
            const heightPct = Math.max(6, Math.round((val / maxTrendVal) * 100));
            return (
              <div key={pt.label} className="flex flex-col items-center gap-1.5 h-full justify-end">
                <div className="text-[10px] font-extrabold text-slate-700 tabular-nums text-center">
                  {trendMetric === 'revenue' || trendMetric === 'profit'
                    ? `₪${Math.round(val)}`
                    : val}
                </div>
                <div className="w-full bg-[#FAF6F0] rounded-t-xl h-28 flex items-end overflow-hidden border border-[#E8D5BE]/60">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-lg transition-all duration-300 ${
                      trendMetric === 'profit'
                        ? 'bg-emerald-600'
                        : trendMetric === 'customers'
                        ? 'bg-sky-600'
                        : trendMetric === 'units'
                        ? 'bg-amber-500'
                        : 'bg-[#C85A17]'
                    }`}
                  />
                </div>
                <div className="text-[10px] font-bold text-slate-500 tabular-nums">{pt.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. דירוג ביצועי מוצרים */}
      <section className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Award className="w-5 h-5 text-[#C85A17]" />
            <span>דירוג ביצועי מוצרים</span>
          </h3>
          <div className="grid grid-cols-3 gap-1 bg-[#FAF6F0] p-1 rounded-xl border border-[#E8D5BE]">
            {(
              [
                ['bestseller', 'הכי נמכר'],
                ['profitable', 'הכי רווחי'],
                ['waste', 'יעילות ופחת'],
              ] as const
            ).map(([t, lbl]) => (
              <button
                key={t}
                type="button"
                onClick={() => setRankTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  rankTab === t ? 'bg-[#C85A17] text-white' : 'text-slate-600'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {productPerformance.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            אין נתוני מכירות או פחת לתקופה הנבחרת.
          </div>
        ) : (
          <div className="space-y-2">
            {productPerformance.slice(0, 10).map((row, idx) => {
              const isHighWaste = row.wastePct >= 15 || row.netProfit < 0;
              const isLowWaste = row.wasteUnits === 0 && row.unitsSold > 0;
              return (
                <div
                  key={row.productId}
                  className={`p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-2 tabular-nums ${
                    rankTab === 'waste' && isHighWaste
                      ? 'bg-red-50/70 border-red-300'
                      : rankTab === 'waste' && isLowWaste
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : 'bg-[#FAF6F0] border-[#E8D5BE]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center text-xs font-extrabold text-slate-700 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{row.name}</div>
                      <div className="text-[11px] text-slate-500">
                        נמכרו: <strong>{row.unitsSold}</strong> יח׳ · מחזור: <strong>{formatILS(row.revenue)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    {rankTab === 'bestseller' && (
                      <span className="px-2.5 py-1 rounded-xl bg-[#FFF7ED] border border-[#C85A17]/30 font-extrabold text-[#8A330B]">
                        {row.unitsSold} יח׳ · {formatILS(row.revenue)}
                      </span>
                    )}
                    {rankTab === 'profitable' && (
                      <span
                        className={`px-2.5 py-1 rounded-xl font-extrabold ${
                          row.netProfit >= 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        רווח נקי: {formatILS(row.netProfit)} ({formatPercent(row.marginPct)})
                      </span>
                    )}
                    {rankTab === 'waste' && (
                      <div className="flex items-center gap-2">
                        {isHighWaste && <AlertTriangle className="w-4 h-4 text-red-600" />}
                        <span
                          className={`px-2.5 py-1 rounded-xl font-extrabold ${
                            isHighWaste
                              ? 'bg-red-100 text-red-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          פחת: {row.wastePct}% ({formatILS(row.wasteCost)})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
