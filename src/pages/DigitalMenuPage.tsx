import React, { useEffect, useMemo, useState } from 'react';
import {
  Flame,
  Sparkles,
  Plus,
  Minus,
  Send,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS, getNextFridayISO } from '../lib/format';
import { isProductInStock, loadStockMap } from '../lib/stockState';
import {
  DEFAULT_ADMIN_WHATSAPP,
  isCustomerPreorderActive,
  isProductVisibleToCustomers,
  loadStorefrontConfig,
} from '../lib/storefrontConfig';
import { buildWhatsAppShareUrl, formatPublicApprovalWhatsApp } from '../lib/whatsappFormat';
import { BottomSheet } from '../components/BottomSheet';

interface StorefrontProduct {
  id: number;
  name: string;
  preorder_price: number;
  customer_price: number;
  image_url?: string | null;
  is_active: boolean;
}

interface StorefrontData {
  business_name: string;
  admin_whatsapp_phone: string;
  whatsapp_footer: string;
  products: StorefrontProduct[];
}

const CUSTOMER_PROFILE_KEY = 'ht_public_customer_profile_v1';
const FLAVOR_OPTIONS = ['רגיל', 'שום', 'שומשום', 'זעתר'];

const LIVE_STEPS = [
  '1. ממתין לאישור',
  '2. אושרה והתקבלה',
  '3. מוכן למסירה',
  '4. נמסר',
];

function isSalufOrLahoh(name: string): boolean {
  return name.includes('סלוף') || name.includes('סאלוף') || name.includes('לחוח');
}

function supportsFlavor(name: string): boolean {
  return name.includes('פרנה גדולה') || name.includes('פיתה מלבנית');
}

function calcLinePrice(
  product: StorefrontProduct,
  qty: number,
  preorderOpen: boolean
): { unitPrice: number; lineTotal: number; appliedPreorder: boolean } {
  if (qty <= 0) {
    const base = preorderOpen && !isSalufOrLahoh(product.name) ? product.preorder_price : product.customer_price;
    return { unitPrice: base, lineTotal: 0, appliedPreorder: false };
  }

  // חוק סלוף ולחוח: מ-5 יחידות ומעלה -> מחיר הזמנה מוקדמת (בחלון הזמן); מתחת ל-5 -> מחיר דוכן רגיל
  if (isSalufOrLahoh(product.name)) {
    const qualifies = preorderOpen && qty >= 5;
    const unit = qualifies ? product.preorder_price : product.customer_price;
    return {
      unitPrice: unit,
      lineTotal: Math.round(unit * qty * 100) / 100,
      appliedPreorder: qualifies,
    };
  }

  // מבצע כמות פיתות זעתר / שום / שומשום / מלבנית: 5 ₪ יח׳, 12 ₪ לשלישייה, 20 ₪ לשישייה
  if (
    product.name.includes('פיתה מלבנית') ||
    (product.name.includes('פיתה') &&
      (product.name.includes('זעתר') || product.name.includes('שום') || product.name.includes('שומשום')))
  ) {
    const packs6 = Math.floor(qty / 6);
    const rem6 = qty % 6;
    const packs3 = Math.floor(rem6 / 3);
    const singles = rem6 % 3;
    const lineTotal = packs6 * 20 + packs3 * 12 + singles * 5;
    return {
      unitPrice: Math.round((lineTotal / qty) * 100) / 100,
      lineTotal,
      appliedPreorder: false,
    };
  }

  // מבצע כמות ג'חנון: יחידה 9 ₪, 5 ומעלה 8 ₪ ליחידה
  if (product.name.includes("ג'חנון") || product.name.includes('גחנון')) {
    const unit = qty >= 5 ? 8 : 9;
    return {
      unitPrice: unit,
      lineTotal: unit * qty,
      appliedPreorder: qty >= 5,
    };
  }

  const unit = preorderOpen ? product.preorder_price : product.customer_price;
  return {
    unitPrice: unit,
    lineTotal: Math.round(unit * qty * 100) / 100,
    appliedPreorder: preorderOpen && product.preorder_price < product.customer_price,
  };
}

