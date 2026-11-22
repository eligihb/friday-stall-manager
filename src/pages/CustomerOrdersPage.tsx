import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Plus, Minus, Search, ChevronDown, ChevronUp, Users, LayoutGrid, List, ArrowDownWideNarrow } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { filterUsersByNameOrPhone, getPhoneLast4 } from '../lib/whatsappParser';
import {
  computeEffectiveOrderTotal,
  formatFridayLabel,
  formatHebrewDate,
  formatILS,
  getNextFridayISO,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../lib/format';
import { getPaymentVisualState } from '../components/SupplierInvoiceSheet';
import { useFriday } from '../context/FridayContext';
import { useContactDrawer } from '../context/ContactDrawerContext';
import { FridaySelector } from '../components/FridaySelector';
import { OrderCard } from '../components/OrderCard';
import { BottomSheet } from '../components/BottomSheet';
import { QuickPaymentSheet } from '../components/QuickPaymentSheet';
import type {
  AdminProduct,
  BusinessSettings,
  Order,
  OrderStatus,
  PaymentMethod,
  Transaction,
  User,
} from '../types';

export function CustomerOrdersPage() {
  const { fridayDate: globalFriday, refreshTick } = useFriday();
  const { openContactById } = useContactDrawer();
  const [fridayDate, setFridayDate] = useState(globalFriday);
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [sortBy, setSortBy] = useState<'newest' | 'amount_desc' | 'amount_asc'>('newest');
  const [orders, setOrders] = useState<Order[]>([]);
  const [recentOrdersHistory, setRecentOrdersHistory] = useState<Order[]>([]);
  const [quickCustSearch, setQuickCustSearch] = useState('');
  const [showAllRecentCusts, setShowAllRecentCusts] = useState(false);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [bizSettings, setBizSettings] = useState<BusinessSettings | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // סנכרון מול בחירת יום השישי בכותרת המובייל
  useEffect(() => {
    setFridayDate(globalFriday);
  }, [globalFriday]);

  // חלונית Bottom Sheet יצירה / עריכה
  const [modalOpen, setModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [formFriday, setFormFriday] = useState(getNextFridayISO());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [discountMode, setDiscountMode] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState('0');
  const [includeVat, setIncludeVat] = useState(false);
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paybox');
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);

  // חלונית תשלום מהיר
  const [payOrder, setPayOrder] = useState<Order | null>(null);

  // חלונית כרטסת לקוח
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
      if (statusFilter && statusFilter !== 'pending') qs.set('status', statusFilter);

      const [ordRes, allCustOrdRes, prodRes, usrRes, setRes] = await Promise.all([
        apiFetch<{ orders: Order[] }>(`/api/orders?${qs.toString()}`),
        apiFetch<{ orders: Order[] }>('/api/orders?order_type=customer'),
        apiFetch<{ products: AdminProduct[] }>('/api/products'),
        apiFetch<{ users: User[] }>('/api/users'),
        apiFetch<{ settings: BusinessSettings }>('/api/settings'),
      ]);
      setOrders(ordRes.orders);
      setRecentOrdersHistory(allCustOrdRes.orders);
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
  }, [loadData, refreshTick]);

  const recentCustomers = useMemo(() => {
    const orderRank = new Map<number, number>();
    recentOrdersHistory.forEach((o, idx) => {
      if (o.user_id && !orderRank.has(o.user_id)) {
        orderRank.set(o.user_id, idx);
      }
    });
    return [...users].sort((a, b) => {
      const ra = orderRank.has(a.id) ? orderRank.get(a.id)! : 999999;
      const rb = orderRank.has(b.id) ? orderRank.get(b.id)! : 999999;
      if (ra !== rb) return ra - rb;
      return b.id - a.id;
    });
  }, [users, recentOrdersHistory]);

  const sortedOrders = useMemo(() => {
    let base =
      statusFilter === 'pending'
        ? orders.filter((o) => o.status === 'pending' || o.status === 'awaiting_approval')
        : orders;

    const q = quickCustSearch.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, '');
      const userById = new Map(users.map((u) => [u.id, u]));
      base = base.filter((o) => {
        const u = o.user_id ? userById.get(o.user_id) : undefined;
        const phoneDigits = String(u?.phone || '').replace(/\D/g, '');
        const itemsText = o.items.map((it) => it.product_name).join(' ').toLowerCase();
        return (
          o.recipient_name.toLowerCase().includes(q) ||
          String(o.id).includes(q) ||
          (o.notes || '').toLowerCase().includes(q) ||
          itemsText.includes(q) ||
          (qDigits.length >= 2 && phoneDigits.includes(qDigits))
        );
      });
    }

    const copy = [...base];
    if (sortBy === 'amount_desc') copy.sort((a, b) => b.total_amount - a.total_amount);
    else if (sortBy === 'amount_asc') copy.sort((a, b) => a.total_amount - b.total_amount);
    else copy.sort((a, b) => b.id - a.id);
    return copy;
  }, [orders, sortBy, statusFilter, quickCustSearch, users]);

  const quickVisibleCustomers = useMemo(() => {
    const base = quickCustSearch.trim()
      ? filterUsersByNameOrPhone(quickCustSearch, recentCustomers)
      : recentCustomers;
    return showAllRecentCusts || quickCustSearch.trim() ? base : base.slice(0, 5);
  }, [recentCustomers, quickCustSearch, showAllRecentCusts]);

  const openCreateModal = (presetUser?: User) => {
    setEditingOrder(null);
    setFormFriday(fridayDate || getNextFridayISO());
    setSelectedUserId(presetUser ? String(presetUser.id) : '');
    setUserSearch('');
    setRecipientName(presetUser ? presetUser.name : '');
    setDeliveryFee(String(bizSettings?.default_delivery_fee ?? 0));
    if (presetUser && (presetUser.discount_percent ?? 0) > 0) {
      setDiscountMode('percent');
      setDiscountValue(String(presetUser.discount_percent));
    } else {
      setDiscountMode('fixed');
      setDiscountValue('0');
    }
    setIncludeVat(false);
    setPaidAmount('0');
    setPaymentMethod('paybox');
    setNotes('');
    setQuantities({});
    setModalOpen(true);
  };

  const openEditModal = (o: Order) => {
    setEditingOrder(o);
    setFormFriday(o.friday_date);
    setSelectedUserId(o.user_id ? String(o.user_id) : '');
    setUserSearch('');
    setRecipientName(o.recipient_name);
    setDeliveryFee(String(o.delivery_fee));
    if ((o.discount_percent ?? 0) > 0) {
      setDiscountMode('percent');
      setDiscountValue(String(o.discount_percent));
    } else {
      setDiscountMode('fixed');
      setDiscountValue(String(o.credit_discount));
    }
    setIncludeVat(Boolean(o.include_vat));
    setPaidAmount(String(o.paid_amount));
    setNotes(o.notes);
    const qMap: Record<number, number> = {};
    for (const it of o.items) {
      qMap[it.product_id] = it.quantity;
    }
    setQuantities(qMap);
    setModalOpen(true);
  };

  const selectedCustomer = useMemo(
    () => users.find((u) => String(u.id) === selectedUserId) || null,
    [users, selectedUserId]
  );

  const filteredCustomers = useMemo(
    () => filterUsersByNameOrPhone(userSearch, users),
    [userSearch, users]
  );

  const getCustomerUnitPrice = (p: AdminProduct) => {
    const ov = selectedCustomer?.custom_prices?.[p.id];
    return ov !== undefined && !Number.isNaN(Number(ov)) && Number(ov) >= 0 ? Number(ov) : p.preorder_price;
  };

  const draftTotals = useMemo(() => {
    let sub = 0;
    for (const p of products) {
      const q = quantities[p.id] || 0;
      if (q > 0) sub += q * getCustomerUnitPrice(p);
    }
    const dv = Math.max(0, Number(discountValue) || 0);
    const discILS = discountMode === 'percent' ? Math.round(((sub * Math.min(100, dv)) / 100) * 100) / 100 : dv;
    const preVat = Math.max(0, Math.round((sub + (Number(deliveryFee) || 0) - discILS) * 100) / 100);
    const vat = includeVat ? Math.round(preVat * 0.18 * 100) / 100 : 0;
    return { total: Math.round((preVat + vat) * 100) / 100, vat, discILS };
  }, [products, quantities, deliveryFee, discountMode, discountValue, includeVat, selectedCustomer]);

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
      const dv = Math.max(0, Number(discountValue) || 0);
      const discPayload = {
        credit_discount: discountMode === 'fixed' ? dv : 0,
        discount_percent: discountMode === 'percent' ? Math.min(100, dv) : 0,
        include_vat: includeVat,
      };
      if (editingOrder) {
        await apiFetch(`/api/orders/${editingOrder.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            friday_date: formFriday,
            recipient_name: recipientName.trim(),
            delivery_fee: Number(deliveryFee) || 0,
            ...discPayload,
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
            ...discPayload,
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

  const handleCycleStatus = async (order: Order, nextStatus: OrderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: nextStatus } : o)));
    await apiFetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: nextStatus,
        ...(nextStatus === 'cancelled' ? { cancelled_by: 'vendor' } : {}),
      }),
    });
    if (nextStatus === 'cancelled' || order.status === 'cancelled') {
      await loadData();
    }
  };

  const handleConfirmQuickPay = async (
    orderId: number,
    paid: number,
    method: PaymentMethod
  ) => {
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'PATCH',
      body: JSON.stringify({ paid_amount: paid, payment_method: method }),
    });
    await loadData();
  };

  const handleDelete = async (id: number) => {
    setOrders((prev) => prev.filter((o) => String(o.id) !== String(id)));
    await apiFetch(`/api/orders/${id}`, { method: 'DELETE' });
    await loadData();
  };

  const openCustomerLedger = async (userId: number) => {
    const res = await apiFetch<{ user: User; orders: Order[]; transactions: Transaction[] }>(
      `/api/users/${userId}/ledger`
    );
    setLedgerData(res);
  };

  const totals = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== 'cancelled');
    const totalAmount = activeOrders.reduce((s, o) => s + computeEffectiveOrderTotal(o), 0);
    const totalPaid = activeOrders.reduce((s, o) => s + o.paid_amount, 0);
    return { totalAmount, totalPaid, unpaid: Math.max(0, totalAmount - totalPaid) };
  }, [orders]);

  return (
    <div className="space-y-4">
      {/* כותרת ובורר תאריך לדסקטופ בלבד — במובייל קיים בורר ב-Header וכפתור הזמנה חדשה בסרגל התחתון */}
      <div className="hidden md:flex md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-serif text-3xl font-bold text-slateink-800">הזמנות לקוחות</h2>
          <p className="text-sm text-slate-600 mt-1">
            יצירה ועריכת הזמנות, תיעוד תשלומים ושיתוף בוואטסאפ.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <FridaySelector value={fridayDate} onChange={setFridayDate} allowAll />
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center gap-1.5 px-4 min-h-[42px] rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-bold text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>הזמנה חדשה</span>
          </button>
        </div>
      </div>

      {/* שורת צ'יפים קומפקטית ודקה ל-5 לקוחות אחרונים */}
      {users.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative w-36 sm:w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickCustSearch}
              onChange={(e) => setQuickCustSearch(e.target.value)}
              placeholder="חיפוש חי: שם, טלפון, 4 ספרות או פריט..."
              className="w-full pr-8 pl-2 py-1.5 rounded-xl border border-[#E8D5BE] bg-white text-xs focus:border-[#C85A17] focus:outline-none"
            />
          </div>
          {quickVisibleCustomers.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => openCreateModal(u)}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-[#FFF7ED] border border-[#E8D5BE] text-xs font-bold text-slate-800 inline-flex items-center gap-1 active:scale-[0.98]"
            >
              <Plus className="w-3 h-3 text-[#C85A17] shrink-0" />
              <span>{u.name}</span>
              {getPhoneLast4(u.phone) && (
                <span className="text-[10px] text-slate-400 tabular-nums">#{getPhoneLast4(u.phone)}</span>
              )}
            </button>
          ))}
          {!quickCustSearch.trim() && recentCustomers.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAllRecentCusts((v) => !v)}
              className="px-2.5 py-1.5 rounded-xl bg-white border border-dashed border-[#C85A17]/60 text-[#8A330B] text-xs font-extrabold inline-flex items-center gap-1"
            >
              {showAllRecentCusts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              <span>{showAllRecentCusts ? 'פחות' : `+${recentCustomers.length - 5}`}</span>
            </button>
          )}
        </div>
      )}

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3 tabular-nums">
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-[11px] font-semibold text-slate-500">סה״כ</div>
          <div className="text-base sm:text-xl font-extrabold text-slate-900 mt-0.5">
            {formatILS(totals.totalAmount)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-[11px] font-semibold text-slate-500">שולם</div>
          <div className="text-base sm:text-xl font-extrabold text-emerald-700 mt-0.5">
            {formatILS(totals.totalPaid)}
          </div>
        </div>
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-[#E8D5BE]/80 shadow-soft">
          <div className="text-[11px] font-semibold text-slate-500">לגבייה</div>
          <div className="text-base sm:text-xl font-extrabold text-red-700 mt-0.5">
            {formatILS(totals.unpaid)}
          </div>
        </div>
      </div>

      {/* סינון סטטוס + מיון + מעבר תצוגת בלוקים/רשימה */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: '', label: 'הכל', activeCls: 'bg-[#1E242B] text-white' },
            { key: 'pending', label: 'ממתין', activeCls: 'bg-red-600 text-white' },
            { key: 'received', label: 'התקבל', activeCls: 'bg-blue-600 text-white' },
            { key: 'ready', label: 'מוכן למסירה', activeCls: 'bg-orange-500 text-white' },
            { key: 'delivered', label: 'נמסר', activeCls: 'bg-emerald-600 text-white' },
          ].map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                statusFilter === f.key
                  ? f.activeCls
                  : 'bg-white border border-[#E8D5BE] text-slate-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white border border-[#E8D5BE]">
            <ArrowDownWideNarrow className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'amount_desc' | 'amount_asc')}
              className="text-xs font-bold text-slate-700 bg-transparent focus:outline-none"
            >
              <option value="newest">חדש ביותר</option>
              <option value="amount_desc">סכום: גבוה לנמוך</option>
              <option value="amount_asc">סכום: נמוך לגבוה</option>
            </select>
          </div>

          <div className="inline-flex items-center p-1 rounded-xl bg-white border border-[#E8D5BE]">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'cards' ? 'bg-[#C85A17] text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="תצוגת בלוקים"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${
                viewMode === 'list' ? 'bg-[#C85A17] text-white' : 'text-slate-500 hover:text-slate-800'
              }`}
              title="תצוגת רשימה"
            >
              <List className="w-4 h-4" />
            </button>
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
          טוען הזמנות לקוחות...
        </div>
      ) : sortedOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-slate-500 border border-[#E8D5BE]">
          לא נמצאו הזמנות לקוחות לפי הסינון הנבחר.
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {sortedOrders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              bizSettings={bizSettings}
              showFridayDate={!fridayDate}
              onCycleStatus={handleCycleStatus}
              onQuickPay={(ord) => setPayOrder(ord)}
              onEdit={openEditModal}
              onDelete={handleDelete}
              onOpenLedger={openCustomerLedger}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-[#FAF6F0] border-b border-[#E8D5BE] text-xs font-bold text-slate-600">
                <tr>
                  <th className="py-3 px-4">לקוח</th>
                  <th className="py-3 px-3">פריטים</th>
                  <th className="py-3 px-3">סטטוס</th>
                  <th className="py-3 px-3">סכום</th>
                  <th className="py-3 px-3">תשלום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3E9DC]">
                {sortedOrders.map((o) => {
                  const payState = getPaymentVisualState(o);
                  return (
                    <tr
                      key={o.id}
                      onClick={() => openEditModal(o)}
                      className="hover:bg-[#FFFBF5] cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        {o.user_id ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openContactById(o.user_id!);
                            }}
                            className="font-bold text-slate-900 hover:text-[#C85A17] hover:underline"
                          >
                            {o.recipient_name}
                          </button>
                        ) : (
                          <span className="font-bold text-slate-900">{o.recipient_name}</span>
                        )}
                        <div className="text-[11px] text-slate-400 tabular-nums">#{o.id}</div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 max-w-[260px] truncate">
                        {o.items.map((it) => `${it.quantity}× ${it.product_name}`).join(', ')}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold text-white ${
                            o.status === 'delivered'
                              ? 'bg-emerald-600'
                              : o.status === 'ready'
                              ? 'bg-orange-500'
                              : o.status === 'received'
                              ? 'bg-blue-600'
                              : 'bg-red-600'
                          }`}
                        >
                          {ORDER_STATUS_LABELS[o.status]}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-extrabold tabular-nums text-slate-900">
                        {formatILS(o.total_amount)}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPayOrder(o);
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-extrabold border ${payState.badgeCls}`}
                        >
                          {payState.label}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* חלונית Bottom Sheet יצירה / עריכת הזמנה עם כפתורי +/- גדולים */}
      <BottomSheet
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingOrder ? `עריכת הזמנה #${editingOrder.id}` : 'הזמנת לקוח חדשה'}
        subtitle="מחירון הזמנה מוקדמת (preorder_price)"
        maxWidthClass="md:max-w-2xl"
      >
        <form onSubmit={handleSaveOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך שישי</label>
              <input
                type="date"
                required
                value={formFriday}
                onChange={(e) => setFormFriday(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]"
              />
            </div>
            {!editingOrder && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  לקוח רשום (שם / 4 ספרות)
                </label>
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="חיפוש מהיר (1015)..."
                  className="w-full px-3 py-1.5 mb-1.5 rounded-xl border border-[#E8D5BE] bg-white text-xs"
                />
                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    setSelectedUserId(e.target.value);
                    const found = users.find((u) => String(u.id) === e.target.value);
                    if (found) {
                      setRecipientName(found.name);
                      if ((found.discount_percent ?? 0) > 0) {
                        setDiscountMode('percent');
                        setDiscountValue(String(found.discount_percent));
                      }
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]"
                >
                  <option value="">לקוח מזדמן</option>
                  {filteredCustomers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.phone ? `(${getPhoneLast4(u.phone)})` : ''}
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
                className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              מוצרים (השתמש בכפתורי + / - ללא מקלדת)
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
                      <div className="text-xs text-slate-500 tabular-nums">
                        {formatILS(getCustomerUnitPrice(p))}
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
                        className="w-10 h-10 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="min-w-[32px] text-center tabular-nums font-extrabold text-base">
                        {q}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((prev) => ({ ...prev, [p.id]: (prev[p.id] || 0) + 1 }))
                        }
                        className="w-10 h-10 rounded-xl bg-[#C85A17] text-white flex items-center justify-center active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-600">הנחה</label>
                <button
                  type="button"
                  onClick={() => setDiscountMode((m) => (m === 'fixed' ? 'percent' : 'fixed'))}
                  className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900"
                >
                  {discountMode === 'fixed' ? '₪' : '%'}
                </button>
              </div>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                dir="ltr"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
              />
            </div>
            {!editingOrder && (
              <>
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
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] text-left tabular-nums font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">אמצעי תשלום</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE]"
                  >
                    {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                      <option key={pm} value={pm}>
                        {PAYMENT_METHOD_LABELS[pm]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <label className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeVat}
              onChange={(e) => setIncludeVat(e.target.checked)}
              className="w-4 h-4 rounded accent-[#C85A17]"
            />
            <span className="text-xs font-bold text-slate-800">+ מע״מ 18%</span>
            {includeVat && (
              <span className="text-xs font-extrabold text-[#C85A17] tabular-nums">
                ({formatILS(draftTotals.vat)})
              </span>
            )}
          </label>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">הערות</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E8D5BE]"
            />
          </div>

          <div className="bg-[#FAF6F0] rounded-2xl p-4 border border-[#E8D5BE] flex items-center justify-between">
            <span className="font-bold text-slate-700">סה״כ להזמנה:</span>
            <span className="font-extrabold text-2xl text-[#C85A17] tabular-nums">
              {formatILS(draftTotals.total)}
            </span>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[50px] rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-base"
          >
            {saving ? 'שומר...' : editingOrder ? 'עדכן הזמנה' : 'שמור הזמנה'}
          </button>
        </form>
      </BottomSheet>

      {/* חלונית תשלום מהיר */}
      <QuickPaymentSheet
        order={payOrder}
        onClose={() => setPayOrder(null)}
        onConfirm={handleConfirmQuickPay}
      />

      {/* חלונית כרטסת לקוח מאוחדת */}
      <BottomSheet
        open={Boolean(ledgerData)}
        onClose={() => setLedgerData(null)}
        title={ledgerData ? `כרטסת לקוח — ${ledgerData.user.name}` : ''}
        subtitle={
          ledgerData ? `יתרה נוכחית: ${formatILS(ledgerData.user.balance)}` : undefined
        }
        maxWidthClass="md:max-w-2xl"
      >
        {ledgerData && (
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
        )}
      </BottomSheet>
    </div>
  );
}
