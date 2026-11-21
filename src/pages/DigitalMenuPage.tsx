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
  UserCheck,
  History,
  Wallet,
  LogOut,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS, getNextFridayISO, ORDER_STATUS_LABELS } from '../lib/format';
import type { Order, OrderStatus } from '../types';
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

interface MenuCartEntry {
  key: string;
  productId: number;
  label: string;
  quantity: number;
  unitsPerQty: number;
  lineTotal: number;
  regularTotal: number;
}

const CUSTOMER_PROFILE_KEY = 'ht_public_customer_profile_v1';
const FLAVOR_OPTIONS = ['זעתר', 'שום', 'שומשום', 'רגיל'];

const LIVE_STEPS = [
  '1. ממתין לאישור',
  '2. אושרה והתקבלה',
  '3. מוכן למסירה',
  '4. נמסר',
];

function calcTrioPackPrice(packs: number): { total: number; regular: number } {
  const pairs = Math.floor(packs / 2);
  const rem = packs % 2;
  return {
    total: pairs * 20 + rem * 12,
    regular: packs * 12,
  };
}

interface SavedCustomerProfile {
  customerId?: number | null;
  name: string;
  phone: string;
}

function loadSavedProfile(): SavedCustomerProfile | null {
  try {
    const raw = localStorage.getItem(CUSTOMER_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedCustomerProfile>;
    if (!parsed.name && !parsed.phone) return null;
    return {
      customerId: parsed.customerId ?? null,
      name: String(parsed.name || ''),
      phone: String(parsed.phone || ''),
    };
  } catch {
    return null;
  }
}

function getOrderStepNum(status: OrderStatus): number {
  if (status === 'awaiting_approval' || status === 'pending') return 1;
  if (status === 'received') return 2;
  if (status === 'ready') return 3;
  return 4;
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

  // כמויות לפי מפתח שורה (מארז / יחידה)
  const [qtyMap, setQtyMap] = useState<Record<string, number>>({});
  const [pitaFlavor, setPitaFlavor] = useState<string>('זעתר');
  const [frenaFlavor, setFrenaFlavor] = useState<string>('רגיל');
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // זיהוי אוטומטי של לקוח חוזר ללא סיסמה (localStorage)
  const [savedProfile, setSavedProfile] = useState<SavedCustomerProfile | null>(() => loadSavedProfile());
  const [customerName, setCustomerName] = useState(() => loadSavedProfile()?.name || '');
  const [customerPhone, setCustomerPhone] = useState(() => loadSavedProfile()?.phone || '');
  const [customerHistory, setCustomerHistory] = useState<{
    balance: number;
    orders: Order[];
  } | null>(null);
  const [showPastOrders, setShowPastOrders] = useState(false);

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{
    orderId: number;
    waUrl: string;
    total: number;
  } | null>(null);

  const fetchCustomerHistory = async (profile: SavedCustomerProfile | null) => {
    if (!profile || (!profile.customerId && !profile.phone)) {
      setCustomerHistory(null);
      return;
    }
    try {
      const qs = new URLSearchParams();
      if (profile.customerId) qs.set('customer_id', String(profile.customerId));
      if (profile.phone) qs.set('phone', profile.phone);
      const res = await apiFetch<{
        customer: { id: number; name: string; phone: string; balance: number } | null;
        orders: Order[];
      }>(`/api/public/customer-history?${qs.toString()}`);
      if (res.customer) {
        setCustomerHistory({ balance: res.customer.balance, orders: res.orders || [] });
        if (!profile.customerId && res.customer.id) {
          const updated = { ...profile, customerId: res.customer.id };
          setSavedProfile(updated);
          try {
            localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(updated));
          } catch {}
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchCustomerHistory(savedProfile);
  }, [savedProfile?.customerId, savedProfile?.phone]);

  const handleSwitchUser = () => {
    try {
      localStorage.removeItem(CUSTOMER_PROFILE_KEY);
    } catch {
      // ignore
    }
    setSavedProfile(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerHistory(null);
  };

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

  const visibleProducts = useMemo(
    () =>
      (data?.products || []).filter(
        (p) => p.is_active && isProductVisibleToCustomers(p.id, storefrontCfg)
      ),
    [data, storefrontCfg]
  );

  // מיפוי מוצרי מפתח מהקטלוג
  const findProd = (matcher: (name: string) => boolean) =>
    visibleProducts.find((p) => matcher(p.name)) || null;

  const salufProd = useMemo(
    () => findProd((n) => n.includes('סאלוף') || n.includes('סלוף')),
    [visibleProducts]
  );
  const lahohProd = useMemo(() => findProd((n) => n.includes('לחוח')), [visibleProducts]);
  const jachnunProd = useMemo(
    () => findProd((n) => n.includes("ג'חנון") || n.includes('גחנון')),
    [visibleProducts]
  );
  const zalabiaProd = useMemo(() => findProd((n) => n.includes('זלביה')), [visibleProducts]);
  const pitaPackProd = useMemo(
    () =>
      findProd(
        (n) =>
          n.includes('מארז פיתה זעתר') ||
          n.includes('פיתה מלבנית') ||
          n.includes('מארז לחם שום') ||
          n.includes('פיתה זעתר')
      ),
    [visibleProducts]
  );
  const hilbeSmallProd = useMemo(
    () => findProd((n) => n.includes('חילבה') && (n.includes('250') || n.includes('קטנ') || n.includes('קטן'))),
    [visibleProducts]
  );
  const hilbeLargeProd = useMemo(
    () => findProd((n) => n.includes('חילבה') && (n.includes('500') || n.includes('גדול'))),
    [visibleProducts]
  );

  // מוצרים נוספים (פרנות, קובנה, סחוג, כובנית וכו') שלא הוצגו בחלקים הייעודיים
  const otherProducts = useMemo(() => {
    const usedIds = new Set(
      [
        salufProd?.id,
        lahohProd?.id,
        jachnunProd?.id,
        zalabiaProd?.id,
        pitaPackProd?.id,
        hilbeSmallProd?.id,
        hilbeLargeProd?.id,
      ].filter(Boolean)
    );
    return visibleProducts.filter((p) => {
      if (usedIds.has(p.id)) return false;
      // הסתרת כפילויות מארזי פיתות שכבר מרוכזים בשורת הפיתות עם בחירת טעם
      if (
        p.name.includes('מארז פיתה שומשום') ||
        p.name.includes('מארז לחם שום') ||
        p.name.includes('מארז פיתה זעתר')
      ) {
        return false;
      }
      return true;
    });
  }, [
    visibleProducts,
    salufProd,
    lahohProd,
    jachnunProd,
    zalabiaProd,
    pitaPackProd,
    hilbeSmallProd,
    hilbeLargeProd,
  ]);

  const stepKey = (key: string, delta: number) => {
    setQtyMap((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] || 0) + delta) }));
  };

  // חישוב סל מלא + הנחות אוטומטיות וחיסכון
  const cartEntries = useMemo<MenuCartEntry[]>(() => {
    const entries: MenuCartEntry[] = [];
    const add = (e: MenuCartEntry) => {
      if (e.quantity > 0) entries.push(e);
    };

    // 1. סאלוף מארז 5 + בודד
    if (salufProd) {
      const q5 = qtyMap['saluf_5'] || 0;
      const packPrice = preorderOpen ? 20 : 25;
      add({
        key: 'saluf_5',
        productId: salufProd.id,
        label: 'סאלוף — מארז חמישייה (5 יח׳)',
        quantity: q5,
        unitsPerQty: 5,
        lineTotal: q5 * packPrice,
        regularTotal: q5 * 25,
      });
      const q1 = qtyMap['saluf_1'] || 0;
      add({
        key: 'saluf_1',
        productId: salufProd.id,
        label: 'סאלוף (יחידה)',
        quantity: q1,
        unitsPerQty: 1,
        lineTotal: q1 * 5,
        regularTotal: q1 * 5,
      });
    }

    // 2. לחוח מארז 5 + בודד
    if (lahohProd) {
      const q5 = qtyMap['lahoh_5'] || 0;
      const packPrice = preorderOpen ? 20 : 25;
      add({
        key: 'lahoh_5',
        productId: lahohProd.id,
        label: 'לחוח — מארז חמישייה (5 יח׳)',
        quantity: q5,
        unitsPerQty: 5,
        lineTotal: q5 * packPrice,
        regularTotal: q5 * 25,
      });
      const q1 = qtyMap['lahoh_1'] || 0;
      add({
        key: 'lahoh_1',
        productId: lahohProd.id,
        label: 'לחוח (יחידה)',
        quantity: q1,
        unitsPerQty: 1,
        lineTotal: q1 * 5,
        regularTotal: q1 * 5,
      });
    }

    // 3. ג'חנון מגש 5 + יחידה (הנחת מוקדמת חלה על שניהם!)
    if (jachnunProd) {
      const q5 = qtyMap['jachnun_5'] || 0;
      const trayPrice = preorderOpen ? 40 : 45;
      add({
        key: 'jachnun_5',
        productId: jachnunProd.id,
        label: "מגש ג'חנון (5 יח׳)",
        quantity: q5,
        unitsPerQty: 5,
        lineTotal: q5 * trayPrice,
        regularTotal: q5 * 45,
      });
      const q1 = qtyMap['jachnun_1'] || 0;
      const unitPrice = preorderOpen ? 8 : 9;
      add({
        key: 'jachnun_1',
        productId: jachnunProd.id,
        label: "ג'חנון (יחידה)",
        quantity: q1,
        unitsPerQty: 1,
        lineTotal: q1 * unitPrice,
        regularTotal: q1 * 9,
      });
    }

    // 4. זלביה — רק במארז שלישייה (12 ₪ | 2 ב-20 ₪)
    if (zalabiaProd) {
      const q = qtyMap['zalabia_3'] || 0;
      const calc = calcTrioPackPrice(q);
      add({
        key: 'zalabia_3',
        productId: zalabiaProd.id,
        label: 'זלביה — מארז שלישייה (3 יח׳)',
        quantity: q,
        unitsPerQty: 1,
        lineTotal: calc.total,
        regularTotal: calc.regular,
      });
    }

    // 5. פיתות / לחם שום, זעתר, שומשום — מארז שלישייה (12 ₪ | 2 ב-20 ₪) + יחידה (5 ₪)
    if (pitaPackProd) {
      const q3 = qtyMap['pita_3'] || 0;
      const calc = calcTrioPackPrice(q3);
      add({
        key: 'pita_3',
        productId: pitaPackProd.id,
        label: `פיתות ${pitaFlavor} — מארז שלישייה (3 יח׳)`,
        quantity: q3,
        unitsPerQty: 1,
        lineTotal: calc.total,
        regularTotal: calc.regular,
      });
      const q1 = qtyMap['pita_1'] || 0;
      add({
        key: 'pita_1',
        productId: pitaPackProd.id,
        label: `פיתה ${pitaFlavor} (יחידה)`,
        quantity: q1,
        unitsPerQty: 1,
        lineTotal: q1 * 5,
        regularTotal: q1 * 5,
      });
    }

    // 6. חילבה קטן (12 ₪) וגדול (20 ₪)
    if (hilbeSmallProd) {
      const q = qtyMap['hilbe_s'] || 0;
      add({
        key: 'hilbe_s',
        productId: hilbeSmallProd.id,
        label: "חילבה קטן (250 גר')",
        quantity: q,
        unitsPerQty: 1,
        lineTotal: q * 12,
        regularTotal: q * 12,
      });
    }
    if (hilbeLargeProd) {
      const q = qtyMap['hilbe_l'] || 0;
      add({
        key: 'hilbe_l',
        productId: hilbeLargeProd.id,
        label: "חילבה גדול (500 גר')",
        quantity: q,
        unitsPerQty: 1,
        lineTotal: q * 20,
        regularTotal: q * 20,
      });
    }

    // 7. שאר המוצרים (פרנות, קובנה וכו' — מחיר רגיל מהמחירון, ללא הנחת מוקדמת)
    for (const p of otherProducts) {
      const k = `other_${p.id}`;
      const q = qtyMap[k] || 0;
      const label = p.name.includes('פרנה גדולה') ? `${p.name} (${frenaFlavor})` : p.name;
      add({
        key: k,
        productId: p.id,
        label,
        quantity: q,
        unitsPerQty: 1,
        lineTotal: Math.round(q * p.customer_price * 100) / 100,
        regularTotal: Math.round(q * p.customer_price * 100) / 100,
      });
    }

    return entries;
  }, [
    qtyMap,
    preorderOpen,
    salufProd,
    lahohProd,
    jachnunProd,
    zalabiaProd,
    pitaPackProd,
    hilbeSmallProd,
    hilbeLargeProd,
    otherProducts,
    pitaFlavor,
    frenaFlavor,
  ]);

  const totalCount = useMemo(() => cartEntries.reduce((s, e) => s + e.quantity, 0), [cartEntries]);
  const totalAmount = useMemo(
    () => Math.round(cartEntries.reduce((s, e) => s + e.lineTotal, 0) * 100) / 100,
    [cartEntries]
  );
  const totalSavings = useMemo(() => {
    const reg = cartEntries.reduce((s, e) => s + e.regularTotal, 0);
    return Math.max(0, Math.round((reg - totalAmount) * 100) / 100);
  }, [cartEntries, totalAmount]);

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartEntries.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const mergedItems = new Map<number, number>();
      for (const entry of cartEntries) {
        mergedItems.set(
          entry.productId,
          (mergedItems.get(entry.productId) || 0) + entry.quantity * entry.unitsPerQty
        );
      }
      const breakdownNote = cartEntries.map((e) => `${e.quantity}× ${e.label}`).join(' | ');
      const combinedNotes = [notes.trim(), breakdownNote].filter(Boolean).join(' · ');

      const res = await apiFetch<{ id?: number; customer_id?: number; user_id?: number; order?: { id: number } }>(
        '/api/public/orders',
        {
          method: 'POST',
          body: JSON.stringify({
            friday_date: fridayDate,
            customer_id: savedProfile?.customerId || undefined,
            recipient_name: customerName.trim(),
            phone: customerPhone.trim(),
            notes: combinedNotes,
            items: Array.from(mergedItems.entries()).map(([product_id, quantity]) => ({
              product_id,
              quantity,
            })),
          }),
        }
      );
      const orderId = res.order?.id ?? res.id ?? Date.now();
      const resolvedCustomerId = res.customer_id ?? res.user_id ?? savedProfile?.customerId ?? null;
      const nextProfile: SavedCustomerProfile = {
        customerId: resolvedCustomerId,
        name: customerName.trim(),
        phone: customerPhone.trim(),
      };
      setSavedProfile(nextProfile);
      try {
        localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(nextProfile));
      } catch {
        // ignore
      }
      fetchCustomerHistory(nextProfile);
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
        items: cartEntries.map((e) => ({
          product_name: e.label,
          quantity: e.quantity,
          unit_price: Math.round((e.lineTotal / e.quantity) * 100) / 100,
        })),
        total_amount: totalAmount,
        notes: notes.trim(),
      });
      const waUrl = buildWhatsAppShareUrl(waText, targetPhone);
      setSubmitted({ orderId, waUrl, total: totalAmount });
      setQtyMap({});
      setNotes('');
      setCheckoutOpen(false);
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בשליחת ההזמנה');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepper = (key: string, disabled = false) => {
    const q = qtyMap[key] || 0;
    if (disabled) {
      return <span className="text-[11px] font-extrabold text-red-600">אזל</span>;
    }
    return (
      <div className="flex items-center gap-1.5 shrink-0">
        {q > 0 && (
          <>
            <button
              type="button"
              onClick={() => stepKey(key, -1)}
              className="w-9 h-9 rounded-xl bg-white border border-[#E8D5BE] flex items-center justify-center active:scale-95"
              aria-label="הפחת"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-6 text-center font-extrabold text-sm tabular-nums">{q}</span>
          </>
        )}
        <button
          type="button"
          onClick={() => stepKey(key, 1)}
          className="w-9 h-9 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white flex items-center justify-center shadow-sm active:scale-95"
          aria-label="הוסף"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF5EE] text-[#1E242B] pb-28">
      {/* כותרת לוח מאפייה קומפקטית וברורה */}
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-gradient-to-b from-[#2B1B12] to-[#4A2816] text-white shadow-md">
        <div className="max-w-lg mx-auto space-y-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#E59838] to-[#C85A17] flex items-center justify-center shadow">
              <Flame className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-serif text-2xl font-extrabold text-amber-50">
              המטבח התימני – תפריט שישי
            </h1>
          </div>

          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-xs font-bold text-amber-100">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>
              {preorderOpen
                ? `המחירים הם בהזמנה מוקדמת · ${formatFridayLabel(fridayDate)}`
                : `מחירון יום שישי · ${formatFridayLabel(fridayDate)}`}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3.5 pt-3.5 space-y-4">
        {/* כרטיס לקוח חוזר אוטומטי (ללא סיסמה) — סטטוס פעיל, יתרה והיסטוריה */}
        {savedProfile && (
          <section className="bg-white rounded-3xl border border-[#DFC3A0] shadow-soft p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-sm text-slate-900 truncate">
                    היי {savedProfile.name}, שמחים לראותך שוב!
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums" dir="ltr">
                    {savedProfile.phone}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSwitchUser}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] text-[11px] font-bold text-slate-600 hover:text-red-600 shrink-0"
              >
                <LogOut className="w-3 h-3" />
                <span>החלף משתמש</span>
              </button>
            </div>

            {customerHistory && (
              <div className="space-y-2.5 pt-2 border-t border-[#F3E9DC]">
                {/* יתרת חשבון */}
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1 font-bold text-slate-600">
                    <Wallet className="w-3.5 h-3.5 text-[#C85A17]" />
                    <span>מצב חשבון:</span>
                  </span>
                  <span
                    className={`font-extrabold tabular-nums ${
                      customerHistory.balance < 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {customerHistory.balance < 0
                      ? `חוב פתוח: ${formatILS(Math.abs(customerHistory.balance))}`
                      : customerHistory.balance > 0
                      ? `יתרת זכות: ${formatILS(customerHistory.balance)}`
                      : 'מאוזן (₪0.00)'}
                  </span>
                </div>

                {/* סטטוס הזמנה אחרונה / פעילה */}
                {customerHistory.orders[0] && (() => {
                  const latest = customerHistory.orders[0];
                  const stepNum = getOrderStepNum(latest.status);
                  const barCls =
                    stepNum === 4
                      ? 'bg-emerald-600'
                      : stepNum === 3
                      ? 'bg-orange-500'
                      : stepNum === 2
                      ? 'bg-blue-600'
                      : 'bg-red-600';
                  return (
                    <div className="p-2.5 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE]/80 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">
                          הזמנה #{latest.id} ({formatFridayLabel(latest.friday_date)})
                        </span>
                        <span className="font-extrabold text-[#8A330B] tabular-nums">
                          {formatILS(latest.total_amount)}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex gap-0.5">
                        {[1, 2, 3, 4].map((s) => (
                          <div
                            key={s}
                            className={`flex-1 h-full ${s <= stepNum ? barCls : 'bg-slate-200'}`}
                          />
                        ))}
                      </div>
                      <div className="text-[11px] font-bold text-slate-600">
                        סטטוס נוכחי: <strong className="text-slate-900">{ORDER_STATUS_LABELS[latest.status]}</strong>
                      </div>
                    </div>
                  );
                })()}

                {/* היסטוריית הזמנות קודמות */}
                {customerHistory.orders.length > 1 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowPastOrders((v) => !v)}
                      className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#C85A17] hover:underline"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>
                        {showPastOrders
                          ? 'הסתר היסטוריית הזמנות'
                          : `צפה בהיסטוריית הזמנות קודמות (${customerHistory.orders.length - 1})`}
                      </span>
                    </button>
                    {showPastOrders && (
                      <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                        {customerHistory.orders.slice(1).map((o) => (
                          <div
                            key={o.id}
                            className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE]/60 tabular-nums"
                          >
                            <span>
                              #{o.id} · {formatFridayLabel(o.friday_date)}
                            </span>
                            <span className="font-bold text-slate-800">{formatILS(o.total_amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

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

        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-400 border border-[#E8D5BE]">
            טוען את לוח המאפייה...
          </div>
        ) : (
          <>
            {/* חלק עליון: סאלוף ולחוח — מארז חמישייה (20 ₪ במקום 25 ₪) + יחידות (5 ₪) */}
            {(salufProd || lahohProd) && (
              <section className="bg-white rounded-3xl border border-[#DFC3A0] shadow-soft overflow-hidden">
                <div className="px-4 py-2.5 bg-[#4A2816] text-amber-100 font-serif font-bold text-base">
                  🫓 מאפים במארזים ויחידות (סאלוף / לחוח)
                </div>
                <div className="divide-y divide-[#F3E9DC]">
                  {salufProd && (() => {
                    const inStock = isProductInStock(salufProd.id, stockMap);
                    return (
                      <div className="p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-extrabold text-sm text-slate-900">
                              סאלוף — מארז חמישייה (5 יח&apos;)
                            </div>
                            <div className="flex items-center gap-2 tabular-nums">
                              <span className="font-extrabold text-base text-[#C85A17]">
                                {preorderOpen ? '₪20.00' : '₪25.00'}
                              </span>
                              {preorderOpen && (
                                <span className="text-xs font-bold text-slate-400 line-through decoration-red-600 decoration-2">
                                  ₪25.00
                                </span>
                              )}
                            </div>
                          </div>
                          {renderStepper('saluf_5', !inStock)}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-[#F3E9DC]">
                          <div>
                            <div className="font-bold text-xs text-slate-700">סאלוף — יחידה בודדת</div>
                            <div className="font-extrabold text-sm text-slate-800 tabular-nums">₪5.00</div>
                          </div>
                          {renderStepper('saluf_1', !inStock)}
                        </div>
                      </div>
                    );
                  })()}

                  {lahohProd && (() => {
                    const inStock = isProductInStock(lahohProd.id, stockMap);
                    return (
                      <div className="p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <div className="font-extrabold text-sm text-slate-900">
                              לחוח — מארז חמישייה (5 יח&apos;)
                            </div>
                            <div className="flex items-center gap-2 tabular-nums">
                              <span className="font-extrabold text-base text-[#C85A17]">
                                {preorderOpen ? '₪20.00' : '₪25.00'}
                              </span>
                              {preorderOpen && (
                                <span className="text-xs font-bold text-slate-400 line-through decoration-red-600 decoration-2">
                                  ₪25.00
                                </span>
                              )}
                            </div>
                          </div>
                          {renderStepper('lahoh_5', !inStock)}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-[#F3E9DC]">
                          <div>
                            <div className="font-bold text-xs text-slate-700">לחוח — יחידה בודדת</div>
                            <div className="font-extrabold text-sm text-slate-800 tabular-nums">₪5.00</div>
                          </div>
                          {renderStepper('lahoh_1', !inStock)}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </section>
            )}

            {/* חלק מרכזי: ג'חנון ביתי ב-2 שורות נפרדות וברורות */}
            {jachnunProd && (() => {
              const inStock = isProductInStock(jachnunProd.id, stockMap);
              return (
                <section className="bg-white rounded-3xl border border-[#DFC3A0] shadow-soft overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#4A2816] text-amber-100 font-serif font-bold text-base">
                    🍯 ג&apos;חנון ביתי
                  </div>
                  <div className="divide-y divide-[#F3E9DC]">
                    <div className="p-3.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-sm text-slate-900">מגש ג&apos;חנון (5 יח&apos;)</div>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="font-extrabold text-base text-[#C85A17]">
                            {preorderOpen ? '₪40.00' : '₪45.00'}
                          </span>
                          {preorderOpen && (
                            <span className="text-xs font-bold text-slate-400 line-through decoration-red-600 decoration-2">
                              ₪45.00
                            </span>
                          )}
                        </div>
                      </div>
                      {renderStepper('jachnun_5', !inStock)}
                    </div>

                    <div className="p-3.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-extrabold text-sm text-slate-900">ג&apos;חנון (יחידה)</div>
                        <div className="flex items-center gap-2 tabular-nums">
                          <span className="font-extrabold text-base text-[#C85A17]">
                            {preorderOpen ? '₪8.00' : '₪9.00'}
                          </span>
                          {preorderOpen && (
                            <span className="text-xs font-bold text-slate-400 line-through decoration-red-600 decoration-2">
                              ₪9.00
                            </span>
                          )}
                        </div>
                      </div>
                      {renderStepper('jachnun_1', !inStock)}
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* חלק תחתון: טבלת פריטים מיוחדים ומארזים */}
            <section className="bg-white rounded-3xl border border-[#DFC3A0] shadow-soft overflow-hidden">
              <div className="px-4 py-2.5 bg-[#4A2816] text-amber-100 font-serif font-bold text-base">
                ✨ פריטים מיוחדים ומארזים
              </div>
              <div className="divide-y divide-[#F3E9DC]">
                {/* זלביה — רק במארז שלישייה */}
                {zalabiaProd && (
                  <div className="p-3.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-sm text-slate-900">
                        זלביה — מארז שלישייה (3 יח&apos;)
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap tabular-nums">
                        <span className="font-extrabold text-base text-[#C85A17]">₪12.00</span>
                        <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                          מבצע: 2 מארזים ב-20 ₪
                        </span>
                      </div>
                    </div>
                    {renderStepper('zalabia_3', !isProductInStock(zalabiaProd.id, stockMap))}
                  </div>
                )}

                {/* פיתות / לחם שום, זעתר, שומשום (בחירת טעם + מארז שלישייה + יחידה) */}
                {pitaPackProd && (() => {
                  const inStock = isProductInStock(pitaPackProd.id, stockMap);
                  return (
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900">
                          פיתות / לחם (בחר טעם):
                        </span>
                        <div className="flex items-center gap-1">
                          {FLAVOR_OPTIONS.map((fl) => (
                            <button
                              key={fl}
                              type="button"
                              onClick={() => setPitaFlavor(fl)}
                              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                                pitaFlavor === fl
                                  ? 'bg-[#1E242B] text-white border-[#1E242B]'
                                  : 'bg-[#FAF6F0] text-slate-600 border-[#E8D5BE]'
                              }`}
                            >
                              {fl}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-bold text-xs text-slate-800">
                            מארז שלישייה ({pitaFlavor}, 3 יח&apos;)
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap tabular-nums">
                            <span className="font-extrabold text-base text-[#C85A17]">₪12.00</span>
                            <span className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                              מבצע: 2 מארזים ב-20 ₪
                            </span>
                          </div>
                        </div>
                        {renderStepper('pita_3', !inStock)}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-dashed border-[#F3E9DC]">
                        <div>
                          <div className="font-bold text-xs text-slate-700">
                            יחידה בודדת ({pitaFlavor})
                          </div>
                          <div className="font-extrabold text-sm text-slate-800 tabular-nums">₪5.00</div>
                        </div>
                        {renderStepper('pita_1', !inStock)}
                      </div>
                    </div>
                  );
                })()}

                {/* חילבה קטן 250 גר' */}
                {hilbeSmallProd && (
                  <div className="p-3.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-sm text-slate-900">חילבה קטן (250 גר&apos;)</div>
                      <div className="font-extrabold text-base text-[#C85A17] tabular-nums">₪12.00</div>
                    </div>
                    {renderStepper('hilbe_s', !isProductInStock(hilbeSmallProd.id, stockMap))}
                  </div>
                )}

                {/* חילבה גדול 500 גר' */}
                {hilbeLargeProd && (
                  <div className="p-3.5 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-extrabold text-sm text-slate-900">חילבה גדול (500 גר&apos;)</div>
                      <div className="font-extrabold text-base text-[#C85A17] tabular-nums">₪20.00</div>
                    </div>
                    {renderStepper('hilbe_l', !isProductInStock(hilbeLargeProd.id, stockMap))}
                  </div>
                )}

                {/* שאר המוצרים (פרנות, קובנה, סחוג וכו') */}
                {otherProducts.map((p) => {
                  const inStock = isProductInStock(p.id, stockMap);
                  const isBigFrena = p.name.includes('פרנה גדולה');
                  return (
                    <div key={p.id} className="p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-slate-900">{p.name}</span>
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {inStock ? 'במלאי' : 'אזל'}
                            </span>
                          </div>
                          <div className="font-extrabold text-base text-[#C85A17] tabular-nums">
                            {formatILS(p.customer_price)}
                          </div>
                        </div>
                        {renderStepper(`other_${p.id}`, !inStock)}
                      </div>

                      {isBigFrena && inStock && (
                        <div className="flex items-center gap-1 pt-1">
                          {FLAVOR_OPTIONS.map((fl) => (
                            <button
                              key={fl}
                              type="button"
                              onClick={() => setFrenaFlavor(fl)}
                              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border ${
                                frenaFlavor === fl
                                  ? 'bg-[#1E242B] text-white border-[#1E242B]'
                                  : 'bg-[#FAF6F0] text-slate-600 border-[#E8D5BE]'
                              }`}
                            >
                              {fl}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {/* סרגל סיכום צף בתחתית המסך */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8D5BE] shadow-[0_-6px_24px_rgba(30,36,43,0.12)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-3">
          <div className="tabular-nums">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">
                {totalCount > 0 ? `${totalCount} פריטים בסל` : 'בחר מהמחירון'}
              </span>
              {totalSavings > 0 && (
                <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  חסכת {formatILS(totalSavings)}!
                </span>
              )}
            </div>
            <div className="text-xl font-extrabold text-[#C85A17]">{formatILS(totalAmount)}</div>
          </div>
          <button
            type="button"
            disabled={totalCount === 0}
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
            {cartEntries.map((e) => (
              <div key={e.key} className="p-2.5 flex items-center justify-between text-xs bg-[#FAF6F0]">
                <span className="font-bold text-slate-800">
                  {e.quantity}× {e.label}
                </span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  {e.regularTotal > e.lineTotal && (
                    <span className="text-[11px] text-slate-400 line-through decoration-red-600 decoration-2">
                      {formatILS(e.regularTotal)}
                    </span>
                  )}
                  <span className="font-extrabold text-[#8A330B]">{formatILS(e.lineTotal)}</span>
                </div>
              </div>
            ))}
          </div>

          {totalSavings > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-extrabold flex items-center justify-between tabular-nums">
              <span>🎉 חסכת בהזמנה זו:</span>
              <span className="text-sm">{formatILS(totalSavings)}</span>
            </div>
          )}

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
