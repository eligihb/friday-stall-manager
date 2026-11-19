import React, { useEffect, useMemo, useState } from 'react';
import { Trash2, Plus, Minus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS, getNextFridayISO } from '../lib/format';
import { BottomSheet } from './BottomSheet';
import { FridaySelector } from './FridaySelector';
import type { WasteLogItem, WasteLogResponse } from '../types';

interface WasteTrackingSheetProps {
  open: boolean;
  initialFriday?: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function WasteTrackingSheet({
  open,
  initialFriday,
  onClose,
  onSaved,
}: WasteTrackingSheetProps) {
  const [fridayDate, setFridayDate] = useState(initialFriday || getNextFridayISO());
  const [items, setItems] = useState<WasteLogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (initialFriday) setFridayDate(initialFriday);
  }, [initialFriday]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSavedMsg('');
    apiFetch<WasteLogResponse>(`/api/finance/waste?friday_date=${fridayDate}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        const qMap: Record<number, number> = {};
        for (const it of res.items) {
          qMap[it.product_id] = it.quantity;
        }
        setQuantities(qMap);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני הפחת');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fridayDate]);

  const totals = useMemo(() => {
    let units = 0;
    let cost = 0;
    for (const it of items) {
      const q = quantities[it.product_id] || 0;
      units += q;
      cost += q * it.cost_price;
    }
    return { units, cost: Math.round(cost * 100) / 100 };
  }, [items, quantities]);

  const stepQty = (productId: number, delta: number) => {
    setQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(0, (prev[productId] || 0) + delta),
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/finance/waste', {
        method: 'PUT',
        body: JSON.stringify({
          friday_date: fridayDate,
          items: items.map((it) => ({
            product_id: it.product_id,
            quantity: Math.max(0, Math.floor(quantities[it.product_id] || 0)),
            notes: it.notes || '',
          })),
        }),
      });
      setSavedMsg('דוח הפחת נשמר ועודכן בדוח הרווח וההפסד!');
      onSaved?.();
      setTimeout(() => {
        setSavedMsg('');
        onClose();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת דוח הפחת');
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="ניהול פחת סוף יום שישי"
      subtitle="הזן יחידות שלא נמכרו ולא ניתן לשמור לשישי הבא — העלות מנוכה אוטומטית מהרווח"
      maxWidthClass="md:max-w-xl"
    >
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[#FAF6F0] p-3 rounded-2xl border border-[#E8D5BE]">
          <div className="text-xs font-bold text-slate-600">{formatFridayLabel(fridayDate)}</div>
          <FridaySelector value={fridayDate} onChange={setFridayDate} label="" />
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {savedMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedMsg}</span>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-slate-400 text-sm">טוען רשימת מוצרים...</div>
        ) : (
          <div className="max-h-72 overflow-y-auto border border-[#E8D5BE] rounded-2xl divide-y divide-[#F3E9DC]">
            {items.map((it) => {
              const q = quantities[it.product_id] || 0;
              const lineCost = q * it.cost_price;
              return (
                <div
                  key={it.product_id}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 ${
                    q > 0 ? 'bg-red-50/60' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-slate-900 truncate">{it.product_name}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      עלות ליח׳: {formatILS(it.cost_price)}
                      {q > 0 && (
                        <span className="text-red-700 font-bold mr-2">
                          · פחת: {formatILS(lineCost)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => stepQty(it.product_id, -1)}
                      disabled={q <= 0}
                      className="w-9 h-9 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center disabled:opacity-40"
                      aria-label="הפחת 1"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      dir="ltr"
                      value={q}
                      onChange={(e) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [it.product_id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        }))
                      }
                      className="w-14 h-9 text-center rounded-xl border border-[#E8D5BE] bg-white font-extrabold tabular-nums text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => stepQty(it.product_id, 1)}
                      className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center"
                      aria-label="הוסף 1"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="bg-red-50 rounded-2xl p-4 border border-red-200 flex items-center justify-between tabular-nums">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-extrabold text-red-900">סה״כ עלות פחת ליום שישי</div>
              <div className="text-[11px] text-red-700">{totals.units} יחידות פחת × מחיר עלות</div>
            </div>
          </div>
          <span className="font-extrabold text-xl text-red-800">{formatILS(totals.cost)}</span>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full min-h-[50px] rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-extrabold text-base shadow-sm"
        >
          {saving ? 'שומר דוח פחת...' : 'שמור דוח פחת ועדכן P&L'}
        </button>
      </form>
    </BottomSheet>
  );
}
