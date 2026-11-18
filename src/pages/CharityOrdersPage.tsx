import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { HeartHandshake, Plus, Minus } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, getNextFridayISO } from '../lib/format';
import { useFriday } from '../context/FridayContext';
import { FridaySelector } from '../components/FridaySelector';
import { OrderCard } from '../components/OrderCard';
import { BottomSheet } from '../components/BottomSheet';
import type { AdminProduct, Order, OrderStatus } from '../types';

export function CharityOrdersPage() {
  const { fridayDate: globalFriday, refreshTick } = useFriday();
  const [fridayDate, setFridayDate] = useState(globalFriday);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setFridayDate(globalFriday);
  }, [globalFriday]);

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
  }, [loadData, refreshTick]);

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

  const handleCycleStatus = async (order: Order, nextStatus: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
    await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('למחוק רישום תרומה זה?')) return;
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    await loadData();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-bold mb-1.5">
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>הזמנות מחוץ למכירה — הכנסה ₪0.00</span>
          </div>
          <h2 className="hidden md:block font-serif text-3xl font-bold text-slateink-800">
            תרומה למשפחות נזקקות
          </h2>
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5">
          <FridaySelector value={fridayDate} onChange={setFridayDate} allowAll />
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs sm:text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף חבילת חסד</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 sm:gap-4 tabular-nums">
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-[11px] font-bold text-slate-500">חבילות</div>
          <div className="text-xl sm:text-2xl font-extrabold text-purple-900 mt-1">{stats.packages}</div>
        </div>
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-[11px] font-bold text-slate-500">יחידות</div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">{stats.totalUnits}</div>
        </div>
        <div className="bg-white rounded-2xl p-3.5 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-[11px] font-bold text-slate-500">עלות COGS</div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#C85A17] mt-1">
            {formatILS(stats.totalCost)}
          </div>
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              showFridayDate={!fridayDate}
              onCycleStatus={handleCycleStatus}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <BottomSheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingOrder ? 'עריכת חבילת חסד' : 'תיעוד חבילה למשפחה נזקקת'}
        subtitle="הכנסה ₪0.00 · עלות הייצור מתועדת בדוחות"
        maxWidthClass="md:max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך שישי</label>
              <input
                type="date"
                required
                value={formFriday}
                onChange={(e) => setFormFriday(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">שם משפחה / עמותה</label>
              <input
                type="text"
                required
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="לדוגמה: עמותת מאיר פנים"
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE]"
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto border border-[#E8D5BE] rounded-2xl divide-y divide-[#F3E9DC]">
            {products.map((p) => {
              const q = quantities[p.id] || 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3.5 py-2.5 ${
                    q > 0 ? 'bg-purple-50/60' : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">{p.name}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      עלות ייצור: {formatILS(p.cost_price)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setQuantities((prev) => ({
                          ...prev,
                          [p.id]: Math.max(0, (prev[p.id] || 0) - 1),
                        }))
                      }
                      className="w-10 h-10 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="min-w-[30px] text-center font-extrabold tabular-nums">{q}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setQuantities((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
                      }
                      className="w-10 h-10 rounded-xl bg-purple-700 text-white flex items-center justify-center"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="הערות לחלוקה"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE]"
          />

          <div className="bg-purple-50 rounded-2xl p-4 border border-purple-200 flex items-center justify-between tabular-nums">
            <div>
              <div className="text-xs font-bold text-purple-900">הכנסה: ₪0.00 (תרומה)</div>
              <div className="text-[11px] text-purple-700">עלות ייצור שתתועד בדוחות:</div>
            </div>
            <span className="font-extrabold text-xl text-purple-900">{formatILS(draftCost)}</span>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[50px] rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-base"
          >
            {saving ? 'שומר...' : editingOrder ? 'עדכן חבילה' : 'שמור חבילת חסד'}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
