import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  HeartHandshake,
  Plus,
  Minus,
  Edit3,
  Trash2,
  Banknote,
  CheckCircle2,
  Building2,
  Receipt,
  PackagePlus,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatHebrewDate,
  formatILS,
  getNextFridayISO,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { useFriday } from '../context/FridayContext';
import { FridaySelector } from '../components/FridaySelector';
import { OrderCard } from '../components/OrderCard';
import { BottomSheet } from '../components/BottomSheet';
import type {
  AdminProduct,
  Order,
  OrderStatus,
  PaymentMethod,
  SubsidizedEntity,
  SubsidizedOverviewResponse,
} from '../types';

export function CharityOrdersPage() {
  const { fridayDate: globalFriday, refreshTick } = useFriday();
  const [fridayDate, setFridayDate] = useState(globalFriday);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [overview, setOverview] = useState<SubsidizedOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    setFridayDate(globalFriday);
  }, [globalFriday]);

  // חלונית יצירה / עריכת חבילה לשישי
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formFriday, setFormFriday] = useState(getNextFridayISO());
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [recipientName, setRecipientName] = useState('');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [savingOrder, setSavingOrder] = useState(false);

  // חלונית קליטת תשלום חודשי מגוף מסובסד (מקזז עלות סבסוד)
  const [payEntity, setPayEntity] = useState<SubsidizedEntity | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash');
  const [payNotes, setPayNotes] = useState('');
  const [savingPay, setSavingPay] = useState(false);

  // חלונית הוספה / עריכה של גוף מסובסד ("הכולל", "משפחה 1", "משפחה 2" וכו')
  const [entityModalOpen, setEntityModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<SubsidizedEntity | null>(null);
  const [entityName, setEntityName] = useState('');
  const [entityPhone, setEntityPhone] = useState('');
  const [entityNotes, setEntityNotes] = useState('');
  const [savingEntity, setSavingEntity] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ order_type: 'charity' });
      if (fridayDate) qs.set('friday_date', fridayDate);

      const [ordRes, prodRes, subRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>(`/api/orders?${qs.toString()}`),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
        apiFetch<SubsidizedOverviewResponse>('/api/subsidized'),
      ]);
      setOrders(ordRes.orders);
      setProducts(prodRes.products.filter((p) => p.is_active));
      setOverview(subRes);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני ההזמנות המסובסדות');
    } finally {
      setLoading(false);
    }
  }, [fridayDate]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTick]);

  const fridayStats = useMemo(() => {
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

  const openCreateOrder = (presetEntity?: SubsidizedEntity) => {
    setEditingOrder(null);
    setFormFriday(fridayDate || getNextFridayISO());
    const targetEnt = presetEntity || overview?.entities[0] || null;
    setSelectedEntityId(targetEnt ? String(targetEnt.id) : '');
    setRecipientName(targetEnt ? targetEnt.name : '');
    setNotes('');
    setQuantities({});
    setOrderModalOpen(true);
  };

  const openEditOrder = (o: Order) => {
    setEditingOrder(o);
    setFormFriday(o.friday_date);
    setSelectedEntityId(o.subsidized_entity_id ? String(o.subsidized_entity_id) : '');
    setRecipientName(o.recipient_name);
    setNotes(o.notes);
    const qMap: Record<number, number> = {};
    for (const it of o.items) {
      qMap[it.product_id] = it.quantity;
    }
    setQuantities(qMap);
    setOrderModalOpen(true);
  };

  const handleSelectOrderEntity = (idStr: string) => {
    setSelectedEntityId(idStr);
    const ent = overview?.entities.find((e) => String(e.id) === idStr);
    if (ent) setRecipientName(ent.name);
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));

    if (items.length === 0) {
      setError('יש לבחור לפחות מוצר אחד לחבילה המסובסדת');
      return;
    }

    setSavingOrder(true);
    setError('');
    try {
      const payload = {
        friday_date: formFriday,
        subsidized_entity_id: selectedEntityId ? Number(selectedEntityId) : null,
        recipient_name: recipientName.trim(),
        notes: notes.trim(),
        items,
      };
      if (editingOrder) {
        await apiFetch(`/api/orders/${editingOrder.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('החבילה המסובסדת עודכנה!');
      } else {
        await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({ ...payload, order_type: 'charity' }),
        });
        showToast('החבילה המסובסדת נוספה לסיכום הרכש מהמאפייה ולדוח הסבסוד!');
      }
      setOrderModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת החבילה המסובסדת');
    } finally {
      setSavingOrder(false);
    }
  };

  const handleCycleStatus = async (order: Order, nextStatus: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
    await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
  };

  const handleDeleteOrder = async (id: number) => {
    if (!window.confirm('למחוק הזמנה מסובסדת זו?')) return;
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    await loadData();
  };

  // ניהול גופים מסובסדים (עריכה / הוספה / מחיקה)
  const openCreateEntity = () => {
    setEditingEntity(null);
    setEntityName('');
    setEntityPhone('');
    setEntityNotes('');
    setEntityModalOpen(true);
  };

  const openEditEntity = (ent: SubsidizedEntity) => {
    setEditingEntity(ent);
    setEntityName(ent.name);
    setEntityPhone(ent.phone);
    setEntityNotes(ent.notes);
    setEntityModalOpen(true);
  };

  const handleSaveEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEntity(true);
    setError('');
    try {
      const payload = {
        name: entityName.trim(),
        phone: entityPhone.trim(),
        notes: entityNotes.trim(),
      };
      if (editingEntity) {
        await apiFetch(`/api/subsidized/entities/${editingEntity.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('פרטי הגוף המסובסד עודכנו!');
      } else {
        await apiFetch('/api/subsidized/entities', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('נוסף גוף מסובסד חדש!');
      }
      setEntityModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת הגוף המסובסד');
    } finally {
      setSavingEntity(false);
    }
  };

  const handleDeleteEntity = async (ent: SubsidizedEntity) => {
    if (!window.confirm(`למחוק את "${ent.name}" ואת היסטוריית התקבולים שלו?`)) return;
    await apiFetch(`/api/subsidized/entities/${ent.id}`, { method: 'DELETE' });
    await loadData();
  };

  // קליטת תשלום חודשי מגוף מסובסד
  const openPaymentModal = (ent: SubsidizedEntity) => {
    setPayEntity(ent);
    setPayAmount(ent.net_subsidy_gap > 0 ? String(Math.round(ent.net_subsidy_gap)) : '');
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethod('cash');
    setPayNotes('');
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payEntity) return;
    setSavingPay(true);
    setError('');
    try {
      await apiFetch('/api/subsidized/payments', {
        method: 'POST',
        body: JSON.stringify({
          entity_id: payEntity.id,
          amount: Number(payAmount),
          date: payDate,
          payment_method: payMethod,
          notes: payNotes.trim(),
        }),
      });
      setPayEntity(null);
      showToast(`תשלום חודשי מאת "${payEntity.name}" נקלט וקיזז את הוצאת הסבסוד!`);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בקליטת התשלום');
    } finally {
      setSavingPay(false);
    }
  };

  const handleDeletePayment = async (id: number) => {
    if (!window.confirm('למחוק רשומת תשלום מסובסד זו?')) return;
    await apiFetch(`/api/subsidized/payments/${id}`, { method: 'DELETE' });
    await loadData();
  };

  return (
    <div className="space-y-6">
      {/* כותרת עליונה */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-900 text-xs font-bold mb-1.5">
            <HeartHandshake className="w-3.5 h-3.5" />
            <span>סעיף חשבונאי נפרד — לא נכלל בהכנסות וברווח המסחרי</span>
          </div>
          <h2 className="hidden md:block font-serif text-3xl font-bold text-slateink-800">
            הזמנות מסובסדות (הכולל ומשפחות)
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
            הכמויות נסכמות אוטומטית בסיכום הרכש מהמאפייה ובלקוט. התשלומים החודשיים מקזזים את עלות הסחורה ומציגים את פער הסבסוד המדויק.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2">
          <button
            type="button"
            onClick={openCreateEntity}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[48px] md:min-h-[42px] rounded-xl bg-white border border-[#E8D5BE] hover:border-purple-400 text-slate-800 font-bold text-xs sm:text-sm"
          >
            <Building2 className="w-4 h-4 text-purple-700" />
            <span>הוסף גוף</span>
          </button>
          <button
            type="button"
            onClick={() => openCreateOrder()}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[48px] md:min-h-[42px] rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs sm:text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף חבילה לשישי</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toast}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {/* סיכום סעיף "הוצאות הזמנות מסובסדות" (מצטבר) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 tabular-nums">
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-bold text-slate-500">סה״כ עלות חבילות מסובסדות</div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1">
            {formatILS(overview?.totals.total_cost ?? 0)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {overview?.totals.total_units ?? 0} יח׳ שנמסרו לפי מחיר עלות
          </div>
        </div>
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-emerald-200 shadow-soft">
          <div className="text-xs font-bold text-emerald-800">בניכוי: תקבולים חודשיים שהתקבלו</div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">
            -{formatILS(overview?.totals.total_paid ?? 0)}
          </div>
          <div className="text-[11px] text-emerald-700/80 mt-0.5">
            מקטין את מאזן הוצאת הסבסוד (לא נספר כהכנסה מסחרית)
          </div>
        </div>
        <div className="bg-purple-50 rounded-2xl p-4 sm:p-5 border-2 border-purple-300 shadow-soft">
          <div className="text-xs font-extrabold text-purple-900">נטו הוצאת סבסוד (פער סבסוד)</div>
          <div className="text-2xl font-extrabold text-purple-900 mt-1">
            {formatILS(overview?.totals.net_subsidy_expense ?? 0)}
          </div>
          <div className="text-[11px] text-purple-700 mt-0.5">
            העלות הנקייה שהעסק סופג בפועל
          </div>
        </div>
      </div>

      {/* כרטיסיות הגופים המסובסדים ("הכולל", "משפחה 1", "משפחה 2" וכל גוף נוסף) */}
      <div className="space-y-3">
        <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
          גופים מסובסדים וכרטסת סבסוד
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {(overview?.entities ?? []).map((ent) => (
            <div
              key={ent.id}
              className="bg-white rounded-2xl border border-[#E8D5BE] shadow-soft p-4 flex flex-col justify-between gap-3"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-extrabold text-lg text-slate-900">{ent.name}</h4>
                    {ent.phone && (
                      <div className="text-xs text-slate-500 tabular-nums" dir="ltr">
                        {ent.phone}
                      </div>
                    )}
                    {ent.notes && <p className="text-xs text-slate-500 mt-0.5">{ent.notes}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditEntity(ent)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100"
                      title="ערוך שם / פרטים"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteEntity(ent)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      title="מחק גוף"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs tabular-nums bg-[#FAF6F0] rounded-xl p-3 border border-[#F3E9DC]">
                  <div className="flex justify-between text-slate-600">
                    <span>עלות חבילות ({ent.total_orders} משלוחים · {ent.total_units} יח׳):</span>
                    <span className="font-bold text-slate-900">{formatILS(ent.total_cost)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>תקבולים שהתקבלו:</span>
                    <span className="font-bold">-{formatILS(ent.total_paid)}</span>
                  </div>
                  <div className="pt-1.5 border-t border-[#E8D5BE] flex justify-between font-extrabold text-sm text-purple-900">
                    <span>נטו פער סבסוד:</span>
                    <span>{formatILS(ent.net_subsidy_gap)}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => openCreateOrder(ent)}
                  className="min-h-[48px] px-2.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <PackagePlus className="w-4 h-4 shrink-0" />
                  <span>חבילה לשישי</span>
                </button>
                <button
                  type="button"
                  onClick={() => openPaymentModal(ent)}
                  className="min-h-[48px] px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <Banknote className="w-4 h-4 shrink-0" />
                  <span>קלוט תשלום חודשי</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* חבילות מסובסדות ליום שישי הנבחר */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="font-serif text-xl sm:text-2xl font-bold text-slate-900">
              חבילות מסובסדות ליום שישי
            </h3>
            <p className="text-xs text-slate-500 tabular-nums">
              {fridayStats.packages} חבילות · {fridayStats.totalUnits} יח׳ · עלות סחורה:{' '}
              <strong className="text-purple-900">{formatILS(fridayStats.totalCost)}</strong>
            </p>
          </div>
          <FridaySelector value={fridayDate} onChange={setFridayDate} allowAll />
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
            טוען הזמנות מסובסדות...
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-[#E8D5BE]">
            אין עדיין הזמנות מסובסדות רשומות לתאריך הנבחר.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {orders.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                showFridayDate={!fridayDate}
                onCycleStatus={handleCycleStatus}
                onEdit={openEditOrder}
                onDelete={handleDeleteOrder}
              />
            ))}
          </div>
        )}
      </div>

      {/* יומן תקבולים חודשיים מהזמנות מסובסדות */}
      <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F3E9DC] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-purple-700" />
            <div>
              <h3 className="font-bold text-lg text-slate-900">יומן תקבולים חודשיים (קיזוז סבסוד)</h3>
              <p className="text-xs text-slate-500">
                תקבולים מהכולל והמשפחות המופחתים ישירות מהוצאות ההזמנות המסובסדות.
              </p>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-500 tabular-nums">
            {overview?.payments.length ?? 0} רשומות
          </span>
        </div>

        {(overview?.payments.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            טרם נקלטו תשלומים חודשיים. לחץ על ״קלוט תשלום חודשי״ בכרטיסיית הגוף למעלה.
          </div>
        ) : (
          <div className="divide-y divide-[#F3E9DC]">
            {overview!.payments.map((p) => (
              <div key={p.id} className="p-4 flex items-center justify-between gap-3 hover:bg-[#FDFBF7]">
                <div>
                  <div className="font-bold text-sm text-slate-900">{p.entity_name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    <span>{formatHebrewDate(p.date)}</span>
                    <span>·</span>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-bold text-[11px]">
                      {PAYMENT_METHOD_LABELS[p.payment_method]}
                    </span>
                    {p.notes && <span>· {p.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="font-extrabold text-emerald-700 tabular-nums text-sm">
                    -{formatILS(p.amount)} מהסבסוד
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeletePayment(p.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title="מחק תשלום"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* חלונית יצירה / עריכת חבילה מסובסדת לשישי */}
      <BottomSheet
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        title={editingOrder ? 'עריכת הזמנה מסובסדת' : 'תיעוד הזמנה מסובסדת לשישי'}
        subtitle="מתווסף אוטומטית לסיכום הרכש מהמאפייה · עלות הסחורה נרשמת בסעיף סבסוד נפרד"
        maxWidthClass="md:max-w-xl"
      >
        <form onSubmit={handleSaveOrder} className="space-y-4">
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
              <label className="block text-xs font-semibold text-slate-600 mb-1">בחר גוף מסובסד</label>
              <select
                value={selectedEntityId}
                onChange={(e) => handleSelectOrderEntity(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-white font-semibold"
              >
                <option value="">אחר (הזנה ידנית)</option>
                {(overview?.entities ?? []).map((ent) => (
                  <option key={ent.id} value={ent.id}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">שם מקבל החבילה</label>
            <input
              type="text"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="לדוגמה: הכולל / משפחה 1"
              className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE]"
            />
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
                      מחיר עלות: {formatILS(p.cost_price)}
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
                      className="w-12 h-12 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="min-w-[30px] text-center font-extrabold tabular-nums">{q}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setQuantities((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
                      }
                      className="w-12 h-12 rounded-xl bg-purple-700 text-white flex items-center justify-center active:scale-95"
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
              <div className="text-xs font-bold text-purple-900">הזמנה מסובסדת (מוחרגת מרווח מסחרי)</div>
              <div className="text-[11px] text-purple-700">עלות סחורה שתירשם בסעיף הוצאות הסבסוד:</div>
            </div>
            <span className="font-extrabold text-xl text-purple-900">{formatILS(draftCost)}</span>
          </div>

          <button
            type="submit"
            disabled={savingOrder}
            className="w-full min-h-[50px] rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-base"
          >
            {savingOrder ? 'שומר...' : editingOrder ? 'עדכן חבילה מסובסדת' : 'שמור חבילה מסובסדת'}
          </button>
        </form>
      </BottomSheet>

      {/* חלונית קליטת תשלום חודשי (מקזז את פער הסבסוד) */}
      <BottomSheet
        open={Boolean(payEntity)}
        onClose={() => setPayEntity(null)}
        title={payEntity ? `קליטת תשלום חודשי — ${payEntity.name}` : ''}
        subtitle={
          payEntity
            ? `פער סבסוד נוכחי: ${formatILS(payEntity.net_subsidy_gap)} · מקזז את הוצאת הסבסוד בלבד`
            : undefined
        }
        maxWidthClass="md:max-w-md"
      >
        {payEntity && (
          <form onSubmit={handleRecordPayment} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">סכום שהתקבל (₪)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  dir="ltr"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums font-extrabold text-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">תאריך תשלום</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">אמצעי תשלום</label>
              <div className="grid grid-cols-3 gap-2">
                {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setPayMethod(pm)}
                    className={`min-h-[48px] rounded-xl border text-xs font-bold ${
                      payMethod === pm
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-[#FDFBF7] text-slate-700 border-[#E8D5BE]'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[pm]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">הערה</label>
              <input
                type="text"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                placeholder="לדוגמה: תשלום חודשי במזומן לחודש נובמבר"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE]"
              />
            </div>

            <button
              type="submit"
              disabled={savingPay}
              className="w-full min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base"
            >
              {savingPay ? 'שומר...' : 'קלוט תשלום וקזז מהוצאת הסבסוד'}
            </button>
          </form>
        )}
      </BottomSheet>

      {/* חלונית הוספה / עריכת גוף מסובסד */}
      <BottomSheet
        open={entityModalOpen}
        onClose={() => setEntityModalOpen(false)}
        title={editingEntity ? `עריכת "${editingEntity.name}"` : 'הוספת גוף מסובסד חדש'}
        subtitle="הגופים מופיעים בכרטיסיות הסבסוד ובבחירת הזמנה מסובסדת"
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleSaveEntity} className="space-y-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">שם הגוף / המשפחה</label>
            <input
              type="text"
              required
              value={entityName}
              onChange={(e) => setEntityName(e.target.value)}
              placeholder="לדוגמה: הכולל / משפחה 3"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE]"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">טלפון (אופציונלי)</label>
            <input
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={entityPhone}
              onChange={(e) => setEntityPhone(e.target.value)}
              placeholder="050-0000000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-left"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">הערות</label>
            <input
              type="text"
              value={entityNotes}
              onChange={(e) => setEntityNotes(e.target.value)}
              placeholder="פרטי חלוקה / הסדר תשלום חודשי"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE]"
            />
          </div>
          <button
            type="submit"
            disabled={savingEntity}
            className="w-full min-h-[50px] rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-extrabold text-base"
          >
            {savingEntity ? 'שומר...' : editingEntity ? 'עדכן פרטים' : 'הוסף גוף מסובסד'}
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
