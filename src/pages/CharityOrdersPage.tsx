import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  HeartHandshake,
  Plus,
  Edit3,
  Trash2,
  Clock,
  CheckCircle2,
  Truck,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatFridayLabel,
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
} from '../lib/format';
import { FridaySelector } from '../components/FridaySelector';
import type { AdminProduct, Order, OrderStatus } from '../types';

export function CharityOrdersPage() {
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // מודאל תיעוד / עריכת חבילת תרומה
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formFriday, setFormFriday] = useState(getNextFridayISO());
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ order_type: 'charity' });
      if (fridayDate) qs.set('friday_date', fridayDate);

      const [ordRes, prodRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>(`/api/orders?${qs.toString()}`),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
      ]);
      setOrders(ordRes.orders);
      setProducts(prodRes.products.filter((p) => p.is_active));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הזמנות התרומה');
    } finally {
      setLoading(false);
    }
  }, [fridayDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const packages = orders.length;
    const totalUnits = orders.reduce(
      (s, o) => s + o.items.reduce((is, it) => is + it.quantity, 0),
      0
    );
    const totalCost = orders.reduce((s, o) => s + (o.estimated_cost ?? 0), 0);
    return { packages, totalUnits, totalCost };
  }, [orders]);

  const draftCost = useMemo(() => {
    return products.reduce((sum, p) => sum + (quantities[p.id] || 0) * p.cost_price, 0);
  }, [products, quantities]);

  const openCreate = () => {
    setEditingOrder(null);
    setFormFriday(fridayDate || getNextFridayISO());
    setRecipientName('');
    setNotes('');
    setQuantities({});
    setModalOpen(true);
  };

  const openEdit = (o: Order) => {
    setEditingOrder(o);
    setFormFriday(o.friday_date);
    setRecipientName(o.recipient_name);
    setNotes(o.notes);
    const qMap: Record<number, number> = {};
    for (const it of o.items) {
      qMap[it.product_id] = it.quantity;
    }
    setQuantities(qMap);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));

    if (items.length === 0) {
      setError('יש לבחור לפחות מוצר אחד לחבילה');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingOrder) {
        await apiFetch(`/api/orders/${editingOrder.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            friday_date: formFriday,
            recipient_name: recipientName.trim(),
            notes: notes.trim(),
            items,
          }),
        });
      } else {
        await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            friday_date: formFriday,
            order_type: 'charity',
            recipient_name: recipientName.trim(),
            notes: notes.trim(),
            items,
          }),
        });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת חבילת התרומה');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (orderId: number, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('למחוק רישום תרומה זה?')) return;
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    await loadData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-bold mb-2">
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>הזמנות מחוץ למכירה — הכנסה ₪0.00</span>
          </div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">תרומה למשפחות נזקקות</h2>
          <p className="text-sm text-slate-600 mt-1">
            תיעוד חבילות שבת למשפחות נזקקות ועמותות. הפריטים נכנסים אוטומטית לריכוז הייצור של יום שישי, ועלות חומרי הגלם מתועדת בדוחות הכספיים.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <FridaySelector value={fridayDate} onChange={setFridayDate} allowAll />
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף חבילת חסד</span>
          </button>
        </div>
      </div>

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">חבילות חסד</div>
          <div className="text-2xl font-extrabold text-purple-900 mt-2">{stats.packages}</div>
          <div className="text-xs text-slate-400 mt-0.5">הכנסה: ₪0.00 (מחוץ למכירה)</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">סה״כ יחידות לתרומה</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">{stats.totalUnits}</div>
          <div className="text-xs text-slate-400 mt-0.5">כלול אוטומטית בריכוז הייצור</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">עלות ייצור (COGS לתרומה)</div>
          <div className="text-2xl font-extrabold text-[#C85A17] mt-2">{formatILS(stats.totalCost)}</div>
          <div className="text-xs text-slate-400 mt-0.5">נרשם בעלות המכר בדוח הכספי</div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען חבילות חסד...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-[#E8D5BE]">
          אין עדיין חבילות חסד רשומות לתאריך הנבחר.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {orders.map((o) => (
            <div
              key={o.id}
              className="bg-white rounded-2xl border border-purple-200/80 shadow-soft p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base text-slate-900">{o.recipient_name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-900">
                        תרומה · ₪0.00
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {formatFridayLabel(o.friday_date)} · #{o.id}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(o)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(o.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3.5 bg-purple-50/50 rounded-xl p-3 space-y-1.5 text-xs tabular-nums">
                  {o.items.map((it) => (
                    <div key={it.id} className="flex justify-between">
                      <span className="font-semibold text-slate-800">
                        {it.quantity} × {it.product_name}
                      </span>
                      <span className="text-slate-500">
                        עלות: {formatILS(it.quantity * (it.cost_price_snapshot ?? 0))}
                      </span>
                    </div>
                  ))}
                </div>

                {o.notes && (
                  <p className="mt-2.5 text-xs text-slate-600 bg-[#FAF6F0] rounded-lg px-3 py-1.5">
                    הערה: {o.notes}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3.5 border-t border-purple-100 flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-700 tabular-nums">
                  עלות חבילה (COGS):{' '}
                  <span className="text-[#C85A17] text-sm font-extrabold">
                    {formatILS(o.estimated_cost ?? 0)}
                  </span>
                </div>

                <div className="inline-flex rounded-xl border border-purple-200 overflow-hidden text-xs font-bold">
                  {(
                    [
                      ['pending', 'ממתין', Clock],
                      ['ready', 'מוכן', CheckCircle2],
                      ['delivered', 'נמסר', Truck],
                    ] as const
                  ).map(([st, lbl, Icon]) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleStatus(o.id, st)}
                      className={`px-2.5 py-1.5 flex items-center gap-1 ${
                        o.status === st
                          ? 'bg-purple-700 text-white'
                          : 'bg-white text-slate-600 hover:bg-purple-50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{lbl}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* מודאל הוספה / עריכה */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-[#E8D5BE] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-2xl font-bold">
                {editingOrder ? 'עריכת חבילת חסד' : 'תיעוד חבילה למשפחה נזקקת'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך שישי</label>
                  <input
                    type="date"
                    required
                    value={formFriday}
                    onChange={(e) => setFormFriday(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">שם משפחה / עמותה</label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="לדוגמה: משפחת כהן / עמותת מאיר פנים"
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">בחירת מוצרים לחבילה</label>
                <div className="max-h-56 overflow-y-auto border border-[#E8D5BE] rounded-2xl divide-y divide-[#F3E9DC]">
                  {products.map((p) => {
                    const q = quantities[p.id] || 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between px-3.5 py-2 bg-white">
                        <div>
                          <div className="font-bold text-sm">{p.name}</div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            עלות ייצור: {formatILS(p.cost_price)}
                          </div>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={q}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                            }))
                          }
                          className="w-20 text-center py-1 rounded-lg border border-[#E8D5BE] tabular-nums font-bold text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערות לחלוקה</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="כתובת / איש קשר לחלוקה"
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>

              <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200 flex items-center justify-between tabular-nums">
                <div>
                  <div className="text-xs font-bold text-purple-900">הכנסה: ₪0.00 (תרומה)</div>
                  <div className="text-[11px] text-purple-700">עלות ייצור שתתועד בדוחות הכספיים:</div>
                </div>
                <span className="font-extrabold text-xl text-purple-900">{formatILS(draftCost)}</span>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-sm"
                >
                  {saving ? 'שומר...' : editingOrder ? 'עדכן חבילה' : 'שמור חבילת חסד'}
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-3 rounded-xl border border-[#E8D5BE] text-slate-600 font-semibold text-sm"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
