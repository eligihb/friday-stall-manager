import React, { useEffect, useState, useMemo } from 'react';
import {
  Flame,
  Plus,
  Minus,
  ShoppingBag,
  Clock,
  Sparkles,
  Send,
  CheckCircle2,
  Lock,
  Calendar,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  formatFridayLabel,
  formatILS,
  formatShortFriday,
  getNextFridayISO,
  getUpcomingFridays,
} from '../lib/format';
import { getFridayPricingStatus } from '../lib/pricingCutoff';
import { buildWhatsAppShareUrl, formatPublicApprovalWhatsApp } from '../lib/whatsappFormat';
import { APP_BRAND_NAME, APP_VERSION } from '../lib/version';
import { BottomSheet } from '../components/BottomSheet';

const CUSTOMER_PROFILE_KEY = 'ht_public_customer_profile_v1';

interface StorefrontProduct {
  id: number;
  name: string;
  preorder_price: number;
  customer_price: number;
  is_active: boolean;
}

interface StorefrontData {
  business_name: string;
  admin_whatsapp_phone: string;
  whatsapp_footer: string;
  products: StorefrontProduct[];
}

interface SubmittedReceipt {
  id: number;
  friday_date: string;
  recipient_name: string;
  phone: string;
  pricing_mode: 'preorder' | 'stall';
  total_amount: number;
  whatsappUrl: string;
}

interface PublicStorefrontProps {
  onOpenStaffLogin: () => void;
}

