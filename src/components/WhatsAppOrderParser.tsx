import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Send,
  Clock,
  UserCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, PAYMENT_METHOD_LABELS } from '../lib/format';
import { getFridayPricingStatus } from '../lib/pricingCutoff';
import { filterUsersByNameOrPhone, getPhoneLast4, parseWhatsAppMessage } from '../lib/whatsappParser';
import type { AdminProduct, OrderType, PaymentMethod, User } from '../types';

interface WhatsAppOrderParserProps {
  fridayDate: string;
  products: AdminProduct[];
  users: User[];
  compact?: boolean;
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

type PricingMode = 'preorder' | 'stall' | 'supplier' | 'charity';
type EntityTypeChoice = 'customer' | 'supplier' | 'other';

const DEFAULT_FLAVORS = ['רגיל', 'שום', 'שומשום', 'זעתר'];

function supportsFlavors(name: string): boolean {
  return name.includes('פרנה גדולה') || name.includes('פיתה מלבנית');
}

function getBundleTotal(productName: string, quantity: number): number | null {
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
    return quantity >= 5 ? quantity * 8 : quantity * 9;
  }
  return null;
}

export function WhatsAppOrderParser({
  fridayDate,
  products,
  users,
  compact = false,
  onUserCreated,
  onOrderCreated,
}: WhatsAppOrderParserProps) {
  const cutoffStatus = useMemo(() => getFridayPricingStatus(fridayDate), [fridayDate]);
  const [overridePreorderCutoff, setOverridePreorderCutoff] = useState(false);

  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState<ParsedOrderLine[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  // תמחור אחיד: הזמנה מוקדמת | מחיר דוכן | מחיר ספק | מסובסד
  const [pricingMode, setPricingMode] = useState<PricingMode>(() =>
    cutoffStatus.isPreorder ? 'preorder' : 'stall'
  );

  useEffect(() => {
    if (pricingMode === 'preorder' && !cutoffStatus.isPreorder && !overridePreorderCutoff) {
      setPricingMode('stall');
    }
  }, [cutoffStatus.isPreorder, overridePreorderCutoff, pricingMode]);

  const orderType: OrderType =
    pricingMode === 'supplier' ? 'supplier' : pricingMode === 'charity' ? 'charity' : 'customer';
  const customerTier: 'preorder_price' | 'customer_price' =
    pricingMode === 'preorder' ? 'preorder_price' : 'customer_price';

  // Smart Autocomplete: שם + טלפון + סוג משתמש
  const [entityType, setEntityType] = useState<EntityTypeChoice>('customer');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

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
    setRecipientPhone(u.phone || '');
    setShowSuggestions(false);
    if (u.role === 'supplier') {
      setEntityType('supplier');
      setPricingMode('supplier');
    } else {
      setEntityType('customer');
      if (pricingMode === 'supplier') {
        setPricingMode(cutoffStatus.isPreorder || overridePreorderCutoff ? 'preorder' : 'stall');
      }
    }
    if ((u.discount_percent ?? 0) > 0) {
      setDiscountMode('percent');
      setDiscountValue(String(u.discount_percent));
    }
  };

  // הצעות השלמה אוטומטית לפי שם או 4 ספרות אחרונות של הטלפון
  const autocompleteMatches = useMemo(() => {
    const query = recipientName.trim() || recipientPhone.trim();
    const pool = users.filter((u) => u.role !== 'admin');
    if (!query) return pool.slice(0, 6);
    return filterUsersByNameOrPhone(query, pool).slice(0, 6);
  }, [users, recipientName, recipientPhone]);

  const handleNameChange = (val: string) => {
    setRecipientName(val);
    setSelectedUserId('');
    setShowSuggestions(true);
    const digits = val.replace(/\D/g, '');
    if (digits.length === 4) {
      const matches = filterUsersByNameOrPhone(digits, users.filter((u) => u.role !== 'admin'));
      if (matches.length === 1) applySelectedUser(matches[0]);
    }
  };

  const handlePhoneChange = (val: string) => {
    setRecipientPhone(val);
    setSelectedUserId('');
    setShowSuggestions(true);
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 4) {
      const matches = filterUsersByNameOrPhone(digits.slice(-4), users.filter((u) => u.role !== 'admin'));
      if (matches.length === 1) applySelectedUser(matches[0]);
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
      const bundle = getBundleTotal(prod.name, item.quantity);
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

  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validItems = parsedItems.filter((i) => i.quantity > 0);
    if (validItems.length === 0) {
      setError('אין פריטים בהזמנה — הדבק הודעת וואטסאפ או הוסף פריט ידנית.');
      return;
    }

    const finalName = recipientName.trim();
    const finalPhone = recipientPhone.trim();
    if (!finalName && !selectedUserId) {
      setError('יש להזין שם מזמין או לבחור לקוח/ספק קיים.');
      return;
    }

    setSubmitting(true);
    try {
      let userId: number | null = selectedUserId ? Number(selectedUserId) : null;

      // שמירה אוטומטית של משתמש חדש אם הוקלד שם/טלפון שאינם קיימים במערכת
      if (orderType !== 'charity' && !userId && finalName) {
        const existingMatch = users.find(
          (u) =>
            u.name.trim().toLowerCase() === finalName.toLowerCase() ||
            (finalPhone.replace(/\D/g, '').length >= 7 &&
              String(u.phone || '').replace(/\D/g, '') === finalPhone.replace(/\D/g, ''))
        );
        if (existingMatch) {
          userId = existingMatch.id;
        } else {
          const apiRole = entityType === 'supplier' || orderType === 'supplier' ? 'supplier' : 'customer';
          const notesPrefix = entityType === 'other' ? '[אחר] ' : '';
          const createdRes = await apiFetch<{ id: number; user?: User }>('/api/users', {
            method: 'POST',
            body: JSON.stringify({
              name: finalName,
              phone: finalPhone,
              role: apiRole,
              notes: `${notesPrefix}נשמר אוטומטית מהזמנה`.trim(),
            }),
          });
          userId = createdRes.id;
          const createdUser: User = createdRes.user || {
            id: createdRes.id,
            name: finalName,
            phone: finalPhone,
            email: '',
            role: apiRole,
            balance: 0,
            notes: `${notesPrefix}נשמר אוטומטית מהזמנה`.trim(),
          };
          onUserCreated?.(createdUser);
        }
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
          recipient_name: finalName || selectedUser?.name || 'הזמנה',
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
      setRecipientName('');
      setRecipientPhone('');
      setDeliveryFee('0');
      setDiscountValue('0');
      setIncludeVat(false);
      setPaidAmount('0');
      setNotes('');
      setSuccess('ההזמנה נשמרה בהצלחה!');
      await onOrderCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSaveOrder} className={compact ? 'space-y-4' : 'space-y-5'}>
      {success && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
          {error}
        </div>
      )}

      {/* 1. תיבה קומפקטית להדבקת הודעת וואטסאפ */}
      <div className="p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-2">
        <label className="block text-xs font-extrabold text-slate-700">
          הדבקת טקסט חופשי מוואטסאפ (אופציונלי)
        </label>
        <textarea
          rows={2}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder='לדוגמה: "2 סלוף. לחוך. *וחלבה** גדול, 3 זעתר"'
          className="w-full p-2.5 rounded-xl border border-[#E8D5BE] bg-white focus:border-[#C85A17] focus:outline-none text-xs leading-relaxed"
        />
        <button
          type="button"
          onClick={() => runParse(rawText)}
          disabled={!rawText.trim()}
          className="w-full py-2 px-3 rounded-xl bg-[#1E242B] hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>פענח הודעה</span>
        </button>

        {unmatched.length > 0 && (
          <div className="p-2.5 rounded-xl bg-red-100 border border-red-400 text-red-800 text-xs font-bold space-y-1">
            <div className="flex items-center gap-1.5 font-extrabold">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
              <span>לא זוהו אוטומטית:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {unmatched.map((seg, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded bg-red-200/80 border border-red-400">
                  {seg}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 2. בחירת סוג תמחור (Pricing Mode Pills) + כלל 06:00 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-extrabold text-slate-700">סוג תמחור</label>
          {!cutoffStatus.isPreorder && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#8A330B] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overridePreorderCutoff}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setOverridePreorderCutoff(checked);
                  if (checked) setPricingMode('preorder');
                }}
                className="w-3.5 h-3.5 accent-[#C85A17]"
              />
              <Clock className="w-3 h-3" />
              <span>אשר מוקדמת אחרי 06:00</span>
            </label>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {(
            [
              ['preorder', 'הזמנה מוקדמת', !cutoffStatus.isPreorder && !overridePreorderCutoff],
              ['stall', 'מחיר דוכן', false],
              ['supplier', 'מחיר ספק', false],
              ['charity', 'מסובסד', false],
            ] as const
          ).map(([modeKey, label, isDisabled]) => (
            <button
              key={modeKey}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                setPricingMode(modeKey);
                if (modeKey === 'supplier') setEntityType('supplier');
                else if (modeKey !== 'charity' && entityType === 'supplier') setEntityType('customer');
              }}
              className={`py-2 px-2 rounded-xl text-xs font-extrabold border transition-all ${
                pricingMode === modeKey
                  ? 'bg-[#C85A17] text-white border-[#C85A17] shadow-sm'
                  : isDisabled
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-[#FDFBF7] text-slate-700 border-[#E8D5BE] hover:bg-[#FFF7ED]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Smart Autocomplete למזמין (שם + טלפון + סוג משתמש) */}
      <div className="space-y-2 relative">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-extrabold text-slate-700">פרטי מזמין (זיהוי ושמירה אוטומטית)</label>
          {orderType !== 'charity' && (
            <div className="flex items-center gap-1 bg-[#FAF6F0] p-0.5 rounded-lg border border-[#E8D5BE]">
              {(
                [
                  ['customer', 'לקוח'],
                  ['supplier', 'ספק'],
                  ['other', 'אחר'],
                ] as const
              ).map(([et, lbl]) => (
                <button
                  key={et}
                  type="button"
                  onClick={() => {
                    setEntityType(et);
                    if (et === 'supplier') setPricingMode('supplier');
                  }}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                    entityType === et ? 'bg-[#1E242B] text-white' : 'text-slate-600'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="text"
            required
            value={recipientName}
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="שם מלא (או 4 ספרות טלפון)"
            className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm font-semibold"
          />
          <input
            type="tel"
            inputMode="tel"
            value={recipientPhone}
            onFocus={() => setShowSuggestions(true)}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="טלפון נייד"
            className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm tabular-nums"
          />
        </div>

        {selectedUser ? (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
            <UserCheck className="w-3.5 h-3.5" />
            <span>משויך למשתמש קיים: {selectedUser.name}</span>
          </div>
        ) : recipientName.trim() && orderType !== 'charity' ? (
          <div className="text-[11px] text-amber-800 font-semibold">
            משתמש חדש — יישמר אוטומטית ברשימת המשתמשים בעת שמירת ההזמנה.
          </div>
        ) : null}

        {showSuggestions && orderType !== 'charity' && autocompleteMatches.length > 0 && !selectedUser && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {autocompleteMatches.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => applySelectedUser(u)}
                className="px-2.5 py-1 rounded-xl border border-[#E8D5BE] bg-[#FAF6F0] hover:bg-[#FFF7ED] text-xs font-bold text-slate-800"
              >
                {u.name}
                {getPhoneLast4(u.phone) ? ` #${getPhoneLast4(u.phone)}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. פריטי ההזמנה + בחירת טעמים + מבצע כמות + עריכת מחיר ידנית */}
      <div className="border-t border-[#F3E9DC] pt-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-slate-800">פריטים בהזמנה ({parsedItems.length})</h4>
          <div className="flex items-center gap-1.5">
            <select
              value={addProductId}
              onChange={(e) => setAddProductId(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-semibold max-w-[190px]"
            >
              <option value="">+ הוסף מוצר...</option>
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
              className="p-1.5 rounded-xl bg-[#C85A17] text-white disabled:opacity-40"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {parsedItems.length === 0 ? (
          <div className="py-4 px-3 rounded-2xl bg-[#FAF6F0] border border-dashed border-[#E8D5BE] text-center text-xs text-slate-500">
            {hasParsed
              ? 'לא זוהו מוצרים בהודעה. ניתן להוסיף מוצרים ידנית למעלה.'
              : 'הדבק הודעת וואטסאפ או בחר מוצר מהרשימה למעלה.'}
          </div>
        ) : (
          <div className="space-y-2">
            {parsedItems.map((it) => {
              const prod = productMap.get(it.product_id);
              if (!prod) return null;
              const baseUnitPrice = getUnitPrice(prod);
              const hasFlavors = supportsFlavors(prod.name);
              const bundleAvailable =
                orderType === 'customer' && getBundleTotal(prod.name, it.quantity) !== null;
              const lineTotal = getLineTotal(it, prod);
              const flavorList = prod.flavors && prod.flavors.length > 0 ? prod.flavors : DEFAULT_FLAVORS;

              return (
                <div
                  key={it.lineId}
                  className="p-2.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] space-y-2"
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
                    <div className="flex items-center gap-1 shrink-0">
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
                        className="w-8 h-8 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => {
                          const nextQty = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setParsedItems((prev) =>
                            prev.map((row) => (row.lineId === it.lineId ? { ...row, quantity: nextQty } : row))
                          );
                        }}
                        className="w-11 h-8 text-center rounded-xl border border-[#E8D5BE] bg-white font-bold text-xs tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setParsedItems((prev) =>
                            prev.map((row) =>
                              row.lineId === it.lineId ? { ...row, quantity: row.quantity + 1 } : row
                            )
                          )
                        }
                        className="w-8 h-8 rounded-xl bg-[#C85A17] text-white flex items-center justify-center"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setParsedItems((prev) => prev.filter((row) => row.lineId !== it.lineId))
                        }
                        className="w-7 h-8 rounded-xl text-slate-400 hover:text-red-600 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-[#E8D5BE]/60 text-[11px]">
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
                        className="px-2 py-0.5 rounded-lg border border-[#E8D5BE] bg-white font-bold text-slate-700"
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
                        className={`px-2 py-0.5 rounded-lg font-bold border ${
                          it.applyBundle && it.overrideUnitPrice === undefined
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                            : 'bg-white border-[#E8D5BE] text-slate-500'
                        }`}
                      >
                        {it.applyBundle && it.overrideUnitPrice === undefined
                          ? '✓ מבצע כמות'
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

      {/* 5. משלוח, הנחה (₪ או %), תשלום ומע״מ */}
      {orderType !== 'charity' && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">משלוח (₪)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              dir="ltr"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-xs font-bold"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[11px] font-semibold text-slate-500">הנחה להזמנה</label>
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
              min="0"
              step="0.5"
              dir="ltr"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">שולם מראש (₪)</label>
            <input
              type="number"
              min="0"
              step="0.5"
              dir="ltr"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-xs font-bold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-0.5">אמצעי תשלום</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs font-bold"
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

      {/* הערות + סיכום ושמירה */}
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="הערה להזמנה (שעת איסוף, הוראות אריזה...)"
        className="w-full px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs"
      />

      <div className="flex items-center justify-between gap-3 bg-[#FAF6F0] px-3.5 py-2.5 rounded-2xl border border-[#E8D5BE]">
        <div className="tabular-nums">
          <div className="text-[11px] text-slate-500">
            {orderType === 'charity'
              ? `עלות סבסוד: ${formatILS(estimatedCost)}`
              : `${totals.discountILS > 0 ? `הנחה: -${formatILS(totals.discountILS)} · ` : ''}עלות: ${formatILS(estimatedCost)}`}
          </div>
          <div className="text-lg font-extrabold text-[#C85A17]">{formatILS(totals.total)}</div>
        </div>
        <button
          type="submit"
          disabled={submitting || parsedItems.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] disabled:opacity-50 text-white font-bold text-xs shadow-sm"
        >
          <Send className="w-4 h-4" />
          <span>{submitting ? 'שומר...' : 'שמור הזמנה'}</span>
        </button>
      </div>
    </form>
  );
}
