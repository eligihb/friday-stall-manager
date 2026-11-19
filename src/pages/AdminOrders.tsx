import React, { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2, Clock, Truck, X, CreditCard } from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { FridaySelector } from '../components/FridaySelector';
import type { AdminProduct, Order, OrderStatus, OrderType, PaymentMethod, User } from '../types';

export function AdminOrders() {
  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [filterType, setFilterType] = useState<string>('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // מודאל יצירת הזמנה חדשה
  const [showCreate, setShowCreate] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('customer');
  const [priceTier, setPriceTier] = useState<'preorder_price' | 'customer_price'>('preorder_price');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [recipientName, setRecipientName] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [creditDiscount, setCreditDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  // מודאל עדכון תשלום
  const [payOrder, setPayOrder] = useState<Order | null>(null);
  const [payValue, setPayValue] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('paybox');

  const loadData = async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ friday_date: fridayDate });
      if (filterType) qs.set('order_type', filterType);
      const [ordRes, prodRes, usrRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>(`/api/orders?${qs.toString()}`),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
        apiFetch<{ users: User[] }>('/api/users'),
      ]);
      setOrders(ordRes.orders);
      setProducts(prodRes.products.filter((p) => p.is_active));
      setUsers(usrRes.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הזמנות');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [fridayDate, filterType]);

  const draftTotal = useMemo(() => {
    if (orderType === 'charity') return 0;
    let sum = 0;
    for (const p of products) {
      const q = quantities[p.id] || 0;
      if (q <= 0) continue;
      const unit = orderType === 'supplier' ? p.supplier_price : p[priceTier];
      sum += q * unit;
    }
    return Math.max(0, sum + (Number(deliveryFee) || 0) - (Number(creditDiscount) || 0));
  }, [products, quantities, orderType, priceTier, deliveryFee, creditDiscount]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([pid, quantity]) => ({ product_id: Number(pid), quantity }));

    if (items.length === 0) {
      setError('יש לבחור לפחות מוצר אחד');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          order_type: orderType,
          price_tier: priceTier,
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
      setShowCreate(false);
      setQuantities({});
      setRecipientName('');
      setSelectedUserId('');
      setDeliveryFee('0');
      setCreditDiscount('0');
      setPaidAmount('0');
      setNotes('');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (orderId: number, status: OrderStatus) => {
    try {
      await apiFetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון סטטוס');
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrder) return;
    try {
      await apiFetch(`/api/orders/${payOrder.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          paid_amount: Number(payValue),
          payment_method: payMethod,
        }),
      });
      setPayOrder(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בעדכון התשלום');
    }
  };

  const handleDeleteOrder = async (id: number) => {
    if (!window.confirm('האם למחוק את ההזמנה? יתרת הלקוח/ספק תתעדכן בהתאם.')) return;
    try {
      await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה במחיקת ההזמנה');
    }
  };

  const statusBadge = (status: OrderStatus) => {
    if (status === 'delivered')
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (status === 'ready')
      return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const typeBadge = (t: OrderType) => {
    if (t === 'supplier') return 'bg-orange-100 text-[#8A330B]';
    if (t === 'charity') return 'bg-purple-100 text-purple-800';
    return 'bg-sky-100 text-sky-800';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">הזמנות שישי</h2>
          <p className="text-sm text-slate-600 mt-1">
            ניהול הזמנות לקוחות, ספקים סיטונאיים והזמנות מסובסדות, כולל גבייה וסטטוסי מסירה.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FridaySelector value={fridayDate} onChange={setFridayDate} />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>הזמנה חדשה</span>
          </button>
        </div>
      </div>

      {/* פילטר סוגי הזמנות */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: '', label: 'הכל' },
          { key: 'supplier', label: 'ספקים סיטונאיים' },
          { key: 'customer', label: 'לקוחות' },
          { key: 'charity', label: 'הזמנות מסובסדות' },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilterType(f.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              filterType === f.key
                ? 'bg-[#1E242B] text-white'
                : 'bg-white border border-[#E8D5BE] text-slate-700 hover:bg-[#FFF7ED]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-semibold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-400 border border-[#E8D5BE]">
          טוען הזמנות...
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-[#E8D5BE]">
          לא נמצאו הזמנות ליום השישי הנבחר.
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
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-base text-slate-900">{o.recipient_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${typeBadge(o.order_type)}`}>
                          {ORDER_TYPE_LABELS[o.order_type]}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 tabular-nums">הזמנה #{o.id}</div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${statusBadge(o.status)}`}>
                      {ORDER_STATUS_LABELS[o.status]}
                    </span>
                  </div>

                  {/* פירוט פריטים */}
                  <div className="mt-4 bg-[#FAF6F0] rounded-xl p-3 space-y-1.5 text-xs">
                    {o.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between tabular-nums">
                        <span className="font-semibold text-slate-800">
                          {it.quantity} × {it.product_name}
                        </span>
                        <span className="text-slate-600">
                          {formatILS(it.quantity * it.unit_price_snapshot)}
                        </span>
                      </div>
                    ))}
                    {(o.delivery_fee > 0 || o.credit_discount > 0) && (
                      <div className="pt-1.5 mt-1.5 border-t border-[#E8D5BE] space-y-1 text-slate-600 tabular-nums">
                        {o.delivery_fee > 0 && (
                          <div className="flex justify-between">
                            <span>דמי משלוח</span>
                            <span>{formatILS(o.delivery_fee)}</span>
                          </div>
                        )}
                        {o.credit_discount > 0 && (
                          <div className="flex justify-between text-emerald-700">
                            <span>הנחה / זיכוי</span>
                            <span>-{formatILS(o.credit_discount)}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {o.notes && (
                    <p className="mt-2.5 text-xs text-slate-600 bg-amber-50/50 rounded-lg px-3 py-2">
                      הערה: {o.notes}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3.5 border-t border-[#F3E9DC]">
                  <div className="flex items-center justify-between tabular-nums mb-3">
                    <div>
                      <span className="text-xs text-slate-500">סה״כ להזמנה: </span>
                      <span className="font-extrabold text-slate-900 text-base">
                        {formatILS(o.total_amount)}
                      </span>
                    </div>
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
                          onClick={() => updateStatus(o.id, st)}
                          className={`px-2.5 py-1.5 flex items-center gap-1 transition-colors ${
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

                    <div className="flex items-center gap-1.5">
                      {o.order_type !== 'charity' && (
                        <button
                          type="button"
                          onClick={() => {
                            setPayOrder(o);
                            setPayValue(o.total_amount.toFixed(2));
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>עדכן תשלום</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(o.id)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
                        title="מחק הזמנה"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* מודאל יצירת הזמנה */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#E8D5BE] my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-2xl font-bold text-slate-900">יצירת הזמנה חדשה לשישי</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {(['customer', 'supplier', 'charity'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setOrderType(t);
                      setSelectedUserId('');
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      orderType === t
                        ? 'bg-[#C85A17] text-white border-[#C85A17]'
                        : 'bg-[#FDFBF7] text-slate-700 border-[#E8D5BE]'
                    }`}
                  >
                    {ORDER_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>

              {orderType === 'customer' && (
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPriceTier('preorder_price')}
                    className={`flex-1 py-2 rounded-xl font-bold border ${
                      priceTier === 'preorder_price'
                        ? 'bg-amber-50 border-amber-500 text-amber-900'
                        : 'border-[#E8D5BE] text-slate-600'
                    }`}
                  >
                    מחירון הזמנה מוקדמת
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceTier('customer_price')}
                    className={`flex-1 py-2 rounded-xl font-bold border ${
                      priceTier === 'customer_price'
                        ? 'bg-amber-50 border-amber-500 text-amber-900'
                        : 'border-[#E8D5BE] text-slate-600'
                    }`}
                  >
                    מחירון דוכן רגיל
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {orderType !== 'charity' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      שיוך לחשבון קיים (אופציונלי)
                    </label>
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        const uid = e.target.value;
                        setSelectedUserId(uid);
                        const found = users.find((u) => String(u.id) === uid);
                        if (found) setRecipientName(found.name);
                      }}
                      className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                    >
                      <option value="">ללא שיוך (לקוח מזדמן)</option>
                      {users
                        .filter((u) => (orderType === 'supplier' ? u.role === 'supplier' : u.role !== 'admin'))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.phone || u.email})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">שם מקבל ההזמנה</label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="שם מלא / בית עסק / עמותה"
                    className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                  />
                </div>
              </div>

              {/* בחירת מוצרים */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">בחירת מוצרים וכמויות</label>
                <div className="max-h-56 overflow-y-auto border border-[#E8D5BE] rounded-2xl divide-y divide-[#F3E9DC]">
                  {products.map((p) => {
                    const price =
                      orderType === 'charity'
                        ? 0
                        : orderType === 'supplier'
                        ? p.supplier_price
                        : p[priceTier];
                    const q = quantities[p.id] || 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 bg-white">
                        <div>
                          <div className="font-bold text-sm text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-500 tabular-nums">{formatILS(price)} ליח׳</div>
                        </div>
                        <div className="flex items-center gap-2">
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
                            inputMode="numeric"
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

              {orderType !== 'charity' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">משלוח (₪)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      dir="ltr"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">זיכוי/הנחה (₪)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      dir="ltr"
                      value={creditDiscount}
                      onChange={(e) => setCreditDiscount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">שולם מראש (₪)</label>
                    <input
                      type="number"
                      inputMode="decimal"
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
                      {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                        <option key={pm} value={pm}>
                          {PAYMENT_METHOD_LABELS[pm]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערות להזמנה</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="שעת איסוף, אריזה מיוחדת וכו׳"
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>

              <div className="bg-[#FAF6F0] rounded-2xl p-4 border border-[#E8D5BE] flex items-center justify-between">
                <span className="font-bold text-slate-700">סה״כ לתשלום:</span>
                <span className="font-extrabold text-2xl text-[#C85A17] tabular-nums">
                  {formatILS(draftTotal)}
                </span>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
                >
                  {submitting ? 'שומר הזמנה...' : 'שמור הזמנה'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-5 py-3 rounded-xl border border-[#E8D5BE] text-slate-600 font-semibold text-sm"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* מודאל עדכון תשלום */}
      {payOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <h3 className="font-serif text-xl font-bold text-slate-900 mb-1">עדכון תשלום להזמנה #{payOrder.id}</h3>
            <p className="text-xs text-slate-500 mb-4">
              {payOrder.recipient_name} · סה״כ הזמנה: {formatILS(payOrder.total_amount)}
            </p>
            <form onSubmit={handleSavePayment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">סה״כ ששולם עד כה (₪)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  required
                  dir="ltr"
                  value={payValue}
                  onChange={(e) => setPayValue(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">אמצעי תשלום להפרש</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-sm"
                >
                  {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                    <option key={pm} value={pm}>
                      {PAYMENT_METHOD_LABELS[pm]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
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
    </div>
  );
}