export function PublicStorefront({ onOpenStaffLogin }: PublicStorefrontProps) {
  const [storefront, setStorefront] = useState<StorefrontData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [fridayDate, setFridayDate] = useState(getNextFridayISO());
  const [cart, setCart] = useState<Record<number, number>>({});
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // פרטי לקוח שמורים ב-localStorage לביקורים הבאים
  const [customerName, setCustomerName] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || '{}');
      return String(saved.name || '');
    } catch {
      return '';
    }
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || '{}');
      return String(saved.phone || '');
    } catch {
      return '';
    }
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<SubmittedReceipt | null>(null);

  // עדכון בדיקת השעה כל 30 שניות למקרה שהלקוח פתוח בדיוק ב-05:00 בבוקר בשישי
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<StorefrontData>('/api/public/storefront')
      .then((data) => {
        if (!active) return;
        setStorefront(data);
        setError('');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת התפריט');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const upcomingFridays = useMemo(() => getUpcomingFridays(4), []);
  const pricing = useMemo(
    () => getFridayPricingStatus(fridayDate, new Date(nowTick)),
    [fridayDate, nowTick]
  );

  const products = storefront?.products ?? [];
  const businessName = storefront?.business_name || APP_BRAND_NAME;

  const getActivePrice = (p: StorefrontProduct) =>
    pricing.isPreorder ? p.preorder_price : p.customer_price;

  const cartSummary = useMemo(() => {
    let count = 0;
    let total = 0;
    let stallTotal = 0;
    for (const p of products) {
      const q = cart[p.id] || 0;
      if (q <= 0) continue;
      count += q;
      total += q * getActivePrice(p);
      stallTotal += q * p.customer_price;
    }
    return {
      count,
      total: Math.round(total * 100) / 100,
      savings: pricing.isPreorder ? Math.max(0, Math.round((stallTotal - total) * 100) / 100) : 0,
    };
  }, [products, cart, pricing.isPreorder]);

  const stepItem = (productId: number, delta: number) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[productId] || 0) + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      return { ...prev, [productId]: next };
    });
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const items = Object.entries(cart)
      .filter(([, q]) => q > 0)
      .map(([product_id, quantity]) => ({ product_id: Number(product_id), quantity }));

    if (items.length === 0) return;

    const cleanName = customerName.trim();
    const cleanPhone = customerPhone.trim();
    if (!cleanName || !cleanPhone) {
      setError('יש להזין שם מלא ומספר טלפון');
      return;
    }

    // שמירת פרטי הלקוח לביקורים הבאים
    try {
      localStorage.setItem(
        CUSTOMER_PROFILE_KEY,
        JSON.stringify({ name: cleanName, phone: cleanPhone })
      );
    } catch {}

    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch<{
        id: number;
        friday_date: string;
        recipient_name: string;
        phone: string;
        pricing_mode: 'preorder' | 'stall';
        total_amount: number;
        items: Array<{ product_name: string; quantity: number; unit_price: number }>;
        business_name: string;
        admin_whatsapp_phone: string;
      }>('/api/public/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          recipient_name: cleanName,
          phone: cleanPhone,
          notes: notes.trim(),
          items,
        }),
      });

      const waText = formatPublicApprovalWhatsApp({
        id: res.id,
        business_name: res.business_name,
        recipient_name: res.recipient_name,
        phone: res.phone,
        friday_date: res.friday_date,
        pricing_mode: res.pricing_mode,
        items: res.items,
        total_amount: res.total_amount,
        notes: notes.trim(),
      });
      const waUrl = buildWhatsAppShareUrl(waText, res.admin_whatsapp_phone);

      setReceipt({
        id: res.id,
        friday_date: res.friday_date,
        recipient_name: res.recipient_name,
        phone: res.phone,
        pricing_mode: res.pricing_mode,
        total_amount: res.total_amount,
        whatsappUrl: waUrl,
      });
      setCart({});
      setNotes('');

      // פתיחה מיידית של וואטסאפ לאישור מול המנהל
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF6F0] text-[#1E242B] flex flex-col">
      {/* כותרת עליונה דביקה ונקייה ללקוחות בלבד — ללא תפריטי ניהול/ספקים */}
      <header className="sticky top-0 z-30 bg-[#1E242B] text-white border-b border-white/10 shadow-md">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#C85A17] to-[#D97706] flex items-center justify-center shadow-md shrink-0">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-serif text-xl sm:text-2xl font-bold leading-none truncate">
                  {businessName}
                </h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/10 text-amber-300 tabular-nums shrink-0">
                  {APP_VERSION}
                </span>
              </div>
              <p className="text-[11px] text-amber-200/85 mt-0.5 truncate">
                מאפים תימניים טריים ליום שישי — הזמנה ישירה ללא הרשמה
              </p>
            </div>
          </div>

          {/* קישור קטן ודיסקרטי בפינה לכניסת ספקים / ניהול */}
          <button
            type="button"
            onClick={onOpenStaffLogin}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/15 text-[11px] font-semibold text-slate-300 hover:text-white border border-white/10 shrink-0 transition-colors"
          >
            <Lock className="w-3 h-3" />
            <span>כניסת ספקים / ניהול</span>
          </button>
        </div>
      </header>

      {/* גוף תפריט ההזמנות */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-3.5 sm:px-6 pt-4 pb-28 space-y-4">
        {/* באנר בחירת יום שישי + חיווי כלל השעה 05:00 */}
        <div className="bg-white rounded-3xl border border-[#E8D5BE] shadow-soft p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Calendar className="w-4 h-4 text-[#C85A17]" />
              <span>לאיזה יום שישי להכין?</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {upcomingFridays.map((fri, idx) => {
                const active = fridayDate === fri;
                return (
                  <button
                    key={fri}
                    type="button"
                    onClick={() => setFridayDate(fri)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      active
                        ? 'bg-[#C85A17] text-white shadow-sm'
                        : 'bg-[#FAF6F0] text-slate-700 border border-[#E8D5BE] hover:bg-[#FFF7ED]'
                    }`}
                  >
                    {formatShortFriday(fri)}
                    {idx === 0 ? ' (הקרוב)' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className={`rounded-2xl px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 ${
              pricing.isPreorder
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border border-amber-300 text-amber-950'
            }`}
          >
            {pricing.isPreorder ? (
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
            )}
            <span>{pricing.badgeText}</span>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">
            {error}
          </div>
        )}

        {/* רשימת מוצרים מותאמת למובייל */}
        {loading ? (
          <div className="bg-white rounded-3xl p-12 text-center text-slate-400 border border-[#E8D5BE]">
            טוען את התפריט הטרי...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {products.map((p) => {
              const qty = cart[p.id] || 0;
              const activePrice = getActivePrice(p);
              const discountAmount =
                pricing.isPreorder && p.customer_price > p.preorder_price
                  ? Math.round((p.customer_price - p.preorder_price) * 100) / 100
                  : 0;

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl p-4 border transition-all flex items-center justify-between gap-3 ${
                    qty > 0
                      ? 'bg-[#FFF7ED] border-[#C85A17] shadow-card'
                      : 'bg-white border-[#E8D5BE]/85 shadow-soft'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-base text-slate-900 truncate">{p.name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap tabular-nums">
                      <span className="text-lg font-extrabold text-[#C85A17]">
                        {formatILS(activePrice)}
                      </span>
                      {discountAmount > 0 && (
                        <>
                          <span className="text-xs text-slate-400 line-through">
                            {formatILS(p.customer_price)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                            הנחת הזמנה מוקדמת
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* כפתורי + / - גדולים לאגודל */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {qty > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => stepItem(p.id, -1)}
                          className="w-11 h-11 rounded-2xl bg-white border border-[#E8D5BE] flex items-center justify-center active:scale-95 transition-transform"
                          aria-label={`הפחת ${p.name}`}
                        >
                          <Minus className="w-4 h-4 text-slate-700" />
                        </button>
                        <span className="min-w-[28px] text-center font-extrabold text-base tabular-nums text-slate-900">
                          {qty}
                        </span>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => stepItem(p.id, 1)}
                      className="w-11 h-11 rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                      aria-label={`הוסף ${p.name}`}
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* סרגל סל תחתון קבוע (Mobile-First, min-height: 56px) */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8D5BE] shadow-[0_-6px_24px_rgba(30,36,43,0.12)] px-3.5 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="tabular-nums">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <ShoppingBag className="w-3.5 h-3.5 text-[#C85A17]" />
              <span>{cartSummary.count > 0 ? `${cartSummary.count} פריטים בסל` : 'בחר מאפים מהתפריט'}</span>
              {cartSummary.savings > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                  חסכת {formatILS(cartSummary.savings)}
                </span>
              )}
            </div>
            <div className="text-xl font-extrabold text-slate-900 leading-tight">
              {formatILS(cartSummary.total)}
            </div>
          </div>

          <button
            type="button"
            disabled={cartSummary.count === 0}
            onClick={() => {
              setReceipt(null);
              setError('');
              setCheckoutOpen(true);
            }}
            className="min-h-[56px] px-6 rounded-2xl bg-gradient-to-l from-[#C85A17] to-[#A9440F] hover:brightness-105 disabled:opacity-45 text-white font-extrabold text-sm sm:text-base shadow-md flex items-center gap-2 active:scale-[0.98] transition-all"
          >
            <span>המשך לאישור</span>
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* חלונית Bottom Sheet לסיום הזמנה ושליחה לאישור בוואטסאפ */}
      <BottomSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title={receipt ? `הזמנה #${receipt.id} נשלחה לאישור!` : 'אישור ושליחת הזמנה בוואטסאפ'}
        subtitle={formatFridayLabel(receipt ? receipt.friday_date : fridayDate)}
        maxWidthClass="md:max-w-lg"
      >
        {receipt ? (
          <div className="space-y-4 text-center py-2">
            <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <div>
              <h4 className="font-serif text-2xl font-bold text-slate-900">
                תודה {receipt.recipient_name}!
              </h4>
              <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                ההזמנה שלך נשמרה במערכת בסטטוס <strong>״ממתין לאישור מנהל״</strong>. שלח כעת את ההודעה
                המוכנה בוואטסאפ כדי שנאשר ונתחיל לאפות עבורך!
              </p>
            </div>

            <div className="bg-[#FAF6F0] rounded-2xl p-4 border border-[#E8D5BE] tabular-nums">
              <div className="text-xs text-slate-500">סה״כ להזמנה #{receipt.id}</div>
              <div className="text-2xl font-extrabold text-[#C85A17] mt-0.5">
                {formatILS(receipt.total_amount)}
              </div>
            </div>

            <a
              href={receipt.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[54px] rounded-2xl bg-[#25D366] hover:bg-[#1EB958] text-white font-extrabold text-base flex items-center justify-center gap-2 shadow-md"
            >
              <ExternalLink className="w-5 h-5" />
              <span>פתח וואטסאפ לשליחת ההזמנה</span>
            </a>

            <button
              type="button"
              onClick={() => {
                setReceipt(null);
                setCheckoutOpen(false);
              }}
              className="w-full min-h-[46px] rounded-2xl border border-[#E8D5BE] text-slate-700 font-bold text-sm"
            >
              חזרה לתפריט
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmitOrder} className="space-y-4">
            {/* פירוט הסל */}
            <div className="bg-[#FAF6F0] rounded-2xl p-3.5 border border-[#E8D5BE] space-y-2 max-h-48 overflow-y-auto">
              {products
                .filter((p) => (cart[p.id] || 0) > 0)
                .map((p) => {
                  const q = cart[p.id];
                  const unit = getActivePrice(p);
                  return (
                    <div key={p.id} className="flex items-center justify-between text-xs tabular-nums">
                      <span className="font-bold text-slate-800">
                        {q} × {p.name}
                      </span>
                      <span className="font-extrabold text-slate-900">{formatILS(q * unit)}</span>
                    </div>
                  );
                })}
              <div className="pt-2 border-t border-[#E8D5BE] flex items-center justify-between font-extrabold text-base tabular-nums">
                <span>סה״כ ({pricing.shortBadge})</span>
                <span className="text-[#C85A17]">{formatILS(cartSummary.total)}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">שם מלא</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="לדוגמה: דנה כהן"
                className="w-full px-3.5 py-3 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">מספר טלפון (וואטסאפ)</label>
              <input
                type="tel"
                inputMode="tel"
                required
                dir="ltr"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="050-0000000"
                className="w-full px-3.5 py-3 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none text-left tabular-nums font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">הערה לשעת איסוף (אופציונלי)</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="לדוגמה: מגיע לאסוף ב-10:30"
                className="w-full px-3.5 py-3 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] focus:bg-white focus:border-[#C85A17] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[56px] rounded-2xl bg-[#25D366] hover:bg-[#1EB958] disabled:opacity-60 text-white font-extrabold text-base shadow-md flex items-center justify-center gap-2"
            >
              <Send className="w-5 h-5" />
              <span>{submitting ? 'שולח הזמנה...' : 'שלח הזמנה לאישור בוואטסאפ'}</span>
            </button>
          </form>
        )}
      </BottomSheet>
    </div>
  );
}
