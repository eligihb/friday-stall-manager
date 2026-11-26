import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Zap,
  X,
  Plus,
  Minus,
  CheckCircle2,
  Search,
  Phone,
  ArrowLeft,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS } from '../lib/format';
import { filterUsersByNameOrPhone, getPhoneLast4 } from '../lib/whatsappParser';
import { getCurrentHHMM, saveOrderPaymentMeta, type PaymentMethodLabel } from '../lib/paymentMeta';
import { pushLocalStateToCloud } from '../lib/supabaseSync';
import { useFriday } from '../context/FridayContext';
import type { AdminProduct, OrderType, PaymentMethod, User } from '../types';

interface QuickAdminOrderModalProps {
  open: boolean;
  onClose: () => void;
  onOrderSaved?: () => void;
}

type QuickPayOption = 'unpaid' | 'cash' | 'bit' | 'paybox' | 'transfer';

const PAY_OPTIONS: Array<{ key: QuickPayOption; label: string }> = [
  { key: 'unpaid', label: 'לא שולם' },
  { key: 'cash', label: 'מזומן' },
  { key: 'bit', label: 'Bit' },
  { key: 'paybox', label: 'PayBox' },
  { key: 'transfer', label: 'העברה' },
];

const PAY_META_LABELS: Record<Exclude<QuickPayOption, 'unpaid'>, PaymentMethodLabel> = {
  cash: 'מזומן',
  bit: 'ביט',
  paybox: 'פייבוקס',
  transfer: 'העברה בנקאית',
};

