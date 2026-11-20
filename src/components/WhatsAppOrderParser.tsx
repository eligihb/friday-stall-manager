import React, { useState, useMemo } from 'react';
import {
  MessageSquareText,
  Sparkles,
  UserPlus,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Search,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../lib/format';
import { filterUsersByNameOrPhone, getPhoneLast4, parseWhatsAppMessage } from '../lib/whatsappParser';
import type { AdminProduct, OrderType, PaymentMethod, User } from '../types';

interface WhatsAppOrderParserProps {
  fridayDate: string;
  products: AdminProduct[];
  users: User[];
  compact?: boolean;
  mode?: 'regular' | 'quick';
  onUserCreated?: (user: User) => void;
  onOrderCreated: () => Promise<void>;
}

interface ParsedOrderLine {
  lineId: string;
  product_id: number;
  quantity: number;
  flavor?: string;
  applyBundle: boolean;
  overrideUnitPrice?: number;
}

const DEFAULT_FLAVORS = ['רגיל', 'שום', 'שומשום', 'זעתר'];

function supportsFlavors(name: string): boolean {
  return name.includes('פרנה גדולה') || name.includes('פיתה מלבנית');
}

function getBundleTotal(productName: string, quantity: number, baseUnitPrice: number): number | null {
  if (quantity <= 0) return null;
  if (
    productName.includes('פיתה מלבנית') ||
    (productName.includes('פיתה') &&
      (productName.includes('זעתר') || productName.includes('שום') || productName.includes('שומשום')))
  ) {
    const packs6 = Math.floor(quantity / 6);
    const rem6 = quantity % 6;
    const packs3 = Math.floor(rem6 / 3);
    const singles = rem6 % 3;
    return packs6 * 20 + packs3 * 12 + singles * 5;
  }
  if (productName.includes("ג'חנון") || productName.includes('גחנון')) {
    if (quantity >= 5) {
      return quantity * 8;
    }
    return quantity * 9;
  }
  return null;
}

const SAMPLE_MESSAGE = 'אליאב שלום, 2 פיתות, 3 פרנה, 2 זלביה, 1 לחם שום, 130 לחוח, תודה שבת שלום';

export function WhatsAppOrderParser({
  fridayDate,
  products,
  users,
  compact = false,
  mode = 'quick',
  onUserCreated,
  onOrderCreated,
}: WhatsAppOrderParserProps) {
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedOrderLine[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  const [orderType, setOrderType] = useState<OrderType>('customer');
  const [customerTier, setCustomerTier] = useState<'preorder_price' | 'customer_price'>('preorder_price');
  const [userMode, setUserMode] = useState<'existing' | 'new'>('existing');
  const [userSearch, setUserSearch] = useState('');
  const [showMoreQuickUsers, setShowMoreQuickUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newEntityOpen, setNewEntityOpen] = useState(false);
  const [newEntityRole, setNewEntityRole] = useState<'customer' | 'supplier' | 'other'>('customer');
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityPhone, setNewEntityPhone] = useState('');
  const [newEntityNotes, setNewEntityNotes] = useState('');
  const [creatingEntity, setCreatingEntity] = useState(false);

  const [deliveryFee, setDeliveryFee] = useState('0');
  const [discountMode, setDiscountMode] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState('0');
  const [includeVat, setIncludeVat] = useState(false);
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paybox');
  const [notes, setNotes] = useState('');
  const [addProductId, setAddProductId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedUser = useMemo(
    () => users.find((u) => String(u.id) === selectedUserId) || null,
    [users, selectedUserId]
  );

  const applySelectedUser = (u: User | null) => {
    if (!u) {
      setSelectedUserId('');
      return;
    }
    setSelectedUserId(String(u.id));
    setRecipientName(u.name);
    if (u.role === 'supplier') setOrderType('supplier');
    else if (u.role === 'customer' && orderType === 'supplier') setOrderType('customer');
    if ((u.discount_percent ?? 0) > 0) {
      setDiscountMode('percent');
      setDiscountValue(String(u.discount_percent));
    }
  };

  const runParse = (textToParse: string) => {
    const res = parseWhatsAppMessage(textToParse, activeProducts, users);
    setParsedItems(
      res.items.map((i, idx) => ({
        lineId: `${i.product.id}-${idx}-${Date.now()}`,
        product_id: i.product.id,
        quantity: i.quantity,
        flavor: supportsFlavors(i.product.name) ? 'רגיל' : undefined,
        applyBundle: true,
      }))
    );
    setUnmatched(res.unmatched);
    if (res.matchedUser && !selectedUserId) {
      applySelectedUser(res.matchedUser);
    }
    setHasParsed(true);
    setError('');
    setSuccess('');
  };

  const getUnitPrice = (prod: AdminProduct) => {
    if (orderType === 'charity') return 0;
    const override = selectedUser?.custom_prices?.[prod.id];
    if (override !== undefined && !Number.isNaN(Number(override)) && Number(override) >= 0) {
      return Number(override);
    }
    if (orderType === 'supplier') return prod.supplier_price;
    return prod[customerTier];
  };

  const getLineTotal = (item: ParsedOrderLine, prod: AdminProduct): number => {
    if (orderType === 'charity') return 0;
    if (item.overrideUnitPrice !== undefined && !Number.isNaN(item.overrideUnitPrice)) {
      return Math.round(item.overrideUnitPrice * item.quantity * 100) / 100;
    }
    const baseUnit = getUnitPrice(prod);
    if (item.applyBundle && orderType === 'customer') {
      const bundle = getBundleTotal(prod.name, item.quantity, baseUnit);
      if (bundle !== null) return bundle;
    }
    return Math.round(baseUnit * item.quantity * 100) / 100;
  };

  const subtotal = useMemo(() => {
    return parsedItems.reduce((sum, item) => {
      const p = productMap.get(item.product_id);
      if (!p) return sum;
      return sum + getLineTotal(item, p);
    }, 0);
  }, [parsedItems, productMap, orderType, customerTier, selectedUser]);

  const totals = useMemo(() => {
    if (orderType === 'charity') {
      return { discountILS: 0, vatAmount: 0, total: 0 };
    }
    const val = Math.max(0, Number(discountValue) || 0);
    const discountILS =
      discountMode === 'percent' ? Math.round(((subtotal * Math.min(100, val)) / 100) * 100) / 100 : val;
    const preVat = Math.max(0, Math.round((subtotal + (Number(deliveryFee) || 0) - discountILS) * 100) / 100);
    const vatAmount = includeVat ? Math.round(preVat * 0.18 * 100) / 100 : 0;
    return {
      discountILS,
      vatAmount,
      total: Math.round((preVat + vatAmount) * 100) / 100,
    };
  }, [subtotal, deliveryFee, discountMode, discountValue, includeVat, orderType]);

  const estimatedCost = useMemo(() => {
    return parsedItems.reduce((sum, item) => {
      const p = productMap.get(item.product_id);
      return sum + (p ? item.quantity * p.cost_price : 0);
    }, 0);
  }, [parsedItems, productMap]);

  const filteredUsers = useMemo(() => {
    const roleScoped =
      orderType === 'supplier'
        ? users.filter((u) => u.role === 'supplier')
        : orderType === 'customer'
        ? users.filter((u) => u.role !== 'admin')
        : [];
    return filterUsersByNameOrPhone(userSearch, roleScoped);
  }, [users, orderType, userSearch]);

  const handleAddManualProduct = () => {
    const pid = Number(addProductId);
    if (!pid) return;
    const prod = productMap.get(pid);
    setParsedItems((prev) => {
      const hasFlavors = prod ? supportsFlavors(prod.name) : false;
      if (!hasFlavors) {
        const exists = prev.find((i) => i.product_id === pid);
        if (exists) {
          return prev.map((i) => (i.lineId === exists.lineId ? { ...i, quantity: i.quantity + 1 } : i));
        }
      }
      return [
        ...prev,
        {
          lineId: `${pid}-${Date.now()}-${Math.random()}`,
          product_id: pid,
          quantity: 1,
          flavor: hasFlavors ? 'רגיל' : undefined,
          applyBundle: true,
        },
      ];
    });
    setAddProductId('');
  };

  const handleQuickCreateEntity = async () => {
    const name = newEntityName.trim();
    if (!name) {
      setError('יש להזין שם פרטי ומשפחה.');
      return;
    }
    setCreatingEntity(true);
    setError('');
    try {
      const apiRole = newEntityRole === 'supplier' ? 'supplier' : 'customer';
      const notesPrefix = newEntityRole === 'other' ? '[אחר] ' : '';
      const created = await apiFetch<{ id: number; user?: User }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          phone: newEntityPhone.trim(),
          role: apiRole,
          notes: `${notesPrefix}${newEntityNotes.trim()}`.trim(),
        }),
      });
      const newUser: User = created.user || {
        id: created.id,
        name,
        phone: newEntityPhone.trim(),
        email: '',
        role: apiRole,
        balance: 0,
        notes: `${notesPrefix}${newEntityNotes.trim()}`.trim(),
      };
      onUserCreated?.(newUser);
      applySelectedUser(newUser);
      setNewEntityName('');
      setNewEntityPhone('');
      setNewEntityNotes('');
      setNewEntityOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת ישות חדשה');
    } finally {
      setCreatingEntity(false);
    }
  };

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validItems = parsedItems.filter((i) => i.quantity > 0);
    if (validItems.length === 0) {
      setError('אין פריטים בהזמנה — הדבק הודעת וואטסאפ ולחץ על ״פענח הודעה״ או הוסף פריט ידנית.');
      return;
    }

    const finalRecipient = recipientName.trim();
    if (!finalRecipient && !selectedUserId) {
      setError('יש לבחור לקוח/ספק קיים או להזין שם מקבל ההזמנה.');
      return;
    }

    setSubmitting(true);
    try {
      let userId: number | null = selectedUserId ? Number(selectedUserId) : null;

      if (orderType !== 'charity' && userMode === 'new' && finalRecipient) {
        const createdUser = await apiFetch<{ id: number; user: User }>('/api/users', {
          method: 'POST',
          body: JSON.stringify({
            name: finalRecipient,
            phone: newUserPhone.trim(),
            role: orderType === 'supplier' ? 'supplier' : 'customer',
            notes: 'נוצר אוטומטית מקליטת הזמנה בוואטסאפ',
          }),
        });
        userId = createdUser.id;
      }

      const flavorNotes = validItems
        .map((it) => {
          const prod = productMap.get(it.product_id);
          return it.flavor && prod ? `${prod.name}: ${it.flavor} (×${it.quantity})` : null;
        })
        .filter(Boolean);
      const combinedNotes = [notes.trim(), ...flavorNotes].filter(Boolean).join(' | ');

      const itemsPayload = validItems.map((it) => {
        const prod = productMap.get(it.product_id);
        const lineTotal = prod ? getLineTotal(it, prod) : 0;
        const effectiveUnitPrice = it.quantity > 0 ? Math.round((lineTotal / it.quantity) * 100) / 100 : 0;
        return {
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price_snapshot: effectiveUnitPrice,
        };
      });

      const discVal = Math.max(0, Number(discountValue) || 0);
      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          order_type: orderType,
          price_tier: customerTier,
          user_id: orderType === 'charity' ? null : userId,
          recipient_name: finalRecipient || users.find((u) => u.id === userId)?.name || 'הזמנה',
          delivery_fee: orderType === 'charity' ? 0 : Number(deliveryFee) || 0,
          credit_discount: orderType === 'charity' ? 0 : discountMode === 'fixed' ? discVal : 0,
          discount_percent: orderType === 'charity' ? 0 : discountMode === 'percent' ? Math.min(100, discVal) : 0,
          include_vat: orderType === 'charity' ? false : includeVat,
          paid_amount: orderType === 'charity' ? 0 : Number(paidAmount) || 0,
          payment_method: paymentMethod,
          notes: combinedNotes,
          items: itemsPayload,
        }),
      });

      setRawText('');
      setParsedItems([]);
      setUnmatched([]);
      setHasParsed(false);
      setSelectedUserId('');
      setUserSearch('');
      setRecipientName('');
      setNewUserPhone('');
      setDeliveryFee('0');
      setDiscountValue('0');
      setIncludeVat(false);
      setPaidAmount('0');
      setNotes('');
      setUserMode('existing');
      setSuccess('ההזמנה נקלטה בהצלחה ועודכנה בסיכום הרכש מהמאפייה ובלוח הליקוט!');
      await onOrderCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={
        compact
          ? 'space-y-4'
          : 'bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden'
      }
    >
      {!compact && (
        <div className="bg-gradient-to-l from-[#1E242B] to-[#3A2419] px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
              <MessageSquareText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold leading-tight">קליטת הזמנה חכמה מוואטסאפ</h3>
              <p className="text-xs text-amber-200/85">
                מסנן ברכות אוטומטית, ממפה פיתות←סאלוף ומארזי 12 ₪, ומזהה לקוחות/ספקים לפי שם או 4 ספרות אחרונות.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setRawText(SAMPLE_MESSAGE);
              runParse(SAMPLE_MESSAGE);
            }}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-amber-200 border border-white/15 transition-colors"
          >
            טען הודעה לדוגמה
          </button>
        </div>
      )}

      <form onSubmit={handleSaveOrder} className={compact ? 'space-y-4' : 'p-5 space-y-5'}>
        {compact && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setRawText(SAMPLE_MESSAGE);
                runParse(SAMPLE_MESSAGE);
              }}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-[#FFF7ED] border border-[#E8D5BE] text-[#C85A17]"
            >
              טען הודעה לדוגמה
            </button>
          </div>
        )}

        {success && (
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        <div className={compact ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-12 gap-5'}>
          {/* אזור הדבקת הודעת וואטסאפ */}
          {mode !== 'regular' && (
            <div className={compact ? 'space-y-3' : 'lg:col-span-5 space-y-3'}>
              <label className="block text-xs font-bold text-slate-700">
                טקסט הודעת הוואטסאפ הגולמית
              </label>
              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder='לדוגמה: "אליאב שלום, 2 פיתות, 3 פרנה, 2 זלביה, 1 לחם שום, 130 לחוח"'
                className="w-full p-3.5 rounded-2xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:ring-2 focus:ring-[#C85A17]/20 focus:outline-none text-sm leading-relaxed"
              />
              <button
                type="button"
                onClick={() => runParse(rawText)}
                className="w-full py-2.5 px-4 rounded-xl bg-[#1E242B] hover:bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>פענח הודעה אוטומטית</span>
              </button>

              {unmatched.length > 0 && (
                <div className="p-3 rounded-xl bg-red-100 border border-red-400 text-red-800 text-xs font-bold">
                  <div className="font-extrabold flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>שורות/קטעים שלא זוהו אוטומטית:</span>
                  </div>
                  <div className="space-y-1">
                    {unmatched.map((line, idx) => (
                      <div key={idx} className="px-2 py-1 rounded bg-red-200/70 border border-red-400">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* פרטי שיוך ההזמנה, הנחה, משלוח ומע״מ */}
          <div className={compact ? 'space-y-3.5' : 'lg:col-span-7 space-y-3.5'}>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">סוג ההזמנה ומדרגת מחיר</label>
              <div className="grid grid-cols-3 gap-2">
                {(['customer', 'supplier', 'charity'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setOrderType(t);
                      setSelectedUserId('');
                      if (t === 'charity') setUserMode('existing');
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                      orderType === t
                        ? 'bg-[#C85A17] text-white border-[#C85A17] shadow-sm'
                        : 'bg-[#FDFBF7] text-slate-700 border-[#E8D5BE] hover:bg-[#FFF7ED]'
                    }`}
                  >
                    {ORDER_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {orderType === 'customer' && (
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setCustomerTier('preorder_price')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border ${
                    customerTier === 'preorder_price'
                      ? 'bg-amber-50 border-amber-500 text-amber-900'
                      : 'border-[#E8D5BE] text-slate-500'
                  }`}
                >
                  מחירון הזמנה מוקדמת
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerTier('customer_price')}
                  className={`flex-1 py-1.5 rounded-lg font-bold border ${
                    customerTier === 'customer_price'
                      ? 'bg-amber-50 border-amber-500 text-amber-900'
                      : 'border-[#E8D5BE] text-slate-500'
                  }`}
                >
                  מחירון דוכן רגיל
                </button>
              </div>
            )}

            {/* שיוך ללקוח/ספק עם חיפוש לפי שם או 4 ספרות אחרונות + יצירה מהירה */}
            {orderType !== 'charity' ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700">
                    {orderType === 'supplier' ? 'שיוך לספק' : 'שיוך ללקוח'} (שם או 4 ספרות אחרונות)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {(['customer', 'supplier', 'other'] as const).map((r) => {
                      const label = r === 'customer' ? 'לקוח חדש' : r === 'supplier' ? 'ספק חדש' : 'אחר';
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => {
                            setNewEntityRole(r);
                            setNewEntityOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FFF7ED] border border-[#E8D5BE] text-[11px] font-bold text-[#C85A17] hover:bg-[#FFEDD5]"
                        >
                          <UserPlus className="w-3 h-3" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {newEntityOpen && (
                  <div className="p-3 rounded-2xl bg-[#FFF7ED] border border-[#C85A17]/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#8A330B]">
                        יצירת{' '}
                        {newEntityRole === 'customer'
                          ? 'לקוח חדש'
                          : newEntityRole === 'supplier'
                          ? 'ספק חדש'
                          : 'אחר'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setNewEntityOpen(false)}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800"
                      >
                        ביטול
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newEntityName}
                        onChange={(e) => setNewEntityName(e.target.value)}
                        placeholder="שם פרטי ומשפחה"
                        className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-xs font-semibold"
                      />
                      <input
                        type="tel"
                        inputMode="tel"
                        value={newEntityPhone}
                        onChange={(e) => setNewEntityPhone(e.target.value)}
                        placeholder="טלפון"
                        className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-xs tabular-nums"
                      />
                      <select
                        value={newEntityRole}
                        onChange={(e) =>
                          setNewEntityRole(e.target.value as 'customer' | 'supplier' | 'other')
                        }
                        className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-xs font-semibold"
                      >
                        <option value="customer">סוג משתמש: לקוח</option>
                        <option value="supplier">סוג משתמש: ספק</option>
                        <option value="other">סוג משתמש: אחר</option>
                      </select>
                      <input
                        type="text"
                        value={newEntityNotes}
                        onChange={(e) => setNewEntityNotes(e.target.value)}
                        placeholder="הערות"
                        className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={creatingEntity}
                      onClick={handleQuickCreateEntity}
                      className="w-full py-2 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-bold text-xs"
                    >
                      {creatingEntity ? 'יוצר...' : 'צור'}
                    </button>
                  </div>
                )}

                {userMode === 'existing' ? (
                  <div className="space-y-2">
                    {/* בחירה מהירה בלחיצה: 2 שורות ספקים אחרונים / 5 לקוחות אחרונים + עוד */}
                    {filteredUsers.length > 0 && (
                      <div className="space-y-1.5">
                        <div
                          className={
                            orderType === 'supplier'
                              ? 'grid grid-cols-2 sm:grid-cols-3 gap-1.5'
                              : 'flex flex-wrap gap-1.5'
                          }
                        >
                          {(orderType === 'supplier'
                            ? filteredUsers.slice(0, 6)
                            : showMoreQuickUsers || userSearch.trim()
                            ? filteredUsers
                            : filteredUsers.slice(0, 5)
                          ).map((u) => {
                            const active = String(u.id) === selectedUserId;
                            return (
                              <button
                                key={u.id}
                                type="button"
                                onClick={() => applySelectedUser(u)}
                                className={`min-h-[40px] px-2.5 py-1 rounded-xl border text-xs font-bold truncate transition-colors ${
                                  active
                                    ? 'bg-[#C85A17] text-white border-[#C85A17]'
                                    : 'bg-[#FAF6F0] hover:bg-[#FFF7ED] text-slate-800 border-[#E8D5BE]'
                                }`}
                              >
                                {u.name}
                                {getPhoneLast4(u.phone) ? ` #${getPhoneLast4(u.phone)}` : ''}
                              </button>
                            );
                          })}
                          {orderType !== 'supplier' && !userSearch.trim() && filteredUsers.length > 5 && (
                            <button
                              type="button"
                              onClick={() => setShowMoreQuickUsers((v) => !v)}
                              className="min-h-[40px] px-2.5 py-1 rounded-xl border border-dashed border-[#C85A17]/60 text-[#8A330B] text-xs font-extrabold"
                            >
                              {showMoreQuickUsers ? 'פחות' : `עוד (${filteredUsers.length - 5})`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => {
                          const q = e.target.value;
                          setUserSearch(q);
                          const matches = filterUsersByNameOrPhone(
                            q,
                            orderType === 'supplier'
                              ? users.filter((u) => u.role === 'supplier')
                              : users.filter((u) => u.role !== 'admin')
                          );
                          if (q.replace(/\D/g, '').length === 4 && matches.length === 1) {
                            applySelectedUser(matches[0]);
                          }
                        }}
                        placeholder="חפש בהקלדת תחילת שם או 4 ספרות אחרונות (1015, 9917)"
                        className="w-full pr-9 pl-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={selectedUserId}
                        onChange={(e) => {
                          const found = users.find((u) => String(u.id) === e.target.value) || null;
                          applySelectedUser(found);
                        }}
                        className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                      >
                        <option value="">ללא חשבון (לקוח מזדמן)</option>
                        {filteredUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} {u.phone ? `(${getPhoneLast4(u.phone)})` : ''}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        required={!selectedUserId}
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="שם מקבל ההזמנה"
                        className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-[#FFF7ED]/70 border border-[#E8D5BE]">
                    <input
                      type="text"
                      required
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                      placeholder={orderType === 'supplier' ? 'שם הספק החדש' : 'שם הלקוח החדש'}
                      className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm"
                    />
                    <input
                      type="tel"
                      inputMode="tel"
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="טלפון נייד"
                      className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm tabular-nums"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  שם הגוף / המשפחה (הזמנה מסובסדת — סעיף סבסוד נפרד)
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['הכולל', 'משפחה 1', 'משפחה 2'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRecipientName(preset)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                        recipientName === preset
                          ? 'bg-purple-700 text-white border-purple-700'
                          : 'bg-purple-50 text-purple-900 border-purple-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="לדוגמה: הכולל / משפחה 1 / משפחה 2"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                />
              </div>
            )}

            {/* משלוח / הנחה (₪ או %) / תשלום / מע״מ 18% */}
            {orderType !== 'charity' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">משלוח (₪)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      dir="ltr"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-sm font-bold"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-500">הנחה</label>
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
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">שולם מראש (₪)</label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      dir="ltr"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-sm font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">אמצעי תשלום</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                    >
                      {(['cash', 'paybox', 'transfer'] as const).map((pm) => (
                        <option key={pm} value={pm}>
                          {PAYMENT_METHOD_LABELS[pm]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* מתג מע״מ 18% */}
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
                      ({formatILS(totals.vatAmount)})
                    </span>
                  )}
                </label>
              </div>
            )}
          </div>
        </div>

        {/* טבלת הפריטים שפוענחו + הוספה ידנית */}
        <div className="border-t border-[#F3E9DC] pt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-800">
              פריטים שפוענחו ({parsedItems.length})
            </h4>
            <div className="flex items-center gap-2">
              <select
                value={addProductId}
                onChange={(e) => setAddProductId(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-semibold"
              >
                <option value="">+ הוסף מוצר ידנית...</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({formatILS(getUnitPrice(p))})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddManualProduct}
                disabled={!addProductId}
                className="p-1.5 rounded-xl bg-[#FFF7ED] border border-[#C85A17]/40 text-[#C85A17] disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {parsedItems.length === 0 ? (
            <div className="py-5 px-4 rounded-2xl bg-[#FAF6F0] border border-dashed border-[#E8D5BE] text-center text-xs text-slate-500">
              {hasParsed
                ? 'לא זוהו מוצרים בהודעה. נסה לערוך את הטקסט או להוסיף מוצרים ידנית.'
                : 'הדבק הודעת וואטסאפ ולחץ על ״פענח הודעה אוטומטית״ כדי לראות כאן את שורות ההזמנה והמחירים.'}
            </div>
          ) : (
            <div className={compact ? 'space-y-2.5' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5'}>
              {parsedItems.map((it) => {
                const prod = productMap.get(it.product_id);
                if (!prod) return null;
                const baseUnitPrice = getUnitPrice(prod);
                const hasFlavors = supportsFlavors(prod.name);
                const bundleAvailable =
                  orderType === 'customer' &&
                  getBundleTotal(prod.name, it.quantity, baseUnitPrice) !== null;
                const lineTotal = getLineTotal(it, prod);
                const flavorList = prod.flavors && prod.flavors.length > 0 ? prod.flavors : DEFAULT_FLAVORS;

                return (
                  <div
                    key={it.lineId}
                    className="flex flex-col gap-2 p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">
                          {prod.name}
                          {it.flavor ? ` (${it.flavor})` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {it.overrideUnitPrice !== undefined
                            ? `${formatILS(it.overrideUnitPrice)} (ידני) × ${it.quantity} = `
                            : bundleAvailable && it.applyBundle
                            ? `מבצע כמות (${it.quantity} יח׳) = `
                            : `${formatILS(baseUnitPrice)} × ${it.quantity} = `}
                          <span className="font-bold text-[#8A330B]">{formatILS(lineTotal)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setParsedItems((prev) =>
                              prev.map((row) =>
                                row.lineId === it.lineId
                                  ? { ...row, quantity: Math.max(1, row.quantity - 1) }
                                  : row
                              )
                            )
                          }
                          className="w-9 h-9 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                          aria-label="הפחת"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => {
                            const nextQty = Math.max(1, Math.floor(Number(e.target.value) || 1));
                            setParsedItems((prev) =>
                              prev.map((row) =>
                                row.lineId === it.lineId ? { ...row, quantity: nextQty } : row
                              )
                            );
                          }}
                          className="w-12 h-9 text-center rounded-xl border border-[#E8D5BE] bg-white font-bold text-sm tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setParsedItems((prev) =>
                              prev.map((row) =>
                                row.lineId === it.lineId
                                  ? { ...row, quantity: row.quantity + 1 }
                                  : row
                              )
                            )
                          }
                          className="w-9 h-9 rounded-xl bg-[#C85A17] text-white flex items-center justify-center active:scale-95"
                          aria-label="הוסף"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setParsedItems((prev) => prev.filter((row) => row.lineId !== it.lineId))
                          }
                          className="w-8 h-9 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* בחירת טעם + מתג מבצע כמות + עקיפת מחיר ידנית לשורה */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#E8D5BE]/60 text-[11px]">
                      {hasFlavors && (
                        <select
                          value={it.flavor || 'רגיל'}
                          onChange={(e) =>
                            setParsedItems((prev) =>
                              prev.map((row) =>
                                row.lineId === it.lineId ? { ...row, flavor: e.target.value } : row
                              )
                            )
                          }
                          className="px-2 py-1 rounded-lg border border-[#E8D5BE] bg-white font-bold text-slate-700"
                        >
                          {flavorList.map((fl) => (
                            <option key={fl} value={fl}>
                              טעם: {fl}
                            </option>
                          ))}
                        </select>
                      )}

                      {bundleAvailable && (
                        <button
                          type="button"
                          onClick={() =>
                            setParsedItems((prev) =>
                              prev.map((row) =>
                                row.lineId === it.lineId
                                  ? { ...row, applyBundle: !row.applyBundle, overrideUnitPrice: undefined }
                                  : row
                              )
                            )
                          }
                          className={`px-2 py-1 rounded-lg font-bold border transition-colors ${
                            it.applyBundle && it.overrideUnitPrice === undefined
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                              : 'bg-white border-[#E8D5BE] text-slate-500'
                          }`}
                        >
                          {it.applyBundle && it.overrideUnitPrice === undefined
                            ? '✓ מחיר מבצע כמות'
                            : 'מחיר יחידה רגיל'}
                        </button>
                      )}

                      {orderType !== 'charity' && (
                        <div className="flex items-center gap-1 mr-auto">
                          <span className="text-slate-500">מחיר ידני:</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.5"
                            dir="ltr"
                            placeholder={String(baseUnitPrice)}
                            value={it.overrideUnitPrice ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setParsedItems((prev) =>
                                prev.map((row) =>
                                  row.lineId === it.lineId
                                    ? {
                                        ...row,
                                        overrideUnitPrice: raw === '' ? undefined : Math.max(0, Number(raw)),
                                      }
                                    : row
                                )
                              );
                            }}
                            className="w-16 px-1.5 py-0.5 rounded-lg border border-[#E8D5BE] bg-white text-left tabular-nums font-bold"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* הערות + שורת סיכום ושמירה */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 pt-2">
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="הערה להזמנה (שעת איסוף, הוראות אריזה...)"
            className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
          />

          <div className="flex items-center justify-between md:justify-end gap-4 bg-[#FAF6F0] px-4 py-2.5 rounded-2xl border border-[#E8D5BE]">
            <div className="tabular-nums">
              <div className="text-[11px] text-slate-500">
                {orderType === 'charity'
                  ? `עלות סבסוד: ${formatILS(estimatedCost)}`
                  : `${totals.discountILS > 0 ? `הנחה: -${formatILS(totals.discountILS)} · ` : ''}${
                      includeVat ? `מע״מ 18%: ${formatILS(totals.vatAmount)} · ` : ''
                    }עלות: ${formatILS(estimatedCost)}`}
              </div>
              <div className="text-xl font-extrabold text-[#C85A17]">{formatILS(totals.total)}</div>
            </div>
            <button
              type="submit"
              disabled={submitting || parsedItems.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-bold text-sm shadow-sm transition-colors"
            >
              <Send className="w-4 h-4" />
              <span>{submitting ? 'שומר...' : 'שמור הזמנה'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
