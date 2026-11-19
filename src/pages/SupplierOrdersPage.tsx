import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Store,
  Plus,
  Minus,
  CreditCard,
  RotateCcw,
  Copy,
  Check,
  Edit3,
  Trash2,
  Share2,
  Search,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { filterUsersByNameOrPhone, getPhoneLast4 } from '../lib/whatsappParser';
import {
  formatFridayLabel,
  formatHebrewDate,
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { buildWhatsAppShareUrl, formatSupplierLedgerWhatsApp } from '../lib/whatsappFormat';
import { useFriday } from '../context/FridayContext';
import { BottomSheet } from '../components/BottomSheet';
import type { AdminProduct, Order, OrderStatus, PaymentMethod, Transaction, User } from '../types';

const NEXT_STATUS: Record<OrderStatus, OrderStatus> = {
  awaiting_approval: 'pending',
  pending: 'ready',
  ready: 'delivered',
  delivered: 'pending',
};

export function SupplierOrdersPage() {
  const { fridayDate: globalFriday, refreshTick } = useFriday();
  const [suppliers, setSuppliers] = useState<User[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
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

  // חלונית הזמנת ספק (יצירה / עריכה)
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [orderFriday, setOrderFriday] = useState(getNextFridayISO());
  const [orderDeliveryFee, setOrderDeliveryFee] = useState('0');
  const [orderDiscountMode, setOrderDiscountMode] = useState<'fixed' | 'percent'>('fixed');
  const [orderCredit, setOrderCredit] = useState('0');
  const [orderIncludeVat, setOrderIncludeVat] = useState(false);
  const [orderPaid, setOrderPaid] = useState('0');
  const [orderPayMethod, setOrderPayMethod] = useState<PaymentMethod>('transfer');
  const [orderNotes, setOrderNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [savingOrder, setSavingOrder] = useState(false);

  // חלונית תשלום ספק
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('transfer');
  const [payNotes, setPayNotes] = useState('');

  // חלונית זכות / החזרה
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
  }, [selectedSupplierId, loadLedger, refreshTick]);

  const ledgerRowsWithRunning = useMemo(() => {
    if (!ledger) return [];
    const chronological = [...ledger.orders].sort(
      (a, b) => a.friday_date.localeCompare(b.friday_date) || a.id - b.id
    );
    let runningDebt = 0;
    const computed = chronological.map((o) => {
      runningDebt += o.total_amount - o.paid_amount;
      return { ...o, runningDebt };
    });
    return computed.reverse();
  }, [ledger]);

  const filteredSuppliers = useMemo(
    () => filterUsersByNameOrPhone(supplierSearch, suppliers),
    [supplierSearch, suppliers]
  );

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) || null,
    [suppliers, selectedSupplierId]
  );

  const getSupplierUnitPrice = (p: AdminProduct) => {
    const ov = selectedSupplier?.custom_prices?.[p.id];
    return ov !== undefined && !Number.isNaN(Number(ov)) && Number(ov) >= 0 ? Number(ov) : p.supplier_price;
  };

  const draftTotals = useMemo(() => {
    let sub = 0;
    for (const p of products) {
      const q = quantities[p.id] || 0;
      if (q > 0) sub += q * getSupplierUnitPrice(p);
    }
    const dv = Math.max(0, Number(orderCredit) || 0);
    const discILS =
      orderDiscountMode === 'percent' ? Math.round(((sub * Math.min(100, dv)) / 100) * 100) / 100 : dv;
    const preVat = Math.max(0, Math.round((sub + (Number(orderDeliveryFee) || 0) - discILS) * 100) / 100);
    const vat = orderIncludeVat ? Math.round(preVat * 0.18 * 100) / 100 : 0;
    return { total: Math.round((preVat + vat) * 100) / 100, vat, discILS };
  }, [products, quantities, orderCredit, orderDiscountMode, orderDeliveryFee, orderIncludeVat, selectedSupplier]);

  const openNewSupplierOrder = () => {
    setEditingOrder(null);
    setOrderFriday(globalFriday || getNextFridayISO());
    setOrderDeliveryFee('0');
    if ((selectedSupplier?.discount_percent ?? 0) > 0) {
      setOrderDiscountMode('percent');
      setOrderCredit(String(selectedSupplier?.discount_percent));
    } else {
      setOrderDiscountMode('fixed');
      setOrderCredit('0');
    }
    setOrderIncludeVat(false);
    setOrderPaid('0');
    setOrderPayMethod('transfer');
    setOrderNotes('');
    setQuantities({});
    setOrderModalOpen(true);
  };

  const openEditSupplierOrder = (o: Order) => {
    setEditingOrder(o);
    setOrderFriday(o.friday_date);
    setOrderDeliveryFee(String(o.delivery_fee || 0));
    if ((o.discount_percent ?? 0) > 0) {
      setOrderDiscountMode('percent');
      setOrderCredit(String(o.discount_percent));
    } else {
      setOrderDiscountMode('fixed');
      setOrderCredit(String(o.credit_discount));
    }
    setOrderIncludeVat(Boolean(o.include_vat));
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
      const dv = Math.max(0, Number(orderCredit) || 0);
      const pricingExtras = {
        delivery_fee: Number(orderDeliveryFee) || 0,
        credit_discount: orderDiscountMode === 'fixed' ? dv : 0,
        discount_percent: orderDiscountMode === 'percent' ? Math.min(100, dv) : 0,
        include_vat: orderIncludeVat,
      };
      if (editingOrder) {
        await apiFetch(`/api/orders/${editingOrder.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            friday_date: orderFriday,
            recipient_name: ledger.user.name,
            ...pricingExtras,
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
            ...pricingExtras,
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

  const handleCycleStatus = async (order: Order) => {
    const next = NEXT_STATUS[order.status];
    await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next }),
    });
    if (selectedSupplierId) await loadLedger(selectedSupplierId);
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

  const ledgerWaText = ledger ? formatSupplierLedgerWhatsApp(ledger.user, ledger.orders) : '';

  const copyLedgerWhatsApp = async () => {
    if (!ledgerWaText) return;
    await navigator.clipboard.writeText(ledgerWaText);
    setCopiedLedger(true);
    setTimeout(() => setCopiedLedger(false), 1800);
  };

  return (
    <div className="space-y-5">
      <div className="hidden md:block">
        <h2 className="font-serif text-3xl font-bold text-slateink-800">הזמנות ספקים וכרטסת חובות</h2>
        <p className="text-sm text-slate-600 mt-1">
          מעקב סיטונאי לכל ספק לפי תאריכי שישי: הזמנות, זכויות והחזרות, תשלומים וחוב מצטבר.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-[#E8D5BE]">
          טוען רשימת ספקים...
        </div>
      ) : suppliers.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-[#E8D5BE]">
          אין ספקים מוגדרים עדיין. הוסף ספק במסך ההגדרות.
        </div>
      ) : (
        <>
          {/* חיפוש ספק מהיר לפי שם או 4 ספרות אחרונות */}
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={supplierSearch}
              onChange={(e) => setSupplierSearch(e.target.value)}
              placeholder="חיפוש ספק לפי שם או 4 ספרות אחרונות..."
              className="w-full pr-10 pl-4 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm"
            />
          </div>

          {/* רצועת ספקים נגללת בנוחות במובייל ורשת בדסקטופ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredSuppliers.map((sup) => {
              const selected = sup.id === selectedSupplierId;
              const isDebt = sup.balance < 0;
              return (
                <button
                  key={sup.id}
                  type="button"
                  onClick={() => setSelectedSupplierId(sup.id)}
                  className={`text-right p-3.5 rounded-2xl border transition-all ${
                    selected
                      ? 'bg-[#1E242B] text-white border-[#1E242B] shadow-card'
                      : 'bg-white border-[#E8D5BE] hover:border-[#C85A17] text-slate-900 shadow-soft'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-sm">
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
                </button>
              );
            })}
          </div>

          {ledger && (
            <div className="space-y-4">
              {/* כרטיס יתרת הספק + פעולות */}
              <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-500">כרטסת ספק פעילה</div>
                    <h3 className="font-serif text-2xl font-bold text-slate-900">{ledger.user.name}</h3>
                  </div>
                  <div className="text-left tabular-nums">
                    <div className="text-[11px] text-slate-500">מצב חשבון</div>
                    <div
                      className={`font-extrabold text-xl ${
                        ledger.user.balance < 0
                          ? 'text-red-600'
                          : ledger.user.balance > 0
                          ? 'text-emerald-700'
                          : 'text-slate-900'
                      }`}
                    >
                      {ledger.user.balance < 0
                        ? `חוב ${formatILS(Math.abs(ledger.user.balance))}`
                        : ledger.user.balance > 0
                        ? `זכות ${formatILS(ledger.user.balance)}`
                        : 'מאוזן'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openNewSupplierOrder}
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-xs font-bold shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>הזמנה חדשה</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPayAmount(ledger.user.balance < 0 ? Math.abs(ledger.user.balance).toFixed(2) : '');
                      setPayModalOpen(true);
                    }}
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>תשלום ששולם</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreditModalOpen(true)}
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>זכות / החזרה</span>
                  </button>
                  <a
                    href={buildWhatsAppShareUrl(ledgerWaText, ledger.user.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3.5 rounded-xl bg-[#25D366]/15 border border-[#25D366]/40 text-emerald-900 text-xs font-bold"
                  >
                    <Share2 className="w-4 h-4 text-[#128C7E]" />
                    <span>שלח בוואטסאפ</span>
                  </a>
                  <button
                    type="button"
                    onClick={copyLedgerWhatsApp}
                    className="hidden sm:inline-flex min-h-[44px] items-center gap-1.5 px-3.5 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] text-slate-700 text-xs font-bold"
                  >
                    {copiedLedger ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLedger ? 'הועתק!' : 'העתק כרטסת'}</span>
                  </button>
                </div>
              </div>

              {/* כרטיסיות למובייל (< md) במקום טבלה רחבה */}
              <div className="md:hidden space-y-3">
                {ledgerRowsWithRunning.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-[#E8D5BE] p-8 text-center text-slate-400 text-sm">
                    אין עדיין הזמנות לספק זה.
                  </div>
                ) : (
                  ledgerRowsWithRunning.map((o) => (
                    <div
                      key={o.id}
                      className="bg-white rounded-2xl border border-[#E8D5BE] shadow-soft p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900">{formatFridayLabel(o.friday_date)}</div>
                          <div className="text-xs text-slate-400 tabular-nums">הזמנה #{o.id}</div>
                        </div>
                        <div className="text-left tabular-nums">
                          <div className="font-extrabold text-base text-slate-900">
                            {formatILS(o.total_amount)}
                          </div>
                          <div className="text-[11px] font-bold text-red-600">
                            חוב מצטבר: {formatILS(o.runningDebt)}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {o.items.map((it) => (
                          <span
                            key={it.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF6F0] border border-[#E8D5BE] text-xs font-bold text-slate-800 tabular-nums"
                          >
                            <span className="text-[#C85A17] font-extrabold">{it.quantity}</span>
                            <span>{it.product_name}</span>
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between text-xs tabular-nums pt-2 border-t border-[#F3E9DC]">
                        <div className="flex gap-3">
                          <span className="text-emerald-700 font-bold">שולם: {formatILS(o.paid_amount)}</span>
                          {o.credit_discount > 0 && (
                            <span className="text-amber-700 font-bold">
                              זכות: {formatILS(o.credit_discount)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCycleStatus(o)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#E8D5BE] font-bold text-slate-800"
                          >
                            {ORDER_STATUS_LABELS[o.status]}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditSupplierOrder(o)}
                            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(o.id)}
                            className="p-2 rounded-lg text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* טבלת מטריצה לדסקטופ (>= md) */}
              <div className="hidden md:block bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
                <div className="px-5 py-4 border-b border-[#F3E9DC] flex items-center justify-between">
                  <h4 className="font-bold text-base text-slate-900">פירוט הזמנות לפי תאריך שישי</h4>
                  <span className="text-xs text-slate-500 tabular-nums">{ledger.orders.length} הזמנות</span>
                </div>
                {ledgerRowsWithRunning.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-sm">אין עדיין הזמנות לספק זה.</div>
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
                          <th className="text-left py-3 px-3 font-bold">חוב מצטבר</th>
                          <th className="text-center py-3 px-3 font-bold">סטטוס</th>
                          <th className="text-center py-3 px-3 font-bold">פעולות</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F3E9DC] tabular-nums">
                        {ledgerRowsWithRunning.map((o) => (
                          <tr key={o.id} className="hover:bg-[#FDFBF7]">
                            <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                              <div>{formatFridayLabel(o.friday_date)}</div>
                              <div className="text-[11px] text-slate-400">#{o.id}</div>
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-700 max-w-xs">
                              {o.items.map((it) => `${it.quantity} ${it.product_name}`).join(' · ')}
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
                              <button
                                type="button"
                                onClick={() => handleCycleStatus(o)}
                                className="px-2.5 py-1 rounded-full text-xs font-bold bg-[#FAF6F0] border border-[#E8D5BE] hover:border-[#C85A17]"
                              >
                                {ORDER_STATUS_LABELS[o.status]}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => openEditSupplierOrder(o)}
                                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteOrder(o.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
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

              {/* תשלומים שתועדו */}
              <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 sm:p-5">
                <h4 className="font-bold text-base text-slate-900 mb-3">
                  תשלומים שהתקבלו ({ledger.transactions.length})
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

      {/* חלונית Bottom Sheet הזמנת ספק */}
      <BottomSheet
        open={orderModalOpen && Boolean(ledger)}
        onClose={() => setOrderModalOpen(false)}
        title={
          editingOrder
            ? `עריכת הזמנת ספק #${editingOrder.id}`
            : `הזמנת ספק חדשה — ${ledger?.user.name || ''}`
        }
        subtitle="תמחור אוטומטי לפי מחיר ספק (supplier_price)"
        maxWidthClass="md:max-w-2xl"
      >
        <form onSubmit={handleSaveSupplierOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך שישי</label>
              <input
                type="date"
                required
                value={orderFriday}
                onChange={(e) => setOrderFriday(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">משלוח (₪)</label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                dir="ltr"
                value={orderDeliveryFee}
                onChange={(e) => setOrderDeliveryFee(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-600">הנחה / זיכוי</label>
                <button
                  type="button"
                  onClick={() => setOrderDiscountMode((m) => (m === 'fixed' ? 'percent' : 'fixed'))}
                  className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900"
                >
                  {orderDiscountMode === 'fixed' ? '₪' : '%'}
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                dir="ltr"
                value={orderCredit}
                onChange={(e) => setOrderCredit(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={orderIncludeVat}
              onChange={(e) => setOrderIncludeVat(e.target.checked)}
              className="w-4 h-4 rounded accent-[#C85A17]"
            />
            <span className="text-xs font-bold text-slate-800">+ מע״מ 18%</span>
            {orderIncludeVat && (
              <span className="text-xs font-extrabold text-[#C85A17] tabular-nums">
                ({formatILS(draftTotals.vat)})
              </span>
            )}
          </label>

          <div className="max-h-60 overflow-y-auto border border-[#E8D5BE] rounded-2xl divide-y divide-[#F3E9DC]">
            {products.map((p) => {
              const q = quantities[p.id] || 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between px-3.5 py-2.5 ${
                    q > 0 ? 'bg-[#FFF7ED]/70' : 'bg-white'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm">{p.name}</div>
                    <div className="text-xs text-[#8A330B] font-semibold tabular-nums">
                      {formatILS(getSupplierUnitPrice(p))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setQuantities((prev) => ({
                          ...prev,
                          [p.id]: Math.max(0, (prev[p.id] || 0) - 5),
                        }))
                      }
                      className="w-9 h-10 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] text-xs font-bold"
                    >
                      -5
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
                      className="w-16 h-10 text-center rounded-xl border border-[#E8D5BE] tabular-nums font-bold"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setQuantities((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 5 }))
                      }
                      className="w-9 h-10 rounded-xl bg-[#C85A17] text-white text-xs font-bold"
                    >
                      +5
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {!editingOrder && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">שולם במעמד ההזמנה (₪)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.5"
                  dir="ltr"
                  value={orderPaid}
                  onChange={(e) => setOrderPaid(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
                <select
                  value={orderPayMethod}
                  onChange={(e) => setOrderPayMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE]"
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

          <input
            type="text"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="הערות להזמנה"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE]"
          />

          <div className="bg-[#FAF6F0] rounded-2xl p-4 border border-[#E8D5BE] flex items-center justify-between">
            <span className="font-bold text-slate-700">סה״כ לחיוב ספק:</span>
            <span className="font-extrabold text-2xl text-[#C85A17] tabular-nums">
              {formatILS(draftTotals.total)}
            </span>
          </div>

          <button
            type="submit"
            disabled={savingOrder}
            className="w-full min-h-[50px] rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-base"
          >
            {savingOrder ? 'שומר...' : editingOrder ? 'עדכן הזמנה' : 'שמור הזמנה'}
          </button>
        </form>
      </BottomSheet>

      {/* חלונית תשלום ספק */}
      <BottomSheet
        open={payModalOpen && Boolean(ledger)}
        onClose={() => setPayModalOpen(false)}
        title={`תשלום ששולם — ${ledger?.user.name || ''}`}
        subtitle="מעדכן אוטומטית את היתרה ונרשם כהכנסה ביומן התנועות"
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">סכום שהתקבל (₪)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              dir="ltr"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8D5BE] text-left tabular-nums font-extrabold text-xl"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">אמצעי תשלום</label>
            <div className="grid grid-cols-3 gap-2">
              {(['transfer', 'bit', 'cash'] as const).map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPayMethod(pm)}
                  className={`min-h-[48px] rounded-xl border-2 text-xs font-bold ${
                    payMethod === pm
                      ? 'border-[#C85A17] bg-[#FFF7ED] text-[#8A330B]'
                      : 'border-[#E8D5BE] bg-[#FDFBF7] text-slate-600'
                  }`}
                >
                  {PAYMENT_METHOD_LABELS[pm]}
                </button>
              ))}
            </div>
          </div>
          <input
            type="text"
            value={payNotes}
            onChange={(e) => setPayNotes(e.target.value)}
            placeholder="אסמכתא / הערה"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE]"
          />
          <button
            type="submit"
            className="w-full min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base"
          >
            אשר ורשום תשלום
          </button>
        </form>
      </BottomSheet>

      {/* חלונית זכות / החזרה */}
      <BottomSheet
        open={creditModalOpen && Boolean(ledger)}
        onClose={() => setCreditModalOpen(false)}
        title={`זכות / החזרה — ${ledger?.user.name || ''}`}
        subtitle="מפחית את החוב הפתוח ללא רישום הכנסה בקופה"
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleRecordCredit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">סכום הזיכוי (₪)</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              required
              dir="ltr"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-[#E8D5BE] text-left tabular-nums font-extrabold text-xl"
            />
          </div>
          {ledger && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">שיוך להזמנה (אופציונלי)</label>
              <select
                value={creditOrderId}
                onChange={(e) => setCreditOrderId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE]"
              >
                <option value="">זיכוי כללי לחשבון הספק</option>
                {ledger.orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    #{o.id} — {o.friday_date} ({formatILS(o.total_amount)})
                  </option>
                ))}
              </select>
            </div>
          )}
          <input
            type="text"
            required
            value={creditNotes}
            onChange={(e) => setCreditNotes(e.target.value)}
            placeholder="סיבת ההחזרה / זיכוי"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE]"
          />
          <button
            type="submit"
            className="w-full min-h-[50px] rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-base"
          >
            רשום זיכוי
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
