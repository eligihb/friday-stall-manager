import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Store,
  Plus,
  CreditCard,
  RotateCcw,
  Copy,
  Check,
  Edit3,
  Trash2,
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
import { formatSupplierLedgerWhatsApp } from '../lib/whatsappFormat';
import type { AdminProduct, Order, PaymentMethod, Transaction, User } from '../types';

export function SupplierOrdersPage() {
  const [suppliers, setSuppliers] = useState<User[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [ledger, setLedger] = useState<{
    user: User;
    orders: Order[];
    transactions: Transaction[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedLedger, setCopiedLedger] = useState(false);

  // מודאל הזמנת ספק (יצירה / עריכה)
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderFriday, setOrderFriday] = useState(getNextFridayISO());
  const [orderCredit, setOrderCredit] = useState('0');
  const [orderPaid, setOrderPaid] = useState('0');
  const [orderPayMethod, setOrderPayMethod] = useState<PaymentMethod>('transfer');
  const [orderNotes, setOrderNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [savingOrder, setSavingOrder] = useState(false);

  // מודאל תשלום ספק
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('transfer');
  const [payNotes, setPayNotes] = useState('');

  // מודאל זכות / החזרה
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditOrderId, setCreditOrderId] = useState<string>('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditNotes, setCreditNotes] = useState('');

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    try {
      const [usrRes, prodRes] = await Promise.all([
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
      ]);
      const sups = usrRes.users.filter((u) => u.role === 'supplier');
      setSuppliers(sups);
      setProducts(prodRes.products.filter((p) => p.is_active));
      setSelectedSupplierId((cur) => cur ?? (sups[0]?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הספקים');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLedger = useCallback(async (supId: number) => {
    try {
      const res = await apiFetch<{ user: User; orders: Order[]; transactions: Transaction[] }>(
        `/api/users/${supId}/ledger`
      );
      setLedger(res);
      // עדכון היתרה בכרטיס הספק למעלה
      setSuppliers((prev) => prev.map((s) => (s.id === supId ? { ...s, balance: res.user.balance } : s)));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת כרטסת הספק');
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (selectedSupplierId) {
      loadLedger(selectedSupplierId);
    }
  }, [selectedSupplierId, loadLedger]);

  // חישוב חוב מצטבר (Running Debt) לפי סדר כרונולוגי בכרטסת הספק
  const ledgerRowsWithRunning = useMemo(() => {
    if (!ledger) return [];
    const chronological = [...ledger.orders].sort((a, b) =>
      a.friday_date.localeCompare(b.friday_date) || a.id - b.id
    );
    let runningDebt = 0;
    const computed = chronological.map((o) => {
      const netDelta = o.total_amount - o.paid_amount;
      runningDebt += netDelta;
      return { ...o, runningDebt };
    });
    return computed.reverse(); // תצוגה מהחדש לישן
  }, [ledger]);

  const draftOrderTotal = useMemo(() => {
    let sub = 0;
    for (const p of products) {
      const q = quantities[p.id] || 0;
      if (q > 0) sub += q * p.supplier_price;
    }
    return Math.max(0, sub - (Number(orderCredit) || 0));
  }, [products, quantities, orderCredit]);

  const openNewSupplierOrder = () => {
    setEditingOrder(null);
    setOrderFriday(getNextFridayISO());
    setOrderCredit('0');
    setOrderPaid('0');
    setOrderPayMethod('transfer');
    setOrderNotes('');
    setQuantities({});
    setOrderModalOpen(true);
  };

  const openEditSupplierOrder = (o: Order) => {
    setEditingOrder(o);
    setOrderFriday(o.friday_date);
    setOrderCredit(String(o.credit_discount));
    setOrderPaid(String(o.paid_amount));
    setOrderNotes(o.notes);
    const qMap: Record<number, number> = {};
    for (const it of o.items) {
      qMap[it.product_id] = it.quantity;
    }
    setQuantities(qMap);
    setOrderModalOpen(true);
  };

  const handleSaveSupplierOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !ledger) return;
    const items = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));
    if (items.length === 0) {
      setError('יש לבחור לפחות מוצר אחד');
      return;
    }

    setSavingOrder(true);
    try {
      if (editingOrder) {
        await apiFetch(`/api/orders/${editingOrder.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            friday_date: orderFriday,
            recipient_name: ledger.user.name,
            credit_discount: Number(orderCredit) || 0,
            notes: orderNotes.trim(),
            items,
          }),
        });
      } else {
        await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify({
            friday_date: orderFriday,
            order_type: 'supplier',
            user_id: selectedSupplierId,
            recipient_name: ledger.user.name,
            credit_discount: Number(orderCredit) || 0,
            paid_amount: Number(orderPaid) || 0,
            payment_method: orderPayMethod,
            notes: orderNotes.trim(),
            items,
          }),
        });
      }
      setOrderModalOpen(false);
      await loadLedger(selectedSupplierId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת הזמנת הספק');
    } finally {
      setSavingOrder(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) return;
    try {
      await apiFetch(`/api/users/${selectedSupplierId}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payAmount),
          payment_method: payMethod,
          notes: payNotes.trim(),
        }),
      });
      setPayModalOpen(false);
      setPayAmount('');
      setPayNotes('');
      await loadLedger(selectedSupplierId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום התשלום');
    }
  };

  const handleRecordCredit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) return;
    try {
      await apiFetch(`/api/users/${selectedSupplierId}/credit`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(creditAmount),
          order_id: creditOrderId ? Number(creditOrderId) : null,
          notes: creditNotes.trim(),
        }),
      });
      setCreditModalOpen(false);
      setCreditAmount('');
      setCreditOrderId('');
      setCreditNotes('');
      await loadLedger(selectedSupplierId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ברישום הזכות/החזרה');
    }
  };

  const handleDeleteOrder = async (id: number) => {
    if (!selectedSupplierId || !window.confirm('למחוק הזמנת ספק זו? יתרת החוב תתעדכן בהתאם.')) return;
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    await loadLedger(selectedSupplierId);
  };

  const copyLedgerWhatsApp = async () => {
    if (!ledger) return;
    await navigator.clipboard.writeText(formatSupplierLedgerWhatsApp(ledger.user, ledger.orders));
    setCopiedLedger(true);
    setTimeout(() => setCopiedLedger(false), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">הזמנות ספקים וכרטסת חובות</h2>
          <p className="text-sm text-slate-600 mt-1">
            מעקב סיטונאי לכל ספק לפי תאריכי שישי: הזמנות, זכויות והחזרות, תשלומים וחוב מצטבר מעודכן אוטומטית.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {/* רצועת בחירת ספקים */}
      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-[#E8D5BE]">
          טוען רשימת ספקים...
        </div>
      ) : suppliers.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-[#E8D5BE]">
          אין ספקים מוגדרים עדיין. הוסף ספק במסך ״משתמשים וחשבונות״.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {suppliers.map((sup) => {
              const selected = sup.id === selectedSupplierId;
              const isDebt = sup.balance < 0;
              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() => setSelectedSupplierId(sup.id)}
                  className={`text-right p-4 rounded-2xl border transition-all ${
                    selected
                      ? 'bg-[#1E242B] text-white border-[#1E242B] shadow-card'
                      : 'bg-white border-[#E8D5BE] hover:border-[#C85A17] text-slate-900 shadow-soft'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold">
                      <Store className={`w-4 h-4 ${selected ? 'text-amber-400' : 'text-[#C85A17]'}`} />
                      <span>{sup.name}</span>
                    </div>
                    <span
                      className={`text-xs font-extrabold tabular-nums px-2.5 py-0.5 rounded-full ${
                        isDebt
                          ? selected
                            ? 'bg-red-500/25 text-red-200'
                            : 'bg-red-50 text-red-700'
                          : selected
                          ? 'bg-emerald-500/25 text-emerald-200'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {isDebt
                        ? `חוב ${formatILS(Math.abs(sup.balance))}`
                        : sup.balance > 0
                        ? `זכות ${formatILS(sup.balance)}`
                        : 'מאוזן'}
                    </span>
                  </div>
                  <div className={`text-xs mt-1.5 tabular-nums ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
                    {sup.phone || sup.email}
                  </div>
                </button>
              );
            })}
          </div>

          {/* כרטסת הספק הנבחר */}
          {ledger && (
            <div className="space-y-5">
              {/* סרגל פעולות ומאזן נוכחי */}
              <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-slate-500">כרטסת ספק פעילה</div>
                  <h3 className="font-serif text-2xl font-bold text-slate-900 mt-0.5">{ledger.user.name}</h3>
                  <div className="mt-1.5 flex items-center gap-3 text-sm tabular-nums">
                    <span className="text-slate-500">מצב חשבון נוכחי:</span>
                    <span
                      className={`font-extrabold text-lg ${
                        ledger.user.balance < 0
                          ? 'text-red-600'
                          : ledger.user.balance > 0
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {ledger.user.balance < 0
                        ? `חוב פתוח ${formatILS(Math.abs(ledger.user.balance))}`
                        : ledger.user.balance > 0
                        ? `זכות ${formatILS(ledger.user.balance)}`
                        : 'מאוזן (₪0.00)'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openNewSupplierOrder}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-bold shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>הזמנת ספק חדשה</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPayAmount(ledger.user.balance < 0 ? Math.abs(ledger.user.balance).toFixed(2) : '');
                      setPayModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>תשלום ששולם</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreditModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>זכות / החזרה</span>
                  </button>
                  <button
                    type="button"
                    onClick={copyLedgerWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] hover:bg-[#F3E9DC] border border-[#E8D5BE] text-slate-700 text-xs font-bold"
                  >
                    {copiedLedger ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLedger ? 'הועתק!' : 'שלח כרטסת'}</span>
                  </button>
                </div>
              </div>

              {/* טבלת מטריצה / היסטוריית הזמנות לפי שישי */}
              <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
                <div className="px-5 py-4 border-b border-[#F3E9DC] flex items-center justify-between">
                  <h4 className="font-bold text-base text-slate-900">פירוט הזמנות לפי תאריך שישי</h4>
                  <span className="text-xs text-slate-500 tabular-nums">{ledger.orders.length} הזמנות</span>
                </div>

                {ledgerRowsWithRunning.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">
                    אין עדיין הזמנות לספק זה.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#F3E9DC]/70 text-slate-700 border-b border-[#E8D5BE]">
                          <th className="text-right py-3 px-4 font-bold">תאריך שישי</th>
                          <th className="text-right py-3 px-4 font-bold">פריטים</th>
                          <th className="text-left py-3 px-3 font-bold">חיוב הזמנה</th>
                          <th className="text-left py-3 px-3 font-bold">זכות / החזרה</th>
                          <th className="text-left py-3 px-3 font-bold">שולם בהזמנה</th>
                          <th className="text-left py-3 px-3 font-bold">חוב מצטבר (הזמנות)</th>
                          <th className="text-center py-3 px-3 font-bold">סטטוס</th>
                          <th className="text-center py-3 px-3 font-bold">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3E9DC] tabular-nums">
                        {ledgerRowsWithRunning.map((o) => (
                          <tr key={o.id} className="hover:bg-[#FDFBF7]">
                            <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                              <div>{formatFridayLabel(o.friday_date)}</div>
                              <div className="text-[11px] text-slate-400">הזמנה #{o.id}</div>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-700 max-w-xs">
                              {o.items.map((it) => `${it.quantity} ${it.product_name}`).join(' · ')}
                              {o.notes && <div className="text-slate-400 mt-0.5">{o.notes}</div>}
                            </td>
                            <td className="py-3 px-3 text-left font-extrabold text-slate-900">
                              {formatILS(o.total_amount)}
                            </td>
                            <td className="py-3 px-3 text-left font-bold text-amber-700">
                              {o.credit_discount > 0 ? formatILS(o.credit_discount) : '—'}
                            </td>
                            <td className="py-3 px-3 text-left font-bold text-emerald-700">
                              {formatILS(o.paid_amount)}
                            </td>
                            <td className="py-3 px-3 text-left font-extrabold text-red-700">
                              {formatILS(o.runningDebt)}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF6F0] border border-[#E8D5BE]">
                                {ORDER_STATUS_LABELS[o.status]}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditSupplierOrder(o)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                                title="ערוך"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(o.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="מחק"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* היסטוריית תשלומים שהתקבלו מהספק */}
              <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-5">
                <h4 className="font-bold text-base text-slate-900 mb-3">
                  תשלומים שהתקבלו ותועדו בתזרים ({ledger.transactions.length})
                </h4>
                {ledger.transactions.length === 0 ? (
                  <p className="text-xs text-slate-400">טרם תועדו תשלומים עבור ספק זה.</p>
                ) : (
                  <div className="divide-y divide-[#F3E9DC]">
                    {ledger.transactions.map((t) => (
                      <div key={t.id} className="py-2.5 flex items-center justify-between text-xs tabular-nums">
                        <div>
                          <span className="font-bold text-slate-800">{t.category}</span> ·{' '}
                          {formatHebrewDate(t.date)} · {PAYMENT_METHOD_LABELS[t.payment_method]}
                          {t.notes && <span className="text-slate-400"> ({t.notes})</span>}
                        </div>
                        <span className="font-extrabold text-emerald-700 text-sm">
                          +{formatILS(t.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* מודאל יצירה/עריכה של הזמנת ספק */}
      {orderModalOpen && ledger && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-[#E8D5BE] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-2xl font-bold">
                {editingOrder
                  ? `עריכת הזמנת ספק #${editingOrder.id}`
                  : `הזמנת ספק חדשה — ${ledger.user.name}`}
              </h3>
              <button type="button" onClick={() => setOrderModalOpen(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplierOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך שישי</label>
                  <input
                    type="date"
                    required
                    value={orderFriday}
                    onChange={(e) => setOrderFriday(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">זכות / החזרה (₪)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    value={orderCredit}
                    onChange={(e) => setOrderCredit(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums text-sm font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  מוצרים (מחירון ספק `supplier_price`)
                </label>
                <div className="max-h-56 overflow-y-auto border border-[#E8D5BE] rounded-2xl divide-y divide-[#F3E9DC]">
                  {products.map((p) => {
                    const q = quantities[p.id] || 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between px-3.5 py-2 bg-white">
                        <div>
                          <div className="font-bold text-sm">{p.name}</div>
                          <div className="text-xs text-[#8A330B] font-semibold tabular-nums">
                            {formatILS(p.supplier_price)}
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

              {!editingOrder && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">שולם במעמד ההזמנה (₪)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      dir="ltr"
                      value={orderPaid}
                      onChange={(e) => setOrderPaid(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
                    <select
                      value={orderPayMethod}
                      onChange={(e) => setOrderPayMethod(e.target.value as PaymentMethod)}
                      className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                    >
                      {(['transfer', 'cash', 'bit'] as const).map((pm) => (
                        <option key={pm} value={pm}>
                          {PAYMENT_METHOD_LABELS[pm]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>

              <div className="bg-[#FAF6F0] rounded-2xl p-4 border border-[#E8D5BE] flex items-center justify-between">
                <span className="font-bold text-slate-700">סה״כ לחיוב ספק:</span>
                <span className="font-extrabold text-2xl text-[#C85A17] tabular-nums">
                  {formatILS(draftOrderTotal)}
                </span>
              </div>

              <div className="flex gap-2.5">
                <button
                  type="submit"
                  disabled={savingOrder}
                  className="flex-1 py-3 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm"
                >
                  {savingOrder ? 'שומר...' : editingOrder ? 'עדכן הזמנה' : 'שמור הזמנה'}
                </button>
                <button
                  type="button"
                  onClick={() => setOrderModalOpen(false)}
                  className="px-5 py-3 rounded-xl border border-[#E8D5BE] text-slate-600 font-semibold text-sm"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* מודאל רישום תשלום מספק */}
      {payModalOpen && ledger && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <h3 className="font-serif text-xl font-bold mb-1">רישום תשלום — {ledger.user.name}</h3>
            <p className="text-xs text-slate-500 mb-4">
              התשלום יעדכן אוטומטית את יתרת הספק ויירשם כהכנסה ביומן התנועות (`transactions`).
            </p>
            <form onSubmit={handleRecordPayment} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">סכום שהתקבל (₪)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
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
                  {(['transfer', 'bit', 'cash'] as const).map((pm) => (
                    <option key={pm} value={pm}>
                      {PAYMENT_METHOD_LABELS[pm]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">הערה / אסמכתא</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm"
                >
                  רשום תשלום
                </button>
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-[#E8D5BE] text-slate-600 text-sm font-semibold"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* מודאל זכות / החזרה */}
      {creditModalOpen && ledger && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-[#E8D5BE]">
            <h3 className="font-serif text-xl font-bold mb-1">רישום זכות / החזרה — {ledger.user.name}</h3>
            <p className="text-xs text-slate-500 mb-4">
              מפחית את החוב הפתוח של הספק ללא רישום הכנסה כספית.
            </p>
            <form onSubmit={handleRecordCredit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">סכום הזיכוי (₪)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  dir="ltr"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  שיוך להזמנה ספציפית (אופציונלי)
                </label>
                <select
                  value={creditOrderId}
                  onChange={(e) => setCreditOrderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                >
                  <option value="">זיכוי כללי לחשבון הספק</option>
                  {ledger.orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      #{o.id} — {o.friday_date} ({formatILS(o.total_amount)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">סיבת ההחזרה / זיכוי</label>
                <input
                  type="text"
                  required
                  value={creditNotes}
                  onChange={(e) => setCreditNotes(e.target.value)}
                  placeholder="לדוגמה: החזרת 5 יח׳ לחוח"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] text-sm"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm"
                >
                  רשום זיכוי
                </button>
                <button
                  type="button"
                  onClick={() => setCreditModalOpen(false)}
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
