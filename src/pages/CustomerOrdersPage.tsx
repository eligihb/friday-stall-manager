import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Copy,
  Check,
  CreditCard,
  Clock,
  CheckCircle2,
  Truck,
  BookOpen,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatFridayLabel,
  formatHebrewDate,
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { formatOrderWhatsApp } from '../lib/whatsappFormat';
import { FridaySelector } from '../components/FridaySelector';
import type { AdminProduct, BusinessSettings, Order, OrderStatus, PaymentMethod, Transaction, User } from '../types';

export function CustomerOrdersPage() {
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [statusFilter, setStatusFilter] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bizSettings, setBizSettings] = useState<BusinessSettings | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // מודאל יצירה / עריכה של הזמנת לקוח
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formFriday, setFormFriday] = useState(getNextFridayISO());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [creditDiscount, setCreditDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bit');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  // מודאל תשלום
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bit');

  // מודאל כרטסת לקוח מאוחדת
  const [ledgerData, setLedgerData] = useState<{
    user: User;
    orders: Order[];
    transactions: Transaction[];
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ order_type: 'customer' });
      if (fridayDate) qs.set('friday_date', fridayDate);
      if (statusFilter) qs.set('status', statusFilter);

      const [ordRes, prodRes, usrRes, setRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>(`/api/orders?${qs.toString()}`),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
      ]);
      setOrders(ordRes.orders);
      setProducts(prodRes.products.filter((p) => p.is_active));
      setUsers(usrRes.users.filter((u) => u.role === 'customer'));
      setBizSettings(setRes.settings);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הזמנות הלקוחות');
    } finally {
      setLoading(false);
    }
  }, [fridayDate, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingOrder(null);
    setFormFriday(fridayDate || getNextFridayISO());
    setSelectedUserId('');
    setRecipientName('');
    setDeliveryFee(String(bizSettings?.default_delivery_fee ?? 0));
    setCreditDiscount('0');
    setPaidAmount('0');
    setPaymentMethod('bit');
    setNotes('');
    setQuantities({});
    setModalOpen(true);
  };

  const openEditModal = (o: Order) => {
    setEditingOrder(o);
    setFormFriday(o.friday_date);
    setSelectedUserId(o.user_id ? String(o.user_id) : '');
    setRecipientName(o.recipient_name);
    setDeliveryFee(String(o.delivery_fee));
    setCreditDiscount(String(o.credit_discount));
    setPaidAmount(String(o.paid_amount));
    setNotes(o.notes);
    const qMap: Record<number, number> = {};
    for (const it of o.items) {
      qMap[it.product_id] = it.quantity;
    }
    setQuantities(qMap);
    setModalOpen(true);
  };

  const draftTotal = useMemo(() => {
    let sub = 0;
    for (const p of products) {
      const q = quantities[p.id] || 0;
      if (q > 0) sub += q * p.preorder_price;
    }
    return Math.max(0, sub + (Number(deliveryFee) || 0) - (Number(creditDiscount) || 0));
  }, [products, quantities, deliveryFee, creditDiscount]);

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));

    if (items.length === 0) {
      setError('יש לבחור לפחות מוצר אחד');
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
            delivery_fee: Number(deliveryFee) || 0,
            credit_discount: Number(creditDiscount) || 0,
            notes: notes.trim(),
            price_tier: 'preorder_price',
            items,
          }),
        });
      } else {
        await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            friday_date: formFriday,
            order_type: 'customer',
            price_tier: 'preorder_price',
            user_id: selectedUserId ? Number(selectedUserId) : null,
            recipient_name: recipientName.trim(),
            delivery_fee: Number(deliveryFee) || 0,
            credit_discount: Number(creditDiscount) || 0,
            paid_amount: Number(paidAmount) || 0,
            payment_method: paymentMethod,
            notes: notes.trim(),
            items,
          }),
        });
      }
      setModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההזמנה');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (orderId: number, status: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrder) return;
    await apiFetch(`/api/orders/${payOrder.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        paid_amount: Number(payAmount),
        payment_method: payMethod,
      }),
    });
    setPayOrder(null);
    await loadData();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('למחוק הזמנת לקוח זו?')) return;
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const openCustomerLedger = async (userId: number) => {
    const res = await apiFetch<{ user: User; orders: Order[]; transactions: Transaction[] }>(
      `/api/users/${userId}/ledger`
    );
    setLedgerData(res);
  };

  const copyWhatsApp = async (order: Order) => {
    await navigator.clipboard.writeText(formatOrderWhatsApp(order, bizSettings));
    setCopiedId(order.id);
    setTimeout(() => setCopiedId((c) => (c === order.id ? null : c)), 1800);
  };

  const totals = useMemo(() => {
    const totalAmount = orders.reduce((s, o) => s + o.total_amount, 0);
    const totalPaid = orders.reduce((s, o) => s + o.paid_amount, 0);
    return { totalAmount, totalPaid, unpaid: Math.max(0, totalAmount - totalPaid) };
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">הזמנות לקוחות</h2>
          <p className="text-sm text-slate-600 mt-1">
            יצירה ועריכת הזמנות במחירון הזמנה מוקדמת (`preorder_price`), תיעוד תשלומים ושליחת סיכום לוואטסאפ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <FridaySelector value={fridayDate} onChange={setFridayDate} allowAll />
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>הזמנת לקוח חדשה</span>
          </button>
        </div>
      </div>

      {/* סיכום וסינון סטטוס */}
      <div className="grid grid-cols-3 gap-3 tabular-nums">
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-semibold text-slate-500">סה״כ הזמנות</div>
          <div className="text-xl font-extrabold text-slate-900 mt-1">{formatILS(totals.totalAmount)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-semibold text-slate-500">שולם בפועל</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{formatILS(totals.totalPaid)}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-xs font-semibold text-slate-500">יתרה לגבייה</div>
          <div className="text-xl font-extrabold text-red-700 mt-1">{formatILS(totals.unpaid)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: '', label: 'כל הסטטוסים' },
          { key: 'pending', label: 'ממתין להכנה' },
          { key: 'ready', label: 'מוכן למסירה' },
          { key: 'delivered', label: 'נמסר' },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
              statusFilter === f.key
                ? 'bg-[#1E242B] text-white'
                : 'bg-white border border-[#E8D5BE] text-slate-600 hover:bg-[#FFF7ED]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען הזמנות לקוחות...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-[#E8D5BE]">
          לא נמצאו הזמנות לקוחות לפי הסינון הנבחר.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {orders.map((o) => {
            const unpaid = Math.max(0, o.total_amount - o.paid_amount);
            return (
              <div
                key={o.id}
                className="bg-white rounded-2xl border border-[#E8D5BE]/80 shadow-soft p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-slate-900">{o.recipient_name}</span>
                        <span className="text-xs text-slate-400 tabular-nums">#{o.id}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{formatFridayLabel(o.friday_date)}</div>
                    </div>

                    <div className="flex items-center gap-1">
                      {o.user_id && (
                        <button
                          type="button"
                          onClick={() => openCustomerLedger(o.user_id!)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-[#C85A17] hover:bg-[#FFF7ED]"
                          title="כרטסת לקוח"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => copyWhatsApp(o)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                        title="העתק סיכום לוואטסאפ"
                      >
                        {copiedId === o.id ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(o)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                        title="ערוך הזמנה"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(o.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="מחק הזמנה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3.5 bg-[#FAF6F0] rounded-xl p-3 space-y-1.5 text-xs tabular-nums">
                    {o.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span className="font-semibold text-slate-800">
                          {it.quantity} × {it.product_name}
                        </span>
                        <span className="text-slate-600">
                          {formatILS(it.quantity * it.unit_price_snapshot)}
                        </span>
                      </div>
                    ))}
                    {(o.delivery_fee > 0 || o.credit_discount > 0) && (
                      <div className="pt-1.5 mt-1.5 border-t border-[#E8D5BE] space-y-1">
                        {o.delivery_fee > 0 && (
                          <div className="flex justify-between text-slate-600">
                            <span>משלוח</span>
                            <span>{formatILS(o.delivery_fee)}</span>
                          </div>
                        )}
                        {o.credit_discount > 0 && (
                          <div className="flex justify-between text-emerald-700 font-semibold">
                            <span>זכות / הנחה</span>
                            <span>-{formatILS(o.credit_discount)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {o.notes && (
                    <p className="mt-2.5 text-xs text-slate-600 bg-amber-50/70 rounded-lg px-3 py-1.5">
                      הערה: {o.notes}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3.5 border-t border-[#F3E9DC] space-y-3">
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="font-extrabold text-base text-slate-900">
                      סה״כ: {formatILS(o.total_amount)}
                    </span>
                    <div className="text-xs font-bold">
                      <span className="text-emerald-700">שולם: {formatILS(o.paid_amount)}</span>
                      {unpaid > 0 && (
                        <span className="text-red-600 mr-2">יתרה: {formatILS(unpaid)}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex rounded-xl border border-[#E8D5BE] overflow-hidden text-xs font-bold">
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
                          onClick={() => handleStatusChange(o.id, st)}
                          className={`px-2.5 py-1.5 flex items-center gap-1 ${
                            o.status === st
                              ? 'bg-[#C85A17] text-white'
                              : 'bg-white text-slate-600 hover:bg-[#FAF6F0]'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{lbl}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setPayOrder(o);
                        setPayAmount(o.total_amount.toFixed(2));
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>רישום תשלום</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* מודאל יצירה / עריכה */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#E8D5BE] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-2xl font-bold">
                {editingOrder ? `עריכת הזמנת לקוח #${editingOrder.id}` : 'הזמנת לקוח חדשה (הזמנה מוקדמת)'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                {!editingOrder && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">לקוח רשום</label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        setSelectedUserId(e.target.value);
                        const found = users.find((u) => String(u.id) === e.target.value);
                        if (found) setRecipientName(found.name);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                    >
                      <option value="">לקוח מזדמן</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className={editingOrder ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">שם הלקוח</label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  מוצרים (מחירון הזמנה מוקדמת)
                </label>
                <div className="max-h-56 overflow-y-auto border border-[#E8D5BE] rounded-2xl divide-y divide-[#F3E9DC]">
                  {products.map((p) => {
                    const q = quantities[p.id] || 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between px-3.5 py-2 bg-white">
                        <div>
                          <div className="font-bold text-sm">{p.name}</div>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {formatILS(p.preorder_price)}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setQuantities((prev) => ({ ...prev, [p.id]: Math.max(0, (prev[p.id] || 0) - 1) }))
                            }
                            className="w-7 h-7 rounded-lg bg-[#FAF6F0] border border-[#E8D5BE] font-bold"
                          >
                            -
                          </button>
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
                            className="w-14 text-center py-1 rounded-lg border border-[#E8D5BE] tabular-nums font-bold text-sm"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setQuantities((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
                            }
                            className="w-7 h-7 rounded-lg bg-[#FFF7ED] border border-[#C85A17]/40 text-[#C85A17] font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">משלוח (₪)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">זכות / הנחה (₪)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    value={creditDiscount}
                    onChange={(e) => setCreditDiscount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums text-sm"
                  />
                </div>
                {!editingOrder && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">שולם מראש (₪)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        dir="ltr"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                      >
                        {(['cash', 'bit', 'transfer'] as const).map((pm) => (
                          <option key={pm} value={pm}>
                            {PAYMENT_METHOD_LABELS[pm]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>

              <div className="bg-[#FAF6F0] rounded-2xl p-4 border border-[#E8D5BE] flex items-center justify-between">
                <span className="font-bold text-slate-700">סה״כ להזמנה:</span>
                <span className="font-extrabold text-2xl text-[#C85A17] tabular-nums">
                  {formatILS(draftTotal)}
                </span>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
                >
                  {saving ? 'שומר...' : editingOrder ? 'עדכן הזמנה' : 'שמור הזמנה'}
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

      {/* מודאל תשלום */}
      {payOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <h3 className="font-serif text-xl font-bold mb-1">רישום תשלום — {payOrder.recipient_name}</h3>
            <p className="text-xs text-slate-500 mb-4 tabular-nums">
              הזמנה #{payOrder.id} · סה״כ: {formatILS(payOrder.total_amount)}
            </p>
            <form onSubmit={handleSavePayment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">סה״כ ששולם (₪)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  dir="ltr"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
                >
                  {(['cash', 'bit', 'transfer'] as const).map((pm) => (
                    <option key={pm} value={pm}>
                      {PAYMENT_METHOD_LABELS[pm]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm"
                >
                  שמור תשלום
                </button>
                <button
                  type="button"
                  onClick={() => setPayOrder(null)}
                  className="px-4 py-2.5 rounded-xl border border-[#E8D5BE] text-slate-600 text-sm font-semibold"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* מודאל כרטסת לקוח מאוחדת */}
      {ledgerData && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#E8D5BE] max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-serif text-2xl font-bold">כרטסת לקוח — {ledgerData.user.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                  יתרה נוכחית:{' '}
                  <span
                    className={
                      ledgerData.user.balance < 0
                        ? 'text-red-600 font-bold'
                        : 'text-emerald-700 font-bold'
                    }
                  >
                    {formatILS(ledgerData.user.balance)}
                  </span>
                </p>
              </div>
              <button type="button" onClick={() => setLedgerData(null)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-2">היסטוריית הזמנות</h4>
                <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-2xl overflow-hidden">
                  {ledgerData.orders.map((o) => (
                    <div key={o.id} className="p-3.5 bg-white flex items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-bold text-slate-900">
                          {formatFridayLabel(o.friday_date)} (#{o.id})
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {o.items.map((i) => `${i.quantity} ${i.product_name}`).join(', ')}
                        </div>
                      </div>
                      <div className="text-left tabular-nums shrink-0">
                        <div className="font-bold text-slate-900">{formatILS(o.total_amount)}</div>
                        <div className="text-emerald-700">שולם: {formatILS(o.paid_amount)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {ledgerData.transactions.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-800 mb-2">תשלומים שנרשמו</h4>
                  <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-2xl overflow-hidden">
                    {ledgerData.transactions.map((t) => (
                      <div key={t.id} className="p-3 bg-[#FDFBF7] flex items-center justify-between text-xs tabular-nums">
                        <div>
                          <span className="font-bold">{t.category}</span> · {formatHebrewDate(t.date)} ·{' '}
                          {PAYMENT_METHOD_LABELS[t.payment_method]}
                        </div>
                        <span className="font-extrabold text-emerald-700">+{formatILS(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
