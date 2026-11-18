import React, { useState, useMemo } from 'react';
import {
  MessageSquareText,
  Sparkles,
  UserPlus,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Send,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatILS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../lib/format';
import { parseWhatsAppMessage } from '../lib/whatsappParser';
import type { AdminProduct, OrderType, PaymentMethod, User } from '../types';

interface WhatsAppOrderParserProps {
  fridayDate: string;
  products: AdminProduct[];
  users: User[];
  onOrderCreated: () => Promise<void>;
}

const SAMPLE_MESSAGE = 'היי, 2 כובנות, 2 פרנה שום, 180 סלוף, 130 לחוח';

export function WhatsAppOrderParser({
  fridayDate,
  products,
  users,
  onOrderCreated,
}: WhatsAppOrderParserProps) {
  const [rawText, setRawText] = useState('');
  const [parsedItems, setParsedItems] = useState<Array<{ product_id: number; quantity: number }>>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [hasParsed, setHasParsed] = useState(false);

  const [orderType, setOrderType] = useState<OrderType>('customer');
  const [customerTier, setCustomerTier] = useState<'preorder_price' | 'customer_price'>('preorder_price');
  const [userMode, setUserMode] = useState<'existing' | 'new'>('existing');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [creditDiscount, setCreditDiscount] = useState('0');
  const [paidAmount, setPaidAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bit');
  const [notes, setNotes] = useState('');
  const [addProductId, setAddProductId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const runParse = (textToParse: string) => {
    const res = parseWhatsAppMessage(textToParse, activeProducts);
    setParsedItems(res.items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })));
    setUnmatched(res.unmatched);
    setHasParsed(true);
    setError('');
    setSuccess('');
  };

  const getUnitPrice = (prod: AdminProduct) => {
    if (orderType === 'charity') return 0;
    if (orderType === 'supplier') return prod.supplier_price;
    return prod[customerTier];
  };

  const subtotal = useMemo(() => {
    return parsedItems.reduce((sum, item) => {
      const p = productMap.get(item.product_id);
      if (!p) return sum;
      return sum + item.quantity * getUnitPrice(p);
    }, 0);
  }, [parsedItems, productMap, orderType, customerTier]);

  const totalAmount = useMemo(() => {
    if (orderType === 'charity') return 0;
    return Math.max(0, subtotal + (Number(deliveryFee) || 0) - (Number(creditDiscount) || 0));
  }, [subtotal, deliveryFee, creditDiscount, orderType]);

  const estimatedCost = useMemo(() => {
    return parsedItems.reduce((sum, item) => {
      const p = productMap.get(item.product_id);
      return sum + (p ? item.quantity * p.cost_price : 0);
    }, 0);
  }, [parsedItems, productMap]);

  const filteredUsers = useMemo(() => {
    if (orderType === 'supplier') return users.filter((u) => u.role === 'supplier');
    if (orderType === 'customer') return users.filter((u) => u.role !== 'admin');
    return [];
  }, [users, orderType]);

  const handleAddManualProduct = () => {
    const pid = Number(addProductId);
    if (!pid) return;
    setParsedItems((prev) => {
      const exists = prev.find((i) => i.product_id === pid);
      if (exists) {
        return prev.map((i) => (i.product_id === pid ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { product_id: pid, quantity: 1 }];
    });
    setAddProductId('');
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

      // יצירת משתמש חדש inline במידת הצורך
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

      await apiFetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          order_type: orderType,
          price_tier: customerTier,
          user_id: orderType === 'charity' ? null : userId,
          recipient_name: finalRecipient || users.find((u) => u.id === userId)?.name || 'הזמנה',
          delivery_fee: orderType === 'charity' ? 0 : Number(deliveryFee) || 0,
          credit_discount: orderType === 'charity' ? 0 : Number(creditDiscount) || 0,
          paid_amount: orderType === 'charity' ? 0 : Number(paidAmount) || 0,
          payment_method: paymentMethod,
          notes: notes.trim(),
          items: validItems,
        }),
      });

      setRawText('');
      setParsedItems([]);
      setUnmatched([]);
      setHasParsed(false);
      setSelectedUserId('');
      setRecipientName('');
      setNewUserPhone('');
      setDeliveryFee('0');
      setCreditDiscount('0');
      setPaidAmount('0');
      setNotes('');
      setUserMode('existing');
      setSuccess('ההזמנה נקלטה בהצלחה ועודכנה בריכוז הייצור ובלוח הליקוט!');
      await onOrderCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשמירת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft overflow-hidden">
      <div className="bg-gradient-to-l from-[#1E242B] to-[#3A2419] px-5 py-4 flex flex-wrap items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
            <MessageSquareText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold leading-tight">קליטת הזמנה חכמה מוואטסאפ</h3>
            <p className="text-xs text-amber-200/85">
              הדבק הודעה חופשית בעברית — המערכת מזהה מוצרים, ריבוי, כינויים וכמויות אוטומטית.
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

      <form onSubmit={handleSaveOrder} className="p-5 space-y-5">
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

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* אזור הדבקת הודעת וואטסאפ */}
          <div className="lg:col-span-5 space-y-3">
            <label className="block text-xs font-bold text-slate-700">
              טקסט הודעת הוואטסאפ הגולמית
            </label>
            <textarea
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder='לדוגמה: "היי, 2 כובנות, 2 פרנה שום, 180 סלוף, 130 לחוח"'
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
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>קטעים שלא זוהו אוטומטית:</span>
                </div>
                <div className="text-amber-800">{unmatched.join(' | ')}</div>
              </div>
            )}
          </div>

          {/* פרטי שיוך ההזמנה ותמחור */}
          <div className="lg:col-span-7 space-y-3.5">
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
                      if (t === 'charity') {
                        setUserMode('existing');
                      }
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

            {/* בחירת לקוח/ספק קיים או יצירת חדש */}
            {orderType !== 'charity' ? (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">
                    {orderType === 'supplier' ? 'שיוך לספק' : 'שיוך ללקוח'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setUserMode((m) => (m === 'existing' ? 'new' : 'existing'));
                      setSelectedUserId('');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-[#C85A17] hover:underline"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{userMode === 'existing' ? 'צור משתמש חדש' : 'בחר מרשימה קיימת'}</span>
                  </button>
                </div>

                {userMode === 'existing' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <select
                      value={selectedUserId}
                      onChange={(e) => {
                        const uid = e.target.value;
                        setSelectedUserId(uid);
                        const found = users.find((u) => String(u.id) === uid);
                        if (found) setRecipientName(found.name);
                      }}
                      className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                    >
                      <option value="">ללא חשבון (לקוח מזדמן)</option>
                      {filteredUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} {u.phone ? `(${u.phone})` : ''}
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
                      value={newUserPhone}
                      onChange={(e) => setNewUserPhone(e.target.value)}
                      placeholder="טלפון (אופציונלי)"
                      className="px-3 py-2 rounded-xl border border-[#E8D5BE] bg-white text-sm tabular-nums"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  שם המשפחה / העמותה המקבלת (תרומה — ₪0 הכנסה)
                </label>
                <input
                  type="text"
                  required
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="לדוגמה: משפחת לוי / חלוקת שבת שכונתית"
                  className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-sm"
                />
              </div>
            )}

            {/* משלוח / זכות / תשלום */}
            {orderType !== 'charity' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">משלוח (₪)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">זכות / הנחה (₪)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    dir="ltr"
                    value={creditDiscount}
                    onChange={(e) => setCreditDiscount(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-left tabular-nums text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">שולם מראש (₪)</label>
                  <input
                    type="number"
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
                    {(['cash', 'bit', 'transfer'] as const).map((pm) => (
                      <option key={pm} value={pm}>
                        {PAYMENT_METHOD_LABELS[pm]}
                      </option>
                    ))}
                  </select>
                </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {parsedItems.map((it) => {
                const prod = productMap.get(it.product_id);
                if (!prod) return null;
                const unitPrice = getUnitPrice(prod);
                return (
                  <div
                    key={it.product_id}
                    className="flex items-center justify-between gap-2 p-3 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{prod.name}</div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        {formatILS(unitPrice)} × {it.quantity} ={' '}
                        <span className="font-bold text-[#8A330B]">{formatILS(unitPrice * it.quantity)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => {
                          const nextQty = Math.max(1, Math.floor(Number(e.target.value) || 1));
                          setParsedItems((prev) =>
                            prev.map((row) =>
                              row.product_id === it.product_id ? { ...row, quantity: nextQty } : row
                            )
                          );
                        }}
                        className="w-16 py-1 text-center rounded-lg border border-[#E8D5BE] bg-white font-bold text-sm tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setParsedItems((prev) => prev.filter((row) => row.product_id !== it.product_id))
                        }
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
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
                  ? `עלות תרומה: ${formatILS(estimatedCost)}`
                  : `סה״כ לחיוב (עלות: ${formatILS(estimatedCost)})`}
              </div>
              <div className="text-xl font-extrabold text-[#C85A17]">{formatILS(totalAmount)}</div>
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
