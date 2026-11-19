import React, { useEffect, useState, useMemo } from 'react';
import { ChefHat, Check, Save } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, getNextFridayISO } from '../lib/format';
import { FridaySelector } from '../components/FridaySelector';
import type { FridayInventoryItem } from '../types';

export function FridayInventory() {
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [items, setItems] = useState<FridayInventoryItem[]>([]);
  const [extras, setExtras] = useState<Record<number, number>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ items: FridayInventoryItem[] }>(
        `/api/inventory?friday_date=${fridayDate}`
      );
      setItems(res.items);
      const map: Record<number, number> = {};
      for (const it of res.items) {
        map[it.product_id] = it.extra_stall_qty;
      }
      setExtras(map);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [fridayDate]);

  const saveExtra = async (item: FridayInventoryItem) => {
    const qty = Math.max(0, Math.floor(Number(extras[item.product_id] ?? 0)));
    setSavingId(item.product_id);
    try {
      await apiFetch('/api/inventory', {
        method: 'PUT',
        body: JSON.stringify({
          friday_date: fridayDate,
          product_id: item.product_id,
          extra_stall_qty: qty,
        }),
      });
      setItems((prev) =>
        prev.map((row) =>
          row.product_id === item.product_id
            ? { ...row, extra_stall_qty: qty, total_to_bake: row.ordered_total + qty }
            : row
        )
      );
      setSavedId(item.product_id);
      setTimeout(() => setSavedId((cur) => (cur === item.product_id ? null : cur)), 1500);
    } finally {
      setSavingId(null);
    }
  };

  const totals = useMemo(() => {
    return items.reduce(
      (acc, it) => {
        const extra = extras[it.product_id] ?? it.extra_stall_qty;
        const bake = it.ordered_total + extra;
        acc.ordered += it.ordered_total;
        acc.extra += extra;
        acc.bake += bake;
        acc.estCost += bake * it.cost_price;
        acc.estExtraRevenue += extra * it.customer_price;
        return acc;
      },
      { ordered: 0, extra: 0, bake: 0, estCost: 0, estExtraRevenue: 0 }
    );
  }, [items, extras]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">היערכות ומלאי שישי</h2>
          <p className="text-sm text-slate-600 mt-1">
            ריכוז אוטומטי של כלל ההזמנות (ספקים, לקוחות, חסד) + הגדרת אקסטרה למכירה חופשית בדוכן.
          </p>
        </div>
        <FridaySelector value={fridayDate} onChange={setFridayDate} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 tabular-nums">
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-semibold text-slate-500">מוזמן מראש</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1.5">{totals.ordered}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-semibold text-slate-500">אקסטרה לדוכן</div>
          <div className="text-2xl font-extrabold text-[#C85A17] mt-1.5">{totals.extra}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-semibold text-slate-500">סה״כ לאפייה והכנה</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1.5">{totals.bake}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-semibold text-slate-500">עלות חומרי גלם משוערת</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1.5">{formatILS(totals.estCost)}</div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען גיליון אפייה...
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F3E9DC]/70 text-slate-700 border-b border-[#E8D5BE]">
                  <th className="text-right py-3.5 px-4 font-bold">מוצר</th>
                  <th className="text-center py-3.5 px-3 font-bold">ספקים</th>
                  <th className="text-center py-3.5 px-3 font-bold">לקוחות</th>
                  <th className="text-center py-3.5 px-3 font-bold">מסובסדות</th>
                  <th className="text-center py-3.5 px-3 font-bold">אקסטרה לדוכן</th>
                  <th className="text-center py-3.5 px-4 font-bold bg-[#FFF7ED]">סה״כ להכנה</th>
                  <th className="text-center py-3.5 px-3 font-bold">שמירה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9DC] tabular-nums">
                {items.map((it) => {
                  const curExtra = extras[it.product_id] ?? it.extra_stall_qty;
                  const dirty = curExtra !== it.extra_stall_qty;
                  const totalBake = it.ordered_total + curExtra;
                  return (
                    <tr key={it.product_id} className="hover:bg-[#FDFBF7]">
                      <td className="py-3 px-4 font-bold text-slate-900">{it.product_name}</td>
                      <td className="py-3 px-3 text-center text-slate-700 font-semibold">{it.supplier_qty}</td>
                      <td className="py-3 px-3 text-center text-slate-700 font-semibold">{it.customer_qty}</td>
                      <td className="py-3 px-3 text-center text-purple-700 font-semibold">{it.charity_qty}</td>
                      <td className="py-3 px-3 text-center">
                        <input
                          type="number"
                          min="0"
                          value={curExtra}
                          onChange={(e) =>
                            setExtras((prev) => ({
                              ...prev,
                              [it.product_id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && dirty) saveExtra(it);
                          }}
                          className="w-20 text-center py-1.5 rounded-lg border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] font-bold"
                        />
                      </td>
                      <td className="py-3 px-4 text-center bg-[#FFF7ED]/70 font-extrabold text-base text-[#8A330B]">
                        <span className="inline-flex items-center gap-1.5">
                          <ChefHat className="w-4 h-4 text-[#C85A17]" />
                          {totalBake}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {dirty ? (
                          <button
                            type="button"
                            disabled={savingId === it.product_id}
                            onClick={() => saveExtra(it)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#C85A17] text-white text-xs font-bold"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>שמור</span>
                          </button>
                        ) : savedId === it.product_id ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                            <Check className="w-4 h-4" />
                            נשמר
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