export function QuickAdminOrderModal({
  open,
  onClose,
  onOrderSaved,
}: QuickAdminOrderModalProps) {
  const { fridayDate, triggerRefresh } = useFriday();
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // שדות הטופס
  const [orderType, setOrderType] = useState<OrderType>('customer');
  const [customerInput, setCustomerInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [payOption, setPayOption] = useState<QuickPayOption>('unpaid');
  const [notes, setNotes] = useState('');

  // מצב סבב ההזנה
  const [sessionCount, setSessionCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedToast, setSavedToast] = useState('');

  const nameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSessionCount(0);
    setSavedToast('');
    setError('');
    setLoading(true);
    Promise.all([
      apiFetch<{ products: AdminProduct[] }>('/api/products'),
      apiFetch<{ users: User[] }>('/api/users'),
    ])
      .then(([prodRes, usrRes]) => {
        setProducts(prodRes.products.filter((p) => p.is_active));
        setUsers(usrRes.users.filter((u) => u.role !== 'admin'));
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים');
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => nameInputRef.current?.focus(), 60);
      });
  }, [open]);

  const roleFilteredUsers = useMemo(() => {
    if (orderType === 'supplier') return users.filter((u) => u.role === 'supplier');
    return users;
  }, [users, orderType]);

  const suggestions = useMemo(() => {
    const q = customerInput.trim();
    if (!q || selectedUser) return [];
    return filterUsersByNameOrPhone(q, roleFilteredUsers).slice(0, 6);
  }, [customerInput, roleFilteredUsers, selectedUser]);

  const getUnitPrice = (p: AdminProduct) => {
    if (orderType === 'charity') return 0;
    const custom = selectedUser?.custom_prices?.[p.id];
    if (custom !== undefined && !Number.isNaN(Number(custom)) && Number(custom) >= 0) {
      return Number(custom);
    }
    return orderType === 'supplier' ? p.supplier_price : p.preorder_price;
  };

  const totals = useMemo(() => {
    let amount = 0;
    let units = 0;
    let cost = 0;
    for (const p of products) {
      const q = quantities[p.id] || 0;
      if (q <= 0) continue;
      units += q;
      amount += q * getUnitPrice(p);
      cost += q * p.cost_price;
    }
    return {
      amount: Math.round(amount * 100) / 100,
      units,
      cost: Math.round(cost * 100) / 100,
    };
  }, [products, quantities, orderType, selectedUser]);

  const resetFormForNext = () => {
    setCustomerInput('');
    setPhoneInput('');
    setSelectedUser(null);
    setShowSuggestions(false);
    setQuantities({});
    setPayOption('unpaid');
    setNotes('');
    setError('');
    setTimeout(() => nameInputRef.current?.focus(), 40);
  };

  const submitOrder = async (keepOpenForNext: boolean) => {
    const cleanName = (selectedUser?.name || customerInput).trim();
    if (!cleanName) {
      setError('יש להזין שם לקוח או לבחור מהרשימה');
      nameInputRef.current?.focus();
      return;
    }

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
      let resolvedUserId: number | null = selectedUser?.id ?? null;

      // אם הוזן לקוח חדש עם טלפון שאינו במאגר — יוצרים כרטיס לקוח אוטומטית
      if (!resolvedUserId && phoneInput.trim() && orderType !== 'charity') {
        try {
          const created = await apiFetch<{ user: User }>('/api/users', {
            method: 'POST',
            body: JSON.stringify({
              name: cleanName,
              phone: phoneInput.trim(),
              role: orderType === 'supplier' ? 'supplier' : 'customer',
            }),
          });
          if (created.user?.id) {
            resolvedUserId = created.user.id;
            setUsers((prev) => [created.user, ...prev]);
          }
        } catch {
          // ממשיכים כהזמנה עם שם בלבד
        }
      }

      const isPaid = orderType !== 'charity' && payOption !== 'unpaid';
      const apiMethod: PaymentMethod =
        payOption === 'bit' || payOption === 'paybox'
          ? 'paybox'
          : payOption === 'transfer'
          ? 'transfer'
          : 'cash';

      const combinedNotes = [
        phoneInput.trim() && !resolvedUserId ? `טלפון: ${phoneInput.trim()}` : '',
        notes.trim(),
      ]
        .filter(Boolean)
        .join(' | ');

      const res = await apiFetch<{ id: number; total_amount: number }>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          order_type: orderType,
          price_tier: orderType === 'supplier' ? 'supplier_price' : 'preorder_price',
          user_id: resolvedUserId,
          recipient_name: cleanName,
          paid_amount: isPaid ? totals.amount : 0,
          payment_method: apiMethod,
          notes: combinedNotes,
          items,
        }),
      });

      if (orderType !== 'charity' && payOption !== 'unpaid' && res.id) {
        saveOrderPaymentMeta(res.id, {
          methodLabel: PAY_META_LABELS[payOption],
          paidTime: getCurrentHHMM(),
        });
      }

      // סנכרון מיידי לענן Supabase
      void pushLocalStateToCloud({ mergeWithRemoteFirst: true, force: true });
      triggerRefresh();
      onOrderSaved?.();

      const nextCount = sessionCount + 1;
      setSessionCount(nextCount);
      setSavedToast(`✓ נשמרה הזמנה #${res.id} עבור ${cleanName}`);

      if (keepOpenForNext) {
        resetFormForNext();
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההזמנה');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#FAF6F0] rounded-3xl border border-[#E8D5BE] shadow-lg overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* כותרת עליונה עם מונה סבב נוכחי וכפתור יציאה */}
        <div className="bg-[#231A14] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#C85A17] flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-serif text-lg font-bold leading-tight">
                  הזמנה מהירה (מנהל)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-amber-200 text-xs font-extrabold tabular-nums">
                  הוזנו כעת: {sessionCount} הזמנות
                </span>
              </div>
              <p className="text-[11px] text-stone-300 mt-0.5">
                {formatFridayLabel(fridayDate)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold shrink-0"
          >
            <X className="w-4 h-4" />
            <span>סיום ויציאה</span>
          </button>
        </div>

        {/* גוף הטופס */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {savedToast && (
            <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedToast}</span>
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
              {error}
            </div>
          )}

          {/* 1. סוג הזמנה */}
          <div className="grid grid-cols-3 gap-1.5 bg-white p-1.5 rounded-2xl border border-[#E8D5BE]">
            {(
              [
                ['customer', 'לקוח פרטי'],
                ['supplier', 'ספק (סיטונאי)'],
                ['charity', 'מארז מיוחד'],
              ] as Array<[OrderType, string]>
            ).map(([typeKey, label]) => (
              <button
                key={typeKey}
                type="button"
                onClick={() => {
                  setOrderType(typeKey);
                  if (typeKey === 'charity') setPayOption('unpaid');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-extrabold transition-colors ${
                  orderType === typeKey
                    ? 'bg-[#2B1B12] text-amber-50'
                    : 'text-slate-600 hover:bg-[#FAF6F0]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* 2. בחירת לקוח / שם וטלפון עם Auto-complete */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="relative">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                שם לקוח / חיפוש מהיר *
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={nameInputRef}
                  type="text"
                  value={customerInput}
                  onChange={(e) => {
                    setCustomerInput(e.target.value);
                    setSelectedUser(null);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="הקלד שם או 4 ספרות טלפון..."
                  className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-sm font-bold focus:border-[#C85A17] focus:outline-none"
                />
              </div>

              {selectedUser && (
                <div className="mt-1 flex items-center justify-between px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
                  <span>נבחר: {selectedUser.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUser(null);
                      setCustomerInput('');
                      setPhoneInput('');
                      nameInputRef.current?.focus();
                    }}
                    className="text-emerald-700 hover:underline"
                  >
                    שנה
                  </button>
                </div>
              )}

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-[#E8D5BE] shadow-md divide-y divide-[#F3E9DC] max-h-48 overflow-y-auto">
                  {suggestions.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelectedUser(u);
                        setCustomerInput(u.name);
                        setPhoneInput(u.phone || '');
                        setShowSuggestions(false);
                      }}
                      className="w-full px-3 py-2 text-right hover:bg-[#FFF7ED] flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-bold text-slate-900">{u.name}</span>
                      <span className="text-slate-500 tabular-nums">
                        {u.phone || (getPhoneLast4(u.phone) ? `#${getPhoneLast4(u.phone)}` : '')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                טלפון (אופציונלי)
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                <input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="050-0000000"
                  className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-sm font-bold text-left tabular-nums focus:border-[#C85A17] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 3. רשימת מוצרי המחירון עם + / - והקלדת כמות ישירה */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-extrabold text-slate-700">מוצרים וכמויות</label>
              <span className="text-xs font-bold text-slate-500 tabular-nums">
                {totals.units} יחידות נבחרו
              </span>
            </div>

            {loading ? (
              <div className="bg-white rounded-2xl p-6 text-center text-xs text-slate-400 border border-[#E8D5BE]">
                טוען מוצרים...
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E8D5BE] divide-y divide-[#F3E9DC] max-h-60 overflow-y-auto">
                {products.map((p) => {
                  const q = quantities[p.id] || 0;
                  const unitPrice = getUnitPrice(p);
                  return (
                    <div
                      key={p.id}
                      className={`px-3 py-2 flex items-center justify-between gap-2 ${
                        q > 0 ? 'bg-[#FFF7ED]/70' : ''
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm text-slate-900 truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {orderType === 'charity'
                            ? `עלות ${formatILS(p.cost_price)}`
                            : formatILS(unitPrice)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [p.id]: Math.max(0, (prev[p.id] || 0) - 1),
                            }))
                          }
                          className="w-8 h-8 rounded-lg bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="0"
                          inputMode="numeric"
                          dir="ltr"
                          value={q === 0 ? '' : q}
                          placeholder="0"
                          onChange={(e) => {
                            const val = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            setQuantities((prev) => ({ ...prev, [p.id]: val }));
                          }}
                          className="w-12 h-8 rounded-lg border border-[#E8D5BE] bg-white text-center font-extrabold text-sm tabular-nums focus:border-[#C85A17] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setQuantities((prev) => ({
                              ...prev,
                              [p.id]: (prev[p.id] || 0) + 1,
                            }))
                          }
                          className="w-8 h-8 rounded-lg bg-[#C85A17] text-white flex items-center justify-center active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. סטטוס תשלום + הערה */}
          {orderType !== 'charity' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">סטטוס תשלום</label>
              <div className="grid grid-cols-5 gap-1.5">
                {PAY_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPayOption(opt.key)}
                    className={`py-2 px-1.5 rounded-xl border text-xs font-extrabold transition-colors ${
                      payOption === opt.key
                        ? opt.key === 'unpaid'
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-[#E8D5BE] hover:bg-[#FAF6F0]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הערה להזמנה (אופציונלי)"
              className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] bg-white text-xs font-semibold focus:border-[#C85A17] focus:outline-none"
            />
          </div>
        </div>

        {/* פוטר פעולות קבוע */}
        <div className="bg-white border-t border-[#E8D5BE] px-4 sm:px-5 py-3.5 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between text-sm font-extrabold tabular-nums">
            <span className="text-slate-600">
              {orderType === 'charity' ? 'עלות משוערת:' : 'סה״כ לתשלום:'}
            </span>
            <span className="text-xl text-[#C85A17]">
              {orderType === 'charity' ? formatILS(totals.cost) : formatILS(totals.amount)}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
            <button
              type="button"
              disabled={saving || totals.units === 0}
              onClick={() => void submitOrder(true)}
              className="sm:col-span-8 min-h-[46px] px-4 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-extrabold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <span>{saving ? 'שומר...' : 'שמור ועבור להזמנה הבאה'}</span>
              <ArrowLeft className="w-4 h-4 shrink-0" />
            </button>
            <button
              type="button"
              disabled={saving || totals.units === 0}
              onClick={() => void submitOrder(false)}
              className="sm:col-span-4 min-h-[46px] px-4 rounded-xl bg-[#2B1B12] hover:bg-[#3e291d] disabled:opacity-50 text-amber-50 font-extrabold text-xs transition-colors"
            >
              שמור וסיים
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
