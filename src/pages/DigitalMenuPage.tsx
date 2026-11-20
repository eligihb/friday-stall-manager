import React, { useEffect, useMemo, useState } from 'react';
import {
  Flame,
  Sparkles,
  ShoppingCart,
  Plus,
  Minus,
  Send,
  CheckCircle2,
  Clock,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS, getNextFridayISO } from '../lib/format';
import { getFridayPricingStatus } from '../lib/pricingCutoff';
import { isProductInStock, loadStockMap } from '../lib/stockState';
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

const LIVE_STEPS = [
  '1. ממתין לאישור המוכר',
  '2. ההזמנה אושרה והתקבלה',
  '3. מוכן למסירה',
  '4. נמסר',
];

export function DigitalMenuPage() {
  const [data, setData] = useState<StorefrontData | null>(null);
  const [stockMap] = useState(() => loadStockMap());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fridayDate] = useState(getNextFridayISO());
  const pricing = useMemo(() => getFridayPricingStatus(fridayDate), [fridayDate]);

  const [cart, setCart] = useState<Record<number, number>>({});
  const [cartOpen, setCartOpen] = useState(false);

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

  const products = useMemo(() => (data?.products || []).filter((p) => p.is_active), [data]);

  const getPrice = (p: StorefrontProduct) =>
    pricing.isPreorder ? p.preorder_price : p.customer_price;

  const cartLines = useMemo(
    () =>
      products
        .filter((p) => (cart[p.id] || 0) > 0)
        .map((p) => ({
          product: p,
          quantity: cart[p.id],
          unit_price: getPrice(p),
        })),
    [products, cart, pricing.isPreorder]
  );

  const totalItems = useMemo(() => cartLines.reduce((s, l) => s + l.quantity, 0), [cartLines]);
  const totalAmount = useMemo(
    () => cartLines.reduce((s, l) => s + l.quantity * l.unit_price, 0),
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

      const res = await apiFetch<{ id?: number; order?: { id: number } }>('/api/public/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          recipient_name: customerName.trim(),
          phone: customerPhone.trim(),
          notes: notes.trim(),
          items: cartLines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        }),
      });
      const orderId = res.order?.id ?? res.id ?? Date.now();
      const waText = formatPublicApprovalWhatsApp({
        id: orderId,
        business_name: data?.business_name || 'המטבח התימני – תפריט יום שישי',
        recipient_name: customerName.trim(),
        phone: customerPhone.trim(),
        friday_date: fridayDate,
        pricing_mode: pricing.mode,
        items: cartLines.map((l) => ({
          product_name: l.product.name,
          quantity: l.quantity,
          unit_price: l.unit_price,
        })),
        total_amount: totalAmount,
        notes: notes.trim(),
      });
      const waUrl = buildWhatsAppShareUrl(waText, data?.admin_whatsapp_phone);
      setSubmitted({ orderId, waUrl, total: totalAmount });
      setCart({});
      setNotes('');
      setCartOpen(false);
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2B1B12] via-[#FAF3E8] to-[#F5E6D3] text-[#1E242B] pb-24">
      {/* כותרת יוקרתית בגווני חום-זהב ואפייה ביתית */}
      <header className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-6 text-center text-white bg-gradient-to-b from-[#2B1B12] to-[#4A2816] shadow-lg">
        <div className="max-w-lg mx-auto space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[#E59838] to-[#C85A17] flex items-center justify-center shadow-lg border border-amber-300/40">
            <Flame className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="font-serif text-3xl font-extrabold tracking-tight text-amber-50">
              המטבח התימני – תפריט יום שישי
            </h1>
            <p className="text-xs text-amber-200/90 mt-1">
              מאפים תימניים טריים מהטאבון לשבת · {formatFridayLabel(fridayDate)}
            </p>
          </div>

          {/* באנר מבצע הזמנה מוקדמת */}
          <div className="rounded-2xl bg-gradient-to-l from-amber-500/25 to-orange-500/25 border border-amber-300/40 px-4 py-2.5 text-xs font-bold text-amber-100 flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
            <span>
              {pricing.isPreorder
                ? 'מבצע הזמנה מוקדמת פעיל! (עד יום שישי בשעה 06:00 בבוקר)'
                : 'שעת ההזמנה המוקדמת (06:00) חלפה — חל מחירון דוכן רגיל'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-2xl bg-gradient-to-l from-[#E59838] to-[#C85A17] hover:brightness-110 text-white font-extrabold text-sm shadow-lg active:scale-[0.98] transition-all"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>הזמן עכשיו 🛒 {totalItems > 0 ? `(${totalItems})` : ''}</span>
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 -mt-3 space-y-4">
        {/* מעקב שלבים חי מיד לאחר שליחת ההזמנה */}
        {submitted && (
          <section className="bg-white rounded-3xl border-2 border-emerald-400 shadow-card p-5 space-y-3.5">
            <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-base">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>הזמנה #{submitted.orderId} נשלחה לאישור המוכר!</span>
            </div>

            <div className="space-y-2">
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex gap-1">
                <div className="flex-1 bg-red-600" />
                <div className="flex-1 bg-slate-200" />
                <div className="flex-1 bg-slate-200" />
                <div className="flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[11px] font-bold">
                {LIVE_STEPS.map((st, idx) => (
                  <span key={st} className={idx === 0 ? 'text-red-700 font-extrabold' : 'text-slate-400'}>
                    {st}
                  </span>
                ))}
              </div>
            </div>

            <a
              href={submitted.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-4 rounded-xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm"
            >
              <ExternalLink className="w-4 h-4" />
              <span>פתח וואטסאפ לאישור הזמנה ({formatILS(submitted.total)})</span>
            </a>
          </section>
        )}

        {/* כרטיס מבצעי כמות וטעמים */}
        <section className="bg-white/95 rounded-3xl border border-[#DFC3A0] shadow-soft p-4 space-y-2">
          <div className="text-xs font-extrabold text-[#8A330B] flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#C85A17]" />
            <span>מבצעי כמות וטעמים מיוחדים</span>
          </div>
          <ul className="text-xs text-slate-700 space-y-1 leading-relaxed">
            <li>
              • <strong>פיתות זעתר / שום / שומשום:</strong> יחידה <strong>5 ₪</strong> · שלישייה{' '}
              <strong>12 ₪</strong> · שישייה <strong>20 ₪</strong>
            </li>
            <li>
              • <strong>ג&apos;חנון:</strong> יחידה <strong>9 ₪</strong> · מ-5 יחידות ומעלה{' '}
              <strong>8 ₪ ליחידה</strong> (40 ₪ ל-5)
            </li>
            <li>
              • <strong>פרנה גדולה ופיתה מלבנית:</strong> זמינות בטעמים{' '}
              <span className="font-bold text-[#8A330B]">רגיל / שום / שומשום / זעתר</span>
            </li>
          </ul>
        </section>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {/* רשימת התפריט */}
        {loading ? (
          <div className="bg-white rounded-3xl p-10 text-center text-sm text-slate-400 border border-[#DFC3A0]">
            טוען את התפריט הטרי...
          </div>
        ) : (
          <section className="bg-white rounded-3xl border border-[#DFC3A0] shadow-card divide-y divide-[#F3E9DC] overflow-hidden">
            {products.map((p) => {
              const inStock = isProductInStock(p.id, stockMap);
              const qty = cart[p.id] || 0;
              const price = getPrice(p);
              return (
                <div
                  key={p.id}
                  className={`p-4 flex items-center justify-between gap-3 ${
                    !inStock ? 'bg-slate-50 opacity-65' : qty > 0 ? 'bg-[#FFF7ED]' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-base text-slate-900">{p.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {inStock ? 'במלאי' : 'אזל מהמלאי'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 tabular-nums">
                      <span className="text-base font-extrabold text-[#C85A17]">{formatILS(price)}</span>
                      {pricing.isPreorder && p.customer_price > p.preorder_price && (
                        <span className="text-xs text-slate-400 line-through">
                          {formatILS(p.customer_price)}
                        </span>
                      )}
                    </div>
                  </div>

                  {inStock ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {qty > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => stepQty(p.id, -1)}
                            className="w-10 h-10 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="w-7 text-center font-extrabold text-sm tabular-nums">{qty}</span>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => stepQty(p.id, 1)}
                        className="w-10 h-10 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white flex items-center justify-center shadow-sm"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-red-600 shrink-0">לא זמין</span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* כפתור הזמן עכשיו בתחתית התפריט */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-l from-[#E59838] to-[#C85A17] hover:brightness-110 text-white font-extrabold text-base shadow-lg flex items-center justify-center gap-2"
          >
            <ShoppingCart className="w-5 h-5" />
            <span>
              הזמן עכשיו 🛒 {totalItems > 0 ? `(${totalItems} פריטים · ${formatILS(totalAmount)})` : ''}
            </span>
          </button>
        </div>
      </main>

      {/* חלונית סל ההזמנה של הלקוח */}
      <BottomSheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="סל ההזמנה שלך"
        subtitle={`יום שישי · ${formatFridayLabel(fridayDate)}`}
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleSendOrder} className="space-y-4">
          {cartLines.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">
              הסל ריק — בחר מאפים מהתפריט באמצעות כפתור ה-+ ואז לחץ ״הזמן עכשיו״.
            </div>
          ) : (
            <>
              <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-2xl overflow-hidden">
                {cartLines.map((l) => (
                  <div key={l.product.id} className="p-3 flex items-center justify-between text-sm bg-[#FAF6F0]">
                    <span className="font-bold text-slate-800">
                      {l.quantity}× {l.product.name}
                    </span>
                    <span className="font-extrabold text-[#8A330B] tabular-nums">
                      {formatILS(l.quantity * l.unit_price)}
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
                placeholder="הערות / טעמים מבוקשים (זעתר, שום, שומשום...)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#E8D5BE] bg-white text-sm"
              />

              {/* הודעה ברורה לפני שליחה על אימות בוואטסאפ */}
              <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  למניעת טעויות וזיופים, לחיצה על ״שלח הזמנה״ תעביר אותך לוואטסאפ לשליחת ההזמנה למוכר לצורך אישור.
                </span>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[52px] py-3 rounded-2xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-md"
              >
                <Send className="w-4 h-4" />
                <span>
                  {submitting ? 'שולח...' : `שלח הזמנה לאישור בוואטסאפ (${formatILS(totalAmount)})`}
                </span>
              </button>
            </>
          )}
        </form>
      </BottomSheet>
    </div>
  );
}