export function DigitalMenuPage() {
  const [data, setData] = useState<StorefrontData | null>(null);
  const [stockMap] = useState(() => loadStockMap());
  const [storefrontCfg] = useState(() => loadStorefrontConfig());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fridayDate] = useState(getNextFridayISO());
  const preorderOpen = useMemo(
    () => isCustomerPreorderActive(fridayDate, storefrontCfg.customerPriceMode),
    [fridayDate, storefrontCfg.customerPriceMode]
  );

  const [cart, setCart] = useState<Record<number, number>>({});
  const [flavors, setFlavors] = useState<Record<number, string>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [customerName, setCustomerName] = useState(() => {
    try {
      return String(JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || '{}').name || '');
    } catch {
      return '';
    }
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      return String(JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || '{}').phone || '');
    } catch {
      return '';
    }
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{
    orderId: number;
    waUrl: string;
    total: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<StorefrontData>('/api/public/storefront')
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'שגיאה בטעינת התפריט');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // הצגת מוצרים פעילים ושאינם מוסתרים מלקוחות בלבד
  const visibleProducts = useMemo(
    () =>
      (data?.products || []).filter(
        (p) => p.is_active && isProductVisibleToCustomers(p.id, storefrontCfg)
      ),
    [data, storefrontCfg]
  );

  const cartLines = useMemo(
    () =>
      visibleProducts
        .filter((p) => (cart[p.id] || 0) > 0)
        .map((p) => {
          const qty = cart[p.id];
          const calc = calcLinePrice(p, qty, preorderOpen);
          const flavor = supportsFlavor(p.name) ? flavors[p.id] || 'רגיל' : undefined;
          return {
            product: p,
            quantity: qty,
            flavor,
            unit_price: calc.unitPrice,
            line_total: calc.lineTotal,
          };
        }),
    [visibleProducts, cart, flavors, preorderOpen]
  );

  const totalItems = useMemo(() => cartLines.reduce((s, l) => s + l.quantity, 0), [cartLines]);
  const totalAmount = useMemo(
    () => Math.round(cartLines.reduce((s, l) => s + l.line_total, 0) * 100) / 100,
    [cartLines]
  );

  const stepQty = (pid: number, delta: number) => {
    setCart((prev) => ({ ...prev, [pid]: Math.max(0, (prev[pid] || 0) + delta) }));
  };

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartLines.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      try {
        localStorage.setItem(
          CUSTOMER_PROFILE_KEY,
          JSON.stringify({ name: customerName.trim(), phone: customerPhone.trim() })
        );
      } catch {
        // ignore
      }

      const flavorNotes = cartLines
        .filter((l) => l.flavor)
        .map((l) => `${l.product.name}: ${l.flavor}`);
      const combinedNotes = [notes.trim(), ...flavorNotes].filter(Boolean).join(' | ');

      const res = await apiFetch<{ id?: number; order?: { id: number } }>('/api/public/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          recipient_name: customerName.trim(),
          phone: customerPhone.trim(),
          notes: combinedNotes,
          items: cartLines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        }),
      });
      const orderId = res.order?.id ?? res.id ?? Date.now();
      const targetPhone =
        data?.admin_whatsapp_phone && data.admin_whatsapp_phone !== '050-5551000'
          ? data.admin_whatsapp_phone
          : DEFAULT_ADMIN_WHATSAPP;

      const waText = formatPublicApprovalWhatsApp({
        id: orderId,
        business_name: data?.business_name || 'המטבח התימני – תפריט יום שישי',
        recipient_name: customerName.trim(),
        phone: customerPhone.trim(),
        friday_date: fridayDate,
        pricing_mode: preorderOpen ? 'preorder' : 'stall',
        items: cartLines.map((l) => ({
          product_name: l.flavor ? `${l.product.name} (${l.flavor})` : l.product.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
        total_amount: totalAmount,
        notes: combinedNotes,
      });
      const waUrl = buildWhatsAppShareUrl(waText, targetPhone);
      setSubmitted({ orderId, waUrl, total: totalAmount });
      setCart({});
      setNotes('');
      setCheckoutOpen(false);
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF5EE] text-[#1E242B] pb-28">
      {/* כותרת קצרה, נקייה ומזמינה */}
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-gradient-to-b from-[#2B1B12] to-[#4A2816] text-white shadow-md">
        <div className="max-w-lg mx-auto space-y-2.5 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E59838] to-[#C85A17] flex items-center justify-center shadow">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-serif text-2xl font-extrabold text-amber-50">
              המטבח התימני – תפריט שישי
            </h1>
          </div>

          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/40 text-[11px] font-bold text-amber-100">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>
              {preorderOpen
                ? `מבצע הזמנה מוקדמת פעיל (א׳–ו׳ 06:00) · ${formatFridayLabel(fridayDate)}`
                : `מחירון דוכן רגיל · ${formatFridayLabel(fridayDate)}`}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3.5 pt-3.5 space-y-3">
        {/* מעקב שלבים חי לאחר שליחה */}
        {submitted && (
          <section className="bg-white rounded-2xl border-2 border-emerald-400 shadow-soft p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>הזמנה #{submitted.orderId} נשלחה לאישור המוכר!</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex gap-1">
              <div className="flex-1 bg-red-600" />
              <div className="flex-1 bg-slate-200" />
              <div className="flex-1 bg-slate-200" />
              <div className="flex-1 bg-slate-200" />
            </div>
            <div className="grid grid-cols-4 text-center text-[10px] font-bold">
              {LIVE_STEPS.map((st, idx) => (
                <span key={st} className={idx === 0 ? 'text-red-700 font-extrabold' : 'text-slate-400'}>
                  {st}
                </span>
              ))}
            </div>
            <a
              href={submitted.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>פתח וואטסאפ לאישור הזמנה ({formatILS(submitted.total)})</span>
            </a>
          </section>
        )}

        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            {error}
          </div>
        )}

        {/* רשימת מוצרים נקייה, מרווחת וקלה לסריקה */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-400 border border-[#E8D5BE]">
            טוען תפריט...
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibleProducts.map((p) => {
              const inStock = isProductInStock(p.id, stockMap);
              const qty = cart[p.id] || 0;
              const salufLahoh = isSalufOrLahoh(p.name);
              const hasFlavors = supportsFlavor(p.name);
              const calc = calcLinePrice(p, qty > 0 ? qty : 1, preorderOpen);
              const displayPrice =
                salufLahoh && qty < 5
                  ? p.customer_price
                  : calc.unitPrice;

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-3.5 border transition-all space-y-2 ${
                    !inStock
                      ? 'bg-slate-50 border-slate-200 opacity-65'
                      : qty > 0
                      ? 'bg-[#FFF7ED] border-[#C85A17] shadow-sm'
                      : 'bg-white border-[#E8D5BE]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-base text-slate-900">{p.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {inStock ? 'במלאי' : 'אזל מהמלאי'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 flex-wrap tabular-nums">
                        <span className="text-base font-extrabold text-[#C85A17]">
                          {formatILS(displayPrice)}
                        </span>
                        {salufLahoh && preorderOpen && qty < 5 && (
                          <span className="text-[11px] font-bold text-amber-800 bg-amber-100/80 px-1.5 py-0.5 rounded-md">
                            מבצע מוקדמת מ-5 יח&apos; ({formatILS(p.preorder_price)})
                          </span>
                        )}
                        {salufLahoh && preorderOpen && qty >= 5 && (
                          <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                            מחיר מוקדמת פעיל ✓
                          </span>
                        )}
                      </div>
                    </div>

                    {/* כפתורי -/+ גדולים ונוחים למגע */}
                    {inStock ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        {qty > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => stepQty(p.id, -1)}
                              className="w-10 h-10 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                              aria-label="הפחת"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                            <span className="w-6 text-center font-extrabold text-sm tabular-nums">{qty}</span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => stepQty(p.id, 1)}
                          className="w-10 h-10 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white flex items-center justify-center shadow-sm active:scale-95"
                          aria-label="הוסף"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-red-600 shrink-0">לא זמין</span>
                    )}
                  </div>

                  {/* שורה תחתונה קומפקטית: חבילת 5 יח' לסלוף/לחוח או בחירת טעם */}
                  {inStock && (salufLahoh || hasFlavors) && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-[#F3E9DC]">
                      {salufLahoh && (
                        <button
                          type="button"
                          onClick={() => stepQty(p.id, 5)}
                          className="px-2.5 py-1 rounded-xl bg-[#FFF7ED] hover:bg-[#FFEDD5] border border-[#C85A17]/40 text-[#8A330B] text-xs font-extrabold"
                        >
                          + חבילת 5 יח&apos;
                        </button>
                      )}
                      {hasFlavors &&
                        FLAVOR_OPTIONS.map((fl) => {
                          const active = (flavors[p.id] || 'רגיל') === fl;
                          return (
                            <button
                              key={fl}
                              type="button"
                              onClick={() => setFlavors((prev) => ({ ...prev, [p.id]: fl }))}
                              className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                                active
                                  ? 'bg-[#1E242B] text-white border-[#1E242B]'
                                  : 'bg-[#FAF6F0] text-slate-600 border-[#E8D5BE]'
                              }`}
                            >
                              {fl}
                            </button>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* סרגל סיכום צף בתחתית המסך */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8D5BE] shadow-[0_-6px_24px_rgba(30,36,43,0.12)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="tabular-nums">
            <div className="text-[11px] font-bold text-slate-500">
              {totalItems > 0 ? `${totalItems} פריטים בסל` : 'בחר מוצרים מהתפריט'}
            </div>
            <div className="text-xl font-extrabold text-[#C85A17]">{formatILS(totalAmount)}</div>
          </div>
          <button
            type="button"
            disabled={totalItems === 0}
            onClick={() => setCheckoutOpen(true)}
            className="px-5 py-3 rounded-2xl bg-[#25D366] hover:bg-[#1EB958] disabled:opacity-45 text-white font-extrabold text-sm flex items-center gap-2 shadow-md active:scale-[0.98]"
          >
            <Send className="w-4 h-4" />
            <span>שלח הזמנה בוואטסאפ</span>
          </button>
        </div>
      </div>

      {/* חלונית השלמת פרטים ושליחה בוואטסאפ */}
      <BottomSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="אישור ושליחת הזמנה"
        subtitle={`סה״כ לתשלום: ${formatILS(totalAmount)}`}
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleSendOrder} className="space-y-3.5">
          <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-2xl overflow-hidden">
            {cartLines.map((l) => (
              <div key={l.product.id} className="p-2.5 flex items-center justify-between text-xs bg-[#FAF6F0]">
                <span className="font-bold text-slate-800">
                  {l.quantity}× {l.product.name}
                  {l.flavor ? ` (${l.flavor})` : ''}
                </span>
                <span className="font-extrabold text-[#8A330B] tabular-nums">
                  {formatILS(l.line_total)}
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="שם מלא *"
              className="px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-sm font-semibold"
            />
            <input
              type="tel"
              required
              inputMode="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="טלפון נייד *"
              className="px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-sm tabular-nums"
            />
          </div>

          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="הערות להזמנה (אופציונלי)"
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-sm"
          />

          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] font-bold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span>ההזמנה נשלחת בוואטסאפ למוכר לצורך אישור סופי.</span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[50px] py-3 rounded-2xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'שולח...' : `שלח הזמנה בוואטסאפ (${formatILS(totalAmount)})`}</span>
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
