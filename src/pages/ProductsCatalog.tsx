import React, { useEffect, useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Check,
  Save,
  TrendingUp,
  Package,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  History,
  Image as ImageIcon,
  Calendar,
  Copy,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatHebrewDate, formatILS, formatPercent } from '../lib/format';
import { BottomSheet } from '../components/BottomSheet';
import type { AdminProduct, ProductPriceHistoryEntry } from '../types';

interface DraftPrices {
  name: string;
  cost_price: string;
  supplier_price: string;
  preorder_price: string;
  customer_price: string;
  image_url: string;
}

function getPriceWarnings(
  draft: { cost_price: string; supplier_price: string; preorder_price: string; customer_price: string },
  original?: AdminProduct
): string[] {
  const warnings: string[] = [];
  const cost = Number(draft.cost_price) || 0;
  const sup = Number(draft.supplier_price) || 0;
  const pre = Number(draft.preorder_price) || 0;
  const cust = Number(draft.customer_price) || 0;

  if (sup < cost) warnings.push(`מחיר ספק (${formatILS(sup)}) נמוך ממחיר העלות (${formatILS(cost)})!`);
  if (pre < cost) warnings.push(`מחיר הזמנה מוקדמת (${formatILS(pre)}) נמוך ממחיר העלות (${formatILS(cost)})!`);
  if (cust < cost) warnings.push(`מחיר לקוח/דוכן (${formatILS(cust)}) נמוך ממחיר העלות (${formatILS(cost)})!`);

  if (original) {
    const checks: Array<[string, number, number]> = [
      ['עלות', original.cost_price, cost],
      ['מחיר ספק', original.supplier_price, sup],
      ['הזמנה מוקדמת', original.preorder_price, pre],
      ['מחיר לקוח', original.customer_price, cust],
    ];
    for (const [label, prevVal, nextVal] of checks) {
      if (prevVal > 0 && Math.abs(nextVal - prevVal) / prevVal > 0.3) {
        const pct = Math.round((Math.abs(nextVal - prevVal) / prevVal) * 100);
        warnings.push(`שינוי חריג של ${pct}% ב${label} (מ-${formatILS(prevVal)} ל-${formatILS(nextVal)})`);
      }
    }
  }
  return warnings;
}

