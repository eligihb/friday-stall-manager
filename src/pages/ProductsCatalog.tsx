import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Check,
  Save,
  TrendingUp,
  Package,
  AlertCircle,
  X,
  RotateCcw,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, formatPercent } from '../lib/format';
import { BottomSheet } from '../components/BottomSheet';
import type { AdminProduct } from '../types';

interface DraftPrices {
  name: string;
  cost_price: string;
  supplier_price: string;
  preorder_price: string;
  customer_price: string;
}

export function ProductsCatalog() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftPrices>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  // טופס הוספת מוצר חדש
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProd, setNewProd] = useState({
    name: '',
    cost_price: '',
    supplier_price: '',
    preorder_price: '',
    customer_price: '',
  });
  const [creating, setCreating] = useState(false);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await apiFetch<{ products: AdminProduct[] }>('/api/products');
      setProducts(data.products);
      const map: Record<number, DraftPrices> = {};
      for (const p of data.products) {
        map[p.id] = {
          name: p.name,
          cost_price: p.cost_price.toFixed(2),
          supplier_price: p.supplier_price.toFixed(2),
          preorder_price: p.preorder_price.toFixed(2),
          customer_price: p.customer_price.toFixed(2),
        };
      }
      setDrafts(map);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת המחירון');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const isRowDirty = (p: AdminProduct): boolean => {
    const d = drafts[p.id];
    if (!d) return false;
    return (
      d.name.trim() !== p.name ||
      Number(d.cost_price) !== p.cost_price ||
      Number(d.supplier_price) !== p.supplier_price ||
      Number(d.preorder_price) !== p.preorder_price ||
      Number(d.customer_price) !== p.customer_price
    );
  };

  const updateDraft = (id: number, field: keyof DraftPrices, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const resetRow = (p: AdminProduct) => {
    setDrafts((prev) => ({
      ...prev,
      [p.id]: {
        name: p.name,
        cost_price: p.cost_price.toFixed(2),
        supplier_price: p.supplier_price.toFixed(2),
        preorder_price: p.preorder_price.toFixed(2),
        customer_price: p.customer_price.toFixed(2),
      },
    }));
  };

  const saveRow = async (p: AdminProduct) => {
    const d = drafts[p.id];
    if (!d) return;
    setSavingId(p.id);
    setError('');
    try {
      const res = await apiFetch<{ product: AdminProduct }>(`/api/products/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: d.name.trim(),
          cost_price: Number(d.cost_price),
          supplier_price: Number(d.supplier_price),
          preorder_price: Number(d.preorder_price),
          customer_price: Number(d.customer_price),
          is_active: p.is_active,
        }),
      });
      setProducts((prev) => prev.map((item) => (item.id === p.id ? res.product : item)));
      setDrafts((prev) => ({
        ...prev,
        [p.id]: {
          name: res.product.name,
          cost_price: res.product.cost_price.toFixed(2),
          supplier_price: res.product.supplier_price.toFixed(2),
          preorder_price: res.product.preorder_price.toFixed(2),
          customer_price: res.product.customer_price.toFixed(2),
        },
      }));
      setSavedId(p.id);
      setTimeout(() => setSavedId((cur) => (cur === p.id ? null : cur)), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת המוצר');
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (p: AdminProduct) => {
    try {
      const res = await apiFetch<{ product: AdminProduct }>(`/api/products/${p.id}/toggle`, {
        method: 'PATCH',
      });
      setProducts((prev) => prev.map((item) => (item.id === p.id ? res.product : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון סטטוס');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      const res = await apiFetch<{ product: AdminProduct }>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          name: newProd.name.trim(),
          cost_price: Number(newProd.cost_price),
          supplier_price: Number(newProd.supplier_price),
          preorder_price: Number(newProd.preorder_price),
          customer_price: Number(newProd.customer_price),
          is_active: true,
        }),
      });
      setProducts((prev) => [...prev, res.product]);
      setDrafts((prev) => ({
        ...prev,
        [res.product.id]: {
          name: res.product.name,
          cost_price: res.product.cost_price.toFixed(2),
          supplier_price: res.product.supplier_price.toFixed(2),
          preorder_price: res.product.preorder_price.toFixed(2),
          customer_price: res.product.customer_price.toFixed(2),
        },
      }));
      setNewProd({ name: '', cost_price: '', supplier_price: '', preorder_price: '', customer_price: '' });
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהוספת המוצר');
    } finally {
      setCreating(false);
    }
  };

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (showOnlyActive && !p.is_active) return false;
      if (search.trim() && !p.name.includes(search.trim())) return false;
      return true;
    });
  }, [products, search, showOnlyActive]);

  const stats = useMemo(() => {
    const active = products.filter((p) => p.is_active);
    const avgSupPct = active.length
      ? active.reduce((acc, p) => acc + (p.supplier_price > 0 ? ((p.supplier_price - p.cost_price) / p.supplier_price) * 100 : 0), 0) / active.length
      : 0;
    const avgCustPct = active.length
      ? active.reduce((acc, p) => acc + (p.customer_price > 0 ? ((p.customer_price - p.cost_price) / p.customer_price) * 100 : 0), 0) / active.length
      : 0;
    return {
      total: products.length,
      activeCount: active.length,
      avgSupPct,
      avgCustPct,
    };
  }, [products]);

  const calcMargins = (costStr: string, supStr: string, custStr: string) => {
    const cost = Number(costStr) || 0;
    const sup = Number(supStr) || 0;
    const cust = Number(custStr) || 0;
    const supProfit = sup - cost;
    const supPct = sup > 0 ? (supProfit / sup) * 100 : 0;
    const custProfit = cust - cost;
    const custPct = cust > 0 ? (custProfit / cust) * 100 : 0;
    return { supProfit, supPct, custProfit, custPct };
  };

  return (
    <div className="space-y-6">
      {/* כותרת ופעולה ראשית */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">מחירון מוצרים</h2>
          <p className="text-sm text-slate-600 mt-1">
            עריכה ישירה של 4 מדרגות מחיר, מעקב רווחיות בזמן אמת והפעלה/השבתה של מוצרים בקטלוג.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>הוספת מוצר חדש</span>
        </button>
      </div>

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/70 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>סה״כ מוצרים במחירון</span>
            <Package className="w-4 h-4 text-[#C85A17]" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 tabular-nums">{stats.total}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/70 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>מוצרים פעילים</span>
            <Check className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-2 tabular-nums">{stats.activeCount}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/70 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>רווח ממוצע לספק</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-2 tabular-nums">
            {formatPercent(stats.avgSupPct)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/70 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
            <span>רווח ממוצע ללקוח</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-2 tabular-nums">
            {formatPercent(stats.avgCustPct)}
          </div>
        </div>
      </div>

      {/* חיפוש וסינון */}
      <div className="bg-white rounded-2xl p-3.5 border border-[#E8D5BE]/70 shadow-soft flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש מוצר לפי שם..."
            className="w-full pr-10 pl-4 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C85A17]/25"
          />
        </div>
        <label className="inline-flex items-center gap-2.5 text-sm font-semibold text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showOnlyActive}
            onChange={(e) => setShowOnlyActive(e.target.checked)}
            className="w-4 h-4 rounded accent-[#C85A17]"
          />
          <span>הצג מוצרים פעילים בלבד</span>
        </label>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center text-slate-500 border border-[#E8D5BE]/70">
          טוען מחירון מוצרים...
        </div>
      ) : (
        <>
          {/* תצוגת טבלה לדסקטופ */}
          <div className="hidden lg:block bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F3E9DC]/70 text-slate-700 border-b border-[#E8D5BE]">
                    <th className="text-right py-3.5 px-4 font-bold">שם המוצר</th>
                    <th className="text-right py-3.5 px-2.5 font-bold">עלות (₪)</th>
                    <th className="text-right py-3.5 px-2.5 font-bold">ספק (₪)</th>
                    <th className="text-right py-3.5 px-2.5 font-bold">הזמנה מוקדמת (₪)</th>
                    <th className="text-right py-3.5 px-2.5 font-bold">דוכן / לקוח (₪)</th>
                    <th className="text-right py-3.5 px-3 font-bold">ריווח ממכירה לספק</th>
                    <th className="text-right py-3.5 px-3 font-bold">ריווח ממכירה ללקוח</th>
                    <th className="text-center py-3.5 px-3 font-bold">פעיל</th>
                    <th className="text-center py-3.5 px-3 font-bold">שמירה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3E9DC]">
                  {filtered.map((p) => {
                    const d = drafts[p.id];
                    if (!d) return null;
                    const dirty = isRowDirty(p);
                    const { supProfit, supPct, custProfit, custPct } = calcMargins(
                      d.cost_price,
                      d.supplier_price,
                      d.customer_price
                    );

                    return (
                      <tr
                        key={p.id}
                        className={`transition-colors ${
                          !p.is_active
                            ? 'bg-slate-50/70 opacity-65'
                            : dirty
                            ? 'bg-[#FFF7ED]/70'
                            : 'hover:bg-[#FDFBF7]'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-bold text-slate-900 min-w-[160px]">
                          <input
                            type="text"
                            value={d.name}
                            onChange={(e) => updateDraft(p.id, 'name', e.target.value)}
                            className="w-full bg-transparent border border-transparent hover:border-[#E8D5BE] focus:border-[#C85A17] focus:bg-white rounded-lg px-2 py-1 font-bold text-slate-900 focus:outline-none"
                          />
                        </td>
                        {(['cost_price', 'supplier_price', 'preorder_price', 'customer_price'] as const).map(
                          (field) => (
                            <td key={field} className="py-2.5 px-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={d[field]}
                                onChange={(e) => updateDraft(p.id, field, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && dirty) saveRow(p);
                                }}
                                className="w-24 px-2.5 py-1.5 rounded-lg border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:ring-2 focus:ring-[#C85A17]/20 focus:outline-none text-left tabular-nums font-semibold"
                                dir="ltr"
                              />
                            </td>
                          )
                        )}
                        <td className="py-2.5 px-3 tabular-nums">
                          <div
                            className={`font-bold ${
                              supProfit < 0 ? 'text-red-600' : 'text-amber-700'
                            }`}
                          >
                            {formatILS(supProfit)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-semibold">
                            {formatPercent(supPct)} מרווח
                          </div>
                        </td>
                        <td className="py-2.5 px-3 tabular-nums">
                          <div
                            className={`font-bold ${
                              custProfit < 0 ? 'text-red-600' : 'text-emerald-700'
                            }`}
                          >
                            {formatILS(custProfit)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-semibold">
                            {formatPercent(custPct)} מרווח
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleActive(p)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              p.is_active ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                            title={p.is_active ? 'השבת מוצר' : 'הפעל מוצר'}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                p.is_active ? '-translate-x-6' : '-translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {dirty ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                disabled={savingId === p.id}
                                onClick={() => saveRow(p)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-bold shadow-sm"
                              >
                                <Save className="w-3.5 h-3.5" />
                                <span>{savingId === p.id ? '...' : 'שמור'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => resetRow(p)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                                title="בטל שינויים"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : savedId === p.id ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                              <Check className="w-4 h-4" />
                              נשמר
                            </span>
                          ) : (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* תצוגת כרטיסים מובייל וטאבלט */}
          <div className="lg:hidden space-y-3">
            {filtered.map((p) => {
              const d = drafts[p.id];
              if (!d) return null;
              const dirty = isRowDirty(p);
              const { supProfit, supPct, custProfit, custPct } = calcMargins(
                d.cost_price,
                d.supplier_price,
                d.customer_price
              );

              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl p-4 border shadow-soft ${
                    !p.is_active
                      ? 'border-slate-200 opacity-70'
                      : dirty
                      ? 'border-[#C85A17]'
                      : 'border-[#E8D5BE]/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => updateDraft(p.id, 'name', e.target.value)}
                      className="font-bold text-base text-slate-900 bg-transparent border-b border-transparent focus:border-[#C85A17] focus:outline-none flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => toggleActive(p)}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        p.is_active
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {p.is_active ? 'פעיל' : 'מושבת'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    {(
                      [
                        ['cost_price', 'מחיר עלות'],
                        ['supplier_price', 'מחיר ספק'],
                        ['preorder_price', 'הזמנה מוקדמת'],
                        ['customer_price', 'מחיר לקוח (דוכן)'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field}>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                          {label} (₪)
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          dir="ltr"
                          value={d[field]}
                          onChange={(e) => updateDraft(p.id, field, e.target.value)}
                          className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums font-bold text-sm focus:bg-white focus:border-[#C85A17] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 pt-3 border-t border-[#F3E9DC] grid grid-cols-2 gap-2 text-xs tabular-nums">
                    <div className="bg-amber-50/70 rounded-xl p-2.5">
                      <div className="text-slate-600 font-medium">ריווח ממכירה לספק</div>
                      <div className="font-extrabold text-amber-800 text-sm mt-0.5">
                        {formatILS(supProfit)} ({formatPercent(supPct)})
                      </div>
                    </div>
                    <div className="bg-emerald-50/70 rounded-xl p-2.5">
                      <div className="text-slate-600 font-medium">ריווח ממכירה ללקוח</div>
                      <div className="font-extrabold text-emerald-800 text-sm mt-0.5">
                        {formatILS(custProfit)} ({formatPercent(custPct)})
                      </div>
                    </div>
                  </div>

                  {dirty && (
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        disabled={savingId === p.id}
                        onClick={() => saveRow(p)}
                        className="flex-1 py-2 rounded-xl bg-[#C85A17] text-white font-bold text-sm flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-4 h-4" />
                        <span>{savingId === p.id ? 'שומר...' : 'שמור מחירים'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => resetRow(p)}
                        className="px-3 py-2 rounded-xl border border-[#E8D5BE] text-slate-600 text-sm font-semibold"
                      >
                        בטל
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* חלונית Bottom Sheet להוספת מוצר חדש */}
      <BottomSheet
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="הוספת מוצר חדש למחירון"
        subtitle="הזן 4 מדרגות מחיר — הרווחיות מחושבת אוטומטית"
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">שם המוצר</label>
            <input
              type="text"
              required
              value={newProd.name}
              onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
              placeholder="לדוגמה: מלאווח ביתי"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">עלות ייצור (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                dir="ltr"
                value={newProd.cost_price}
                onChange={(e) => setNewProd({ ...newProd, cost_price: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">מחיר ספק (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                dir="ltr"
                value={newProd.supplier_price}
                onChange={(e) => setNewProd({ ...newProd, supplier_price: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">הזמנה מוקדמת (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                dir="ltr"
                value={newProd.preorder_price}
                onChange={(e) => setNewProd({ ...newProd, preorder_price: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">מחיר דוכן / לקוח (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                dir="ltr"
                value={newProd.customer_price}
                onChange={(e) => setNewProd({ ...newProd, customer_price: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-semibold"
              />
            </div>
          </div>

          {(newProd.cost_price || newProd.supplier_price || newProd.customer_price) && (
            <div className="bg-[#FAF6F0] rounded-2xl p-3.5 border border-[#E8D5BE] grid grid-cols-2 gap-3 text-xs tabular-nums">
              {(() => {
                const m = calcMargins(newProd.cost_price, newProd.supplier_price, newProd.customer_price);
                return (
                  <>
                    <div>
                      <div className="text-slate-500">ריווח ממכירה לספק</div>
                      <div className="font-bold text-amber-800 text-sm mt-0.5">
                        {formatILS(m.supProfit)} ({formatPercent(m.supPct)})
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">ריווח ממכירה ללקוח</div>
                      <div className="font-bold text-emerald-800 text-sm mt-0.5">
                        {formatILS(m.custProfit)} ({formatPercent(m.custPct)})
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          <button
            type="submit"
            disabled={creating}
            className="w-full min-h-[50px] rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-base"
          >
            {creating ? 'מוסיף...' : 'הוסף למחירון'}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