export function ProductsCatalog() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [drafts, setDrafts] = useState<Record<number, DraftPrices>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [showOnlyActive, setShowOnlyActive] = useState(false);

  // חלונית תאריך תחולה ואישור אזהרות בעת שמירת מחירים
  const [pendingSaveProduct, setPendingSaveProduct] = useState<AdminProduct | null>(null);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  // חלונית היסטוריית מחירים
  const [historyProduct, setHistoryProduct] = useState<AdminProduct | null>(null);
  const [historyRows, setHistoryRows] = useState<ProductPriceHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // טופס הוספת מוצר חדש
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProd, setNewProd] = useState({
    name: '',
    cost_price: '',
    supplier_price: '',
    preorder_price: '',
    customer_price: '',
    image_url: '',
    effective_date: new Date().toISOString().slice(0, 10),
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
          image_url: p.image_url || '',
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
      Number(d.customer_price) !== p.customer_price ||
      (d.image_url.trim() || '') !== (p.image_url || '')
    );
  };

  const didPricesChange = (p: AdminProduct): boolean => {
    const d = drafts[p.id];
    if (!d) return false;
    return (
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
        image_url: p.image_url || '',
      },
    }));
  };

  const initiateSaveRow = (p: AdminProduct) => {
    if (didPricesChange(p)) {
      setEffectiveDate(new Date().toISOString().slice(0, 10));
      setPendingSaveProduct(p);
    } else {
      commitSaveRow(p, new Date().toISOString().slice(0, 10));
    }
  };

  const commitSaveRow = async (p: AdminProduct, effDate: string) => {
    const d = drafts[p.id];
    if (!d) return;
    setSavingId(p.id);
    setError('');
    try {
      const res = await apiFetch<{ product: AdminProduct; scheduled?: boolean; effective_date?: string }>(
        `/api/products/${p.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: d.name.trim(),
            cost_price: Number(d.cost_price),
            supplier_price: Number(d.supplier_price),
            preorder_price: Number(d.preorder_price),
            customer_price: Number(d.customer_price),
            image_url: d.image_url.trim() || null,
            is_active: p.is_active,
            effective_date: effDate,
          }),
        }
      );
      setProducts((prev) => prev.map((item) => (item.id === p.id ? res.product : item)));
      setDrafts((prev) => ({
        ...prev,
        [p.id]: {
          name: res.product.name,
          cost_price: res.product.cost_price.toFixed(2),
          supplier_price: res.product.supplier_price.toFixed(2),
          preorder_price: res.product.preorder_price.toFixed(2),
          customer_price: res.product.customer_price.toFixed(2),
          image_url: res.product.image_url || '',
        },
      }));
      setPendingSaveProduct(null);
      setSavedId(p.id);
      if (res.scheduled) {
        setToast(`המחיר החדש ל״${p.name}״ תוזמן להיסטוריית המחירים החל מתאריך ${formatHebrewDate(effDate)}.`);
        setTimeout(() => setToast(''), 4000);
      }
      setTimeout(() => setSavedId((cur) => (cur === p.id ? null : cur)), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת המוצר');
    } finally {
      setSavingId(null);
    }
  };

  const openHistory = async (p: AdminProduct) => {
    setHistoryProduct(p);
    setLoadingHistory(true);
    try {
      const res = await apiFetch<{ history: ProductPriceHistoryEntry[] }>(`/api/products/${p.id}/history`);
      setHistoryRows(res.history);
    } finally {
      setLoadingHistory(false);
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

  const handleDuplicate = (p: AdminProduct) => {
    const d = drafts[p.id];
    setNewProd({
      name: `${(d?.name || p.name).trim()} (עותק)`,
      cost_price: d ? d.cost_price : p.cost_price.toFixed(2),
      supplier_price: d ? d.supplier_price : p.supplier_price.toFixed(2),
      preorder_price: d ? d.preorder_price : p.preorder_price.toFixed(2),
      customer_price: d ? d.customer_price : p.customer_price.toFixed(2),
      image_url: d ? d.image_url : p.image_url || '',
      effective_date: new Date().toISOString().slice(0, 10),
    });
    setError('');
    setShowAddModal(true);
  };

  const handleDeleteProduct = async (p: AdminProduct) => {
    if (!window.confirm(`למחוק את המוצר "${p.name}" מהמחירון?`)) return;
    setError('');
    try {
      await apiFetch(`/api/products/${p.id}`, { method: 'DELETE' });
      setProducts((prev) => prev.filter((item) => item.id !== p.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setToast(`המוצר "${p.name}" נמחק מהמחירון.`);
      setTimeout(() => setToast(''), 2600);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'שגיאה במחיקת המוצר';
      if (msg.includes('היסטוריות') && p.is_active) {
        if (window.confirm(`${msg}\n\nהאם להשבית את "${p.name}" כעת?`)) {
          await toggleActive(p);
        }
      } else {
        setError(msg);
      }
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
          image_url: newProd.image_url.trim() || null,
          effective_date: newProd.effective_date,
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
          image_url: res.product.image_url || '',
        },
      }));
      setNewProd({
        name: '',
        cost_price: '',
        supplier_price: '',
        preorder_price: '',
        customer_price: '',
        image_url: '',
        effective_date: new Date().toISOString().slice(0, 10),
      });
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
      ? active.reduce(
          (acc, p) =>
            acc + (p.supplier_price > 0 ? ((p.supplier_price - p.cost_price) / p.supplier_price) * 100 : 0),
          0
        ) / active.length
      : 0;
    const avgCustPct = active.length
      ? active.reduce(
          (acc, p) =>
            acc + (p.customer_price > 0 ? ((p.customer_price - p.cost_price) / p.customer_price) * 100 : 0),
          0
        ) / active.length
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

  const newProdWarnings = useMemo(() => {
    if (!newProd.cost_price && !newProd.supplier_price && !newProd.customer_price) return [];
    return getPriceWarnings(newProd);
  }, [newProd]);

  const pendingSaveWarnings = useMemo(() => {
    if (!pendingSaveProduct) return [];
    const d = drafts[pendingSaveProduct.id];
    if (!d) return [];
    return getPriceWarnings(d, pendingSaveProduct);
  }, [pendingSaveProduct, drafts]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">מחירון מוצרים חכם והיסטוריית מחירים</h2>
          <p className="text-sm text-slate-600 mt-1">
            עריכת 4 מדרגות מחיר, תמונות מוצר, התראות חריגה (מתחת לעלות או שינוי מעל 30%), ותאריך תחולה לשימור הזמנות עבר.
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
            <span>סה״כ מוצרים ומארזים</span>
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

      {toast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
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
                    <th className="text-right py-3.5 px-4 font-bold">שם המוצר ותמונה</th>
                    <th className="text-right py-3.5 px-2 font-bold">עלות (₪)</th>
                    <th className="text-right py-3.5 px-2 font-bold">ספק (₪)</th>
                    <th className="text-right py-3.5 px-2 font-bold">מוקדמת (₪)</th>
                    <th className="text-right py-3.5 px-2 font-bold">דוכן (₪)</th>
                    <th className="text-right py-3.5 px-2.5 font-bold">ריווח ספק</th>
                    <th className="text-right py-3.5 px-2.5 font-bold">ריווח לקוח</th>
                    <th className="text-center py-3.5 px-2 font-bold">פעיל</th>
                    <th className="text-center py-3.5 px-3 font-bold">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3E9DC]">
                  {filtered.map((p) => {
                    const d = drafts[p.id];
                    if (!d) return null;
                    const dirty = isRowDirty(p);
                    const rowWarnings = dirty ? getPriceWarnings(d, p) : [];
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
                            : rowWarnings.length > 0
                            ? 'bg-red-50/50'
                            : dirty
                            ? 'bg-[#FFF7ED]/70'
                            : 'hover:bg-[#FDFBF7]'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-bold text-slate-900 min-w-[200px]">
                          <div className="flex items-center gap-2">
                            {d.image_url ? (
                              <img
                                src={d.image_url}
                                alt={d.name}
                                className="w-8 h-8 rounded-lg object-cover border border-[#E8D5BE] shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center text-slate-400 shrink-0">
                                <ImageIcon className="w-4 h-4" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <input
                                type="text"
                                value={d.name}
                                onChange={(e) => updateDraft(p.id, 'name', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-[#E8D5BE] focus:border-[#C85A17] focus:bg-white rounded-lg px-2 py-0.5 font-bold text-slate-900 focus:outline-none"
                              />
                              <input
                                type="url"
                                dir="ltr"
                                value={d.image_url}
                                onChange={(e) => updateDraft(p.id, 'image_url', e.target.value)}
                                placeholder="קישור לתמונה (image_url)"
                                className="w-full text-[11px] text-slate-400 bg-transparent px-2 py-0.5 focus:bg-white focus:text-slate-700 rounded focus:outline-none text-left"
                              />
                            </div>
                          </div>
                          {rowWarnings.length > 0 && (
                            <div className="mt-1.5 text-[11px] text-red-700 font-bold flex items-start gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              <span>{rowWarnings[0]}</span>
                            </div>
                          )}
                        </td>
                        {(['cost_price', 'supplier_price', 'preorder_price', 'customer_price'] as const).map(
                          (field) => (
                            <td key={field} className="py-2.5 px-1.5">
                              <input
                                type="number"
                                inputMode="decimal"
                                step="0.01"
                                min="0"
                                value={d[field]}
                                onChange={(e) => updateDraft(p.id, field, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && dirty) initiateSaveRow(p);
                                }}
                                className="w-20 px-2 py-1.5 rounded-lg border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-semibold"
                                dir="ltr"
                              />
                            </td>
                          )
                        )}
                        <td className="py-2.5 px-2.5 tabular-nums">
                          <div className={`font-bold ${supProfit < 0 ? 'text-red-600' : 'text-amber-700'}`}>
                            {formatILS(supProfit)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-semibold">
                            {formatPercent(supPct)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 tabular-nums">
                          <div className={`font-bold ${custProfit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                            {formatILS(custProfit)}
                          </div>
                          <div className="text-[11px] text-slate-500 font-semibold">
                            {formatPercent(custPct)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => toggleActive(p)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              p.is_active ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                p.is_active ? '-translate-x-6' : '-translate-x-1'
                              }`}
                            />
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {dirty ? (
                              <>
                                <button
                                  type="button"
                                  disabled={savingId === p.id}
                                  onClick={() => initiateSaveRow(p)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-bold shadow-sm"
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
                              </>
                            ) : savedId === p.id ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-bold">
                                <Check className="w-4 h-4" />
                                נשמר
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openHistory(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#C85A17] hover:bg-[#FFF7ED]"
                              title="היסטוריית מחירים"
                            >
                              <History className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDuplicate(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-sky-700 hover:bg-sky-50"
                              title="שכפל מוצר"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteProduct(p)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                              title="מחק מוצר"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* תצוגת כרטיסים מובייל */}
          <div className="lg:hidden space-y-3">
            {filtered.map((p) => {
              const d = drafts[p.id];
              if (!d) return null;
              const dirty = isRowDirty(p);
              const rowWarnings = dirty ? getPriceWarnings(d, p) : [];
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
                      : rowWarnings.length > 0
                      ? 'border-red-300 bg-red-50/30'
                      : dirty
                      ? 'border-[#C85A17]'
                      : 'border-[#E8D5BE]/80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <input
                      type="text"
                      value={d.name}
                      onChange={(e) => updateDraft(p.id, 'name', e.target.value)}
                      className="font-bold text-base text-slate-900 bg-transparent border-b border-transparent focus:border-[#C85A17] focus:outline-none flex-1 min-w-[140px]"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openHistory(p)}
                        className="min-w-[48px] min-h-[48px] rounded-xl bg-[#FAF6F0] text-slate-600 flex items-center justify-center"
                        title="היסטוריית מחירים"
                      >
                        <History className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(p)}
                        className="min-w-[48px] min-h-[48px] rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center"
                        title="שכפל מוצר"
                      >
                        <Copy className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProduct(p)}
                        className="min-w-[48px] min-h-[48px] rounded-xl bg-red-50 text-red-600 flex items-center justify-center"
                        title="מחק מוצר"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(p)}
                        className={`min-h-[48px] px-3 rounded-xl text-xs font-bold ${
                          p.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {p.is_active ? 'פעיל' : 'מושבת'}
                      </button>
                    </div>
                  </div>

                  {rowWarnings.length > 0 && (
                    <div className="mb-3 p-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold space-y-1">
                      {rowWarnings.map((w, idx) => (
                        <div key={idx} className="flex items-start gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}

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

                  <div className="mt-2.5">
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      קישור לתמונת מוצר (אופציונלי)
                    </label>
                    <input
                      type="url"
                      dir="ltr"
                      value={d.image_url}
                      onChange={(e) => updateDraft(p.id, 'image_url', e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left text-xs"
                    />
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
                        onClick={() => initiateSaveRow(p)}
                        className="flex-1 min-h-[48px] rounded-xl bg-[#C85A17] text-white font-bold text-sm flex items-center justify-center gap-1.5"
                      >
                        <Save className="w-4 h-4" />
                        <span>{savingId === p.id ? 'שומר...' : 'שמור מחירים'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => resetRow(p)}
                        className="px-4 min-h-[48px] rounded-xl border border-[#E8D5BE] text-slate-600 text-sm font-semibold"
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

      {/* חלונית אישור תאריך תחולה ואזהרות מחיר */}
      <BottomSheet
        open={Boolean(pendingSaveProduct)}
        onClose={() => setPendingSaveProduct(null)}
        title={pendingSaveProduct ? `עדכון מחיר — ${pendingSaveProduct.name}` : ''}
        subtitle="הזמנות קודמות יישמרו לפי המחיר שהיה בתוקף בתאריך ההזמנה"
        maxWidthClass="md:max-w-md"
      >
        {pendingSaveProduct && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitSaveRow(pendingSaveProduct, effectiveDate);
            }}
            className="space-y-4"
          >
            {pendingSaveWarnings.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-red-50 border-2 border-red-200 text-red-800 text-xs font-bold space-y-1.5">
                <div className="flex items-center gap-1.5 text-sm">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>שימו לב — אזהרות תמחור:</span>
                </div>
                {pendingSaveWarnings.map((w, i) => (
                  <div key={i}>• {w}</div>
                ))}
              </div>
            )}

            <div>
              <label className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-1.5">
                <Calendar className="w-4 h-4 text-[#C85A17]" />
                <span>תאריך תחולה למחיר החדש</span>
              </label>
              <input
                type="date"
                required
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] font-bold"
              />
              <p className="text-xs text-slate-500 mt-1">
                ברירת מחדל: היום. הזמנות מתאריכים קודמים יחושבו לפי המחיר ההיסטורי.
              </p>
            </div>

            <button
              type="submit"
              disabled={savingId === pendingSaveProduct.id}
              className="w-full min-h-[50px] rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-base"
            >
              {savingId === pendingSaveProduct.id ? 'שומר...' : 'אשר ושמור מחיר'}
            </button>
          </form>
        )}
      </BottomSheet>

      {/* חלונית היסטוריית מחירים למוצר */}
      <BottomSheet
        open={Boolean(historyProduct)}
        onClose={() => setHistoryProduct(null)}
        title={historyProduct ? `היסטוריית מחירים — ${historyProduct.name}` : ''}
        subtitle="מעקב שינויי מחיר לפי תאריך תחולה"
        maxWidthClass="md:max-w-lg"
      >
        {loadingHistory ? (
          <div className="py-8 text-center text-slate-400 text-sm">טוען היסטוריה...</div>
        ) : historyRows.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">אין היסטוריית מחירים.</div>
        ) : (
          <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-2xl overflow-hidden text-xs tabular-nums">
            {historyRows.map((h) => (
              <div key={h.id} className="p-3.5 bg-white space-y-2">
                <div className="font-extrabold text-sm text-slate-900">
                  בתוקף מ-{formatHebrewDate(h.effective_date)}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-700">
                  <div className="bg-[#FAF6F0] rounded-xl px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">עלות</div>
                    <div className="font-bold">{formatILS(h.cost_price)}</div>
                  </div>
                  <div className="bg-[#FAF6F0] rounded-xl px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">ספק</div>
                    <div className="font-bold">{formatILS(h.supplier_price)}</div>
                  </div>
                  <div className="bg-[#FAF6F0] rounded-xl px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">מוקדמת</div>
                    <div className="font-bold">{formatILS(h.preorder_price)}</div>
                  </div>
                  <div className="bg-[#FAF6F0] rounded-xl px-2.5 py-2">
                    <div className="text-[10px] text-slate-500">דוכן</div>
                    <div className="font-bold">{formatILS(h.customer_price)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* חלונית הוספת מוצר חדש */}
      <BottomSheet
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="הוספת מוצר חדש למחירון"
        subtitle="הזן 4 מדרגות מחיר, תאריך תחולה וקישור לתמונה (אופציונלי)"
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          {newProdWarnings.length > 0 && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold space-y-1">
              {newProdWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">שם המוצר</label>
            <input
              type="text"
              required
              value={newProd.name}
              onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
              placeholder="לדוגמה: מארז פיתה שומשום"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">עלות ייצור/רכש (₪)</label>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך תחולה</label>
              <input
                type="date"
                required
                value={newProd.effective_date}
                onChange={(e) => setNewProd({ ...newProd, effective_date: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">קישור לתמונה (אופציונלי)</label>
              <input
                type="url"
                dir="ltr"
                value={newProd.image_url}
                onChange={(e) => setNewProd({ ...newProd, image_url: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left text-xs"
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
