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
  Tag,
  ChevronLeft,
  Trash2,
  ShoppingCart,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatFridayLabel, formatILS, getNextFridayISO, ORDER_STATUS_LABELS } from '../lib/format';
import { isProductInStock, loadStockMap } from '../lib/stockState';
import {
  DEFAULT_ADMIN_WHATSAPP,
  isCustomerPreorderActive,
  isProductVisibleToCustomers,
  loadStorefrontConfig,
} from '../lib/storefrontConfig';
import { buildWhatsAppShareUrl, formatPublicApprovalWhatsApp } from '../lib/whatsappFormat';
import { BottomSheet } from '../components/BottomSheet';
import {
  QuickCustomerPayBox,
  type CustomerPaymentChoice,
  type PrepayMethod,
} from '../components/QuickCustomerPayBox';
import type { Order, OrderStatus } from '../types';

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

interface SavedCustomerProfile {
  customerId?: number | null;
  name: string;
  phone: string;
}

interface CatalogOption {
  id: string;
  label: string;
  sublabel?: string;
  price: number;
  regularPrice: number;
  unitsPerQty: number;
  productId: number;
  mixGroup?: 'ciabatta_trio' | 'zalabia_trio';
}

type MenuCategory = 'all' | 'pastries' | 'jachnun' | 'ciabatta' | 'sweets';

const MENU_CATEGORIES: Array<{ key: MenuCategory; label: string }> = [
  { key: 'all', label: 'הכל' },
  { key: 'pastries', label: 'מאפים' },
  { key: 'jachnun', label: "ג'חנון" },
  { key: 'ciabatta', label: "ג'בטות" },
  { key: 'sweets', label: 'מתוקים ותוספות' },
];

interface CatalogCardItem {
  id: string;
  category: Exclude<MenuCategory, 'all'>;
  emoji: string;
  title: string;
  description: string;
  priceSummary: string;
  inStock: boolean;
  hasFlavors?: boolean;
  options: CatalogOption[];
}

interface CartRow {
  rowKey: string;
  cardId: string;
  productId: number;
  label: string;
  quantity: number;
  unitsPerQty: number;
  unitPrice: number;
  regularUnitPrice: number;
  mixGroup?: 'ciabatta_trio' | 'zalabia_trio';
}

const CUSTOMER_PROFILE_KEY = 'ht_public_customer_profile_v1';
const FLAVORS = ['שום', 'זעתר', 'שומשום', 'רגיל'] as const;
const LIVE_STEPS = ['1. ממתין לאישור מוכר', '2. אושרה והתקבלה', '3. מוכן למסירה', '4. נמסר'];

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

  // סל הקניות (מערך שורות מותאמות אישית)
  const [cartRows, setCartRows] = useState<CartRow[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>('all');
  const [mergeMode, setMergeMode] = useState<'merge' | 'new'>('merge');

  // חלונית התאמה אישית למוצר (ProductOptionsModal)
  const [activeCard, setActiveCard] = useState<CatalogCardItem | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState('');
  const [selectedFlavor, setSelectedFlavor] = useState<string>('שום');
  const [modalQty, setModalQty] = useState(1);
  const [modalItemNote, setModalItemNote] = useState('');

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
  const [paymentChoice, setPaymentChoice] = useState<CustomerPaymentChoice>('prepay');
  const [prepayMethod, setPrepayMethod] = useState<PrepayMethod>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{
    orderId: number;
    waUrl: string;
    total: number;
    addedAmount?: number;
    merged?: boolean;
    paymentChoice: CustomerPaymentChoice;
    prepayMethod: PrepayMethod;
  } | null>(null);

  const canSubmitPayment = paymentChoice === 'cash_pickup' || prepayMethod !== null;

  // איתור הזמנה פעילה קיימת של הלקוח לאותו יום שישי (שאינה מבוטלת ואינה נמסרה)
  const activeFridayOrder = useMemo(() => {
    if (!customerHistory?.orders) return null;
    return (
      customerHistory.orders.find(
        (o) =>
          o.friday_date === fridayDate &&
          o.status !== 'cancelled' &&
          o.status !== 'delivered'
      ) || null
    );
  }, [customerHistory, fridayDate]);

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
    } catch {}
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

  // בניית רשימת כרטיסיות מוצר מאוחדות ונקיות (כרטיסייה אחת לכל מוצר)
  const catalogCards = useMemo<CatalogCardItem[]>(() => {
    const cards: CatalogCardItem[] = [];
    const find = (fn: (n: string) => boolean) => visibleProducts.find((p) => fn(p.name)) || null;

    const saluf = find((n) => n.includes('סאלוף') || n.includes('סלוף'));
    const lahoh = find((n) => n.includes('לחוח'));
    const jachnun = find((n) => n.includes("ג'חנון") || n.includes('גחנון'));
    const ciabatta = find(
      (n) =>
        n.includes('מארז פיתה זעתר') ||
        n.includes('פיתה מלבנית') ||
        n.includes('מארז לחם שום') ||
        n.includes('פיתה זעתר') ||
        n.includes("ג'בטה")
    );
    const zalabia = find((n) => n.includes('זלביה'));
    const hilbeS = find((n) => n.includes('חילבה') && (n.includes('250') || n.includes('קטנ') || n.includes('קטן')));
    const hilbeL = find((n) => n.includes('חילבה') && (n.includes('500') || n.includes('גדול')));

    if (saluf) {
      const packPrice = preorderOpen ? 20 : 25;
      cards.push({
        id: 'saluf',
        category: 'pastries',
        emoji: '🫓',
        title: 'סאלוף',
        description: 'פיתה תימנית רכה ואוורירית מהטאבון',
        priceSummary: preorderOpen
          ? 'מארז 5 ב-20 ₪ (במקום 25 ₪) | יחידה 5 ₪'
          : 'מארז 5 ב-25 ₪ | יחידה 5 ₪',
        inStock: isProductInStock(saluf.id, stockMap),
        options: [
          {
            id: 'pack5',
            label: 'מארז חמישייה (5 יח׳)',
            sublabel: preorderOpen ? 'מחיר הזמנה מוקדמת' : undefined,
            price: packPrice,
            regularPrice: 25,
            unitsPerQty: 5,
            productId: saluf.id,
          },
          {
            id: 'single',
            label: 'יחידה בודדת',
            price: 5,
            regularPrice: 5,
            unitsPerQty: 1,
            productId: saluf.id,
          },
        ],
      });
    }

    if (lahoh) {
      const packPrice = preorderOpen ? 20 : 25;
      cards.push({
        id: 'lahoh',
        category: 'pastries',
        emoji: '🫓',
        title: 'לחוח',
        description: 'לחוח תימני מסורתי ורך במיוחד',
        priceSummary: preorderOpen
          ? 'מארז 5 ב-20 ₪ (במקום 25 ₪) | יחידה 5 ₪'
          : 'מארז 5 ב-25 ₪ | יחידה 5 ₪',
        inStock: isProductInStock(lahoh.id, stockMap),
        options: [
          {
            id: 'pack5',
            label: 'מארז חמישייה (5 יח׳)',
            sublabel: preorderOpen ? 'מחיר הזמנה מוקדמת' : undefined,
            price: packPrice,
            regularPrice: 25,
            unitsPerQty: 5,
            productId: lahoh.id,
          },
          {
            id: 'single',
            label: 'יחידה בודדת',
            price: 5,
            regularPrice: 5,
            unitsPerQty: 1,
            productId: lahoh.id,
          },
        ],
      });
    }

    if (jachnun) {
      cards.push({
        id: 'jachnun',
        category: 'jachnun',
        emoji: '🍯',
        title: "ג'חנון ביתי",
        description: 'ג׳חנון אפוי לילה שלם, חם וריחני לשבת',
        priceSummary: preorderOpen
          ? 'מגש 5 ב-40 ₪ | יחידה 8 ₪ (במקום 9 ₪)'
          : 'מגש 5 ב-45 ₪ | יחידה 9 ₪',
        inStock: isProductInStock(jachnun.id, stockMap),
        options: [
          {
            id: 'tray5',
            label: 'מגש חמישייה (5 יח׳)',
            sublabel: preorderOpen ? 'מחיר הזמנה מוקדמת' : undefined,
            price: preorderOpen ? 40 : 45,
            regularPrice: 45,
            unitsPerQty: 5,
            productId: jachnun.id,
          },
          {
            id: 'single',
            label: 'יחידה בודדת',
            sublabel: preorderOpen ? 'מחיר הזמנה מוקדמת' : undefined,
            price: preorderOpen ? 8 : 9,
            regularPrice: 9,
            unitsPerQty: 1,
            productId: jachnun.id,
          },
        ],
      });
    }

    if (ciabatta) {
      cards.push({
        id: 'ciabatta',
        category: 'ciabatta',
        emoji: '🥖',
        title: "ג'בטה מאורכת בטעמים",
        description: 'טרייה ופריכה — ניתן לשלב בין טעמי שום, זעתר, שומשום ורגיל!',
        priceSummary: 'שלישייה 12 ₪ | מבצע: 2 שלישיות ב-20 ₪ | יחידה 5 ₪',
        inStock: isProductInStock(ciabatta.id, stockMap),
        hasFlavors: true,
        options: [
          {
            id: 'trio',
            label: 'מארז שלישייה (3 יח׳)',
            sublabel: 'מבצע: 2 מארזים (6 יח׳) ב-20 ₪ — ניתן לשלב טעמים!',
            price: 12,
            regularPrice: 12,
            unitsPerQty: 1,
            productId: ciabatta.id,
            mixGroup: 'ciabatta_trio',
          },
          {
            id: 'single',
            label: 'יחידה בודדת',
            price: 5,
            regularPrice: 5,
            unitsPerQty: 1,
            productId: ciabatta.id,
          },
        ],
      });
    }

    if (zalabia) {
      cards.push({
        id: 'zalabia',
        category: 'sweets',
        emoji: '🍩',
        title: 'זלביה',
        description: 'מאפה מטוגן פריך וזהוב — נמכר במארז שלישייה',
        priceSummary: 'מארז שלישייה 12 ₪ | מבצע: 2 מארזים ב-20 ₪',
        inStock: isProductInStock(zalabia.id, stockMap),
        options: [
          {
            id: 'trio',
            label: 'מארז שלישייה (3 יח׳)',
            sublabel: 'מבצע: 2 מארזים ב-20 ₪',
            price: 12,
            regularPrice: 12,
            unitsPerQty: 1,
            productId: zalabia.id,
            mixGroup: 'zalabia_trio',
          },
        ],
      });
    }

    if (hilbeS || hilbeL) {
      const opts: CatalogOption[] = [];
      if (hilbeS) {
        opts.push({
          id: 'small',
          label: "קטן (250 גר')",
          price: 12,
          regularPrice: 12,
          unitsPerQty: 1,
          productId: hilbeS.id,
        });
      }
      if (hilbeL) {
        opts.push({
          id: 'large',
          label: "גדול (500 גר')",
          price: 20,
          regularPrice: 20,
          unitsPerQty: 1,
          productId: hilbeL.id,
        });
      }
      cards.push({
        id: 'hilbe',
        category: 'sweets',
        emoji: '🥣',
        title: 'חילבה טרייה',
        description: 'חילבה תימנית מוקצפת וטרייה',
        priceSummary: "קטן (250 גר') 12 ₪ | גדול (500 גר') 20 ₪",
        inStock:
          (hilbeS ? isProductInStock(hilbeS.id, stockMap) : true) ||
          (hilbeL ? isProductInStock(hilbeL.id, stockMap) : true),
        options: opts,
      });
    }

    // כל השאר (פרנות, קובנה, סחוג, כובנית וכו')
    const usedIds = new Set(
      [saluf?.id, lahoh?.id, jachnun?.id, ciabatta?.id, zalabia?.id, hilbeS?.id, hilbeL?.id].filter(Boolean)
    );
    for (const p of visibleProducts) {
      if (usedIds.has(p.id)) continue;
      const n = p.name;
      if (
        n.includes('זלביה') ||
        n.includes('מארז פיתה') ||
        n.includes('מארז לחם שום') ||
        n.includes('פיתה זעתר') ||
        n.includes('פיתה מלבנית') ||
        n.includes('חילבה')
      ) {
        continue;
      }
      const isFrena = n.includes('פרנה');
      const isSweetOrSide =
        n.includes('סחוג') ||
        n.includes('רוטב') ||
        n.includes('סלסה') ||
        n.includes('מתוק') ||
        n.includes('עוג') ||
        n.includes('כבד') ||
        n.includes('חילבה');
      cards.push({
        id: `other_${p.id}`,
        category: isSweetOrSide ? 'sweets' : 'pastries',
        emoji: '🥖',
        title: p.name,
        description: isFrena ? 'מאפה מרוקאי/תימני טרי וחם מהתנור' : 'טרי וחם מהמאפייה לשבת',
        priceSummary: formatILS(p.customer_price),
        inStock: isProductInStock(p.id, stockMap),
        hasFlavors: n.includes('פרנה גדולה'),
        options: [
          {
            id: 'std',
            label: p.name,
            price: p.customer_price,
            regularPrice: p.customer_price,
            unitsPerQty: 1,
            productId: p.id,
          },
        ],
      });
    }

    return cards;
  }, [visibleProducts, preorderOpen, stockMap]);

  const openProductModal = (card: CatalogCardItem) => {
    if (!card.inStock) return;
    setActiveCard(card);
    setSelectedOptionId(card.options[0]?.id || '');
    setSelectedFlavor(card.id === 'ciabatta' ? 'שום' : 'רגיל');
    setModalQty(1);
    setModalItemNote('');
  };

  const activeOption = useMemo(() => {
    if (!activeCard) return null;
    return activeCard.options.find((o) => o.id === selectedOptionId) || activeCard.options[0] || null;
  }, [activeCard, selectedOptionId]);

  const modalPreviewPrice = useMemo(() => {
    if (!activeOption) return 0;
    if (activeOption.mixGroup === 'ciabatta_trio' || activeOption.mixGroup === 'zalabia_trio') {
      const pairs = Math.floor(modalQty / 2);
      const rem = modalQty % 2;
      return pairs * 20 + rem * 12;
    }
    return Math.round(activeOption.price * modalQty * 100) / 100;
  }, [activeOption, modalQty]);

  const handleAddFromModal = () => {
    if (!activeCard || !activeOption) return;
    const flavorPart = activeCard.hasFlavors ? ` (${selectedFlavor})` : '';
    const cleanItemNote = modalItemNote.trim();
    const notePart = cleanItemNote ? ` [${cleanItemNote}]` : '';
    const rowKey = `${activeCard.id}__${activeOption.id}__${activeCard.hasFlavors ? selectedFlavor : ''}__${cleanItemNote}`;
    const label =
      activeCard.options.length === 1 && !activeCard.hasFlavors
        ? `${activeCard.title} — ${activeOption.label}${notePart}`
        : `${activeCard.title}${flavorPart} — ${activeOption.label}${notePart}`;

    setCartRows((prev) => {
      const existing = prev.find((r) => r.rowKey === rowKey);
      if (existing) {
        return prev.map((r) => (r.rowKey === rowKey ? { ...r, quantity: r.quantity + modalQty } : r));
      }
      return [
        ...prev,
        {
          rowKey,
          cardId: activeCard.id,
          productId: activeOption.productId,
          label,
          quantity: modalQty,
          unitsPerQty: activeOption.unitsPerQty,
          unitPrice: activeOption.price,
          regularUnitPrice: activeOption.regularPrice,
          mixGroup: activeOption.mixGroup,
        },
      ];
    });
    setActiveCard(null);
  };

  // חישוב חכם של סל הקניות כולל מבצע Mix & Match אוטומטי (2 מארזי שלישייה ב-20 ₪!)
  const cartSummary = useMemo(() => {
    const ciabattaTrios = cartRows
      .filter((r) => r.mixGroup === 'ciabatta_trio')
      .reduce((s, r) => s + r.quantity, 0);
    const zalabiaTrios = cartRows
      .filter((r) => r.mixGroup === 'zalabia_trio')
      .reduce((s, r) => s + r.quantity, 0);

    const ciabattaMixDiscount = Math.floor(ciabattaTrios / 2) * 4;
    const zalabiaMixDiscount = Math.floor(zalabiaTrios / 2) * 4;
    const totalMixDiscount = ciabattaMixDiscount + zalabiaMixDiscount;

    const rawSubtotal = cartRows.reduce((s, r) => s + r.quantity * r.unitPrice, 0);
    const regularSubtotal = cartRows.reduce((s, r) => s + r.quantity * r.regularUnitPrice, 0);

    const finalTotal = Math.max(0, Math.round((rawSubtotal - totalMixDiscount) * 100) / 100);
    const totalSavings = Math.max(0, Math.round((regularSubtotal - finalTotal) * 100) / 100);
    const totalCount = cartRows.reduce((s, r) => s + r.quantity, 0);

    let upsell = '';
    if (ciabattaTrios > 0 && ciabattaTrios % 2 === 1) {
      upsell = 'הוסף עוד מארז אחד של ג׳בטה (בכל טעם) וקבל את שניהם ב-20 ₪ בלבד!';
    } else if (zalabiaTrios > 0 && zalabiaTrios % 2 === 1) {
      upsell = 'הוסף עוד מארז אחד של זלביה וקבל את שניהם ב-20 ₪ בלבד!';
    }

    return {
      totalCount,
      finalTotal,
      totalSavings,
      totalMixDiscount,
      ciabattaTrios,
      zalabiaTrios,
      upsell,
    };
  }, [cartRows]);

  // חישוב איחוד חכם עם הזמנה קיימת לאותו יום שישי (כולל השלמת מבצע זוג מארזים ב-20 ₪ בין ההזמנה הקיימת לתוספת!)
  const mergeCalculation = useMemo(() => {
    const isMerging = Boolean(activeFridayOrder && mergeMode === 'merge');
    if (!isMerging || !activeFridayOrder) {
      return {
        isMerging: false,
        existingTotal: 0,
        crossOrderMixBonus: 0,
        addedAmountToPay: cartSummary.finalTotal,
        mergedOrderTotal: cartSummary.finalTotal,
      };
    }

    const countExistingTrios = (keyword: string) => {
      const notesStr = String(activeFridayOrder.notes || '');
      const regex = new RegExp(`(\\d+)×[^|·]*${keyword}[^|·]*מארז שלישייה`, 'g');
      let countFromNotes = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(notesStr)) !== null) {
        countFromNotes += Number(match[1]) || 0;
      }
      if (countFromNotes > 0) return countFromNotes;
      return (activeFridayOrder.items || [])
        .filter((it) => it.product_name.includes(keyword) && Math.abs(it.unit_price_snapshot - 12) < 0.5)
        .reduce((s, it) => s + it.quantity, 0);
    };

    const existingCiabatta = countExistingTrios("ג'בטה") + countExistingTrios('ג׳בטה');
    const existingZalabia = countExistingTrios('זלביה');

    const extraCiabattaBonus =
      existingCiabatta % 2 === 1 && cartSummary.ciabattaTrios % 2 === 1 ? 4 : 0;
    const extraZalabiaBonus =
      existingZalabia % 2 === 1 && cartSummary.zalabiaTrios % 2 === 1 ? 4 : 0;
    const crossOrderMixBonus = extraCiabattaBonus + extraZalabiaBonus;

    const addedAmountToPay = Math.max(
      0,
      Math.round((cartSummary.finalTotal - crossOrderMixBonus) * 100) / 100
    );
    const mergedOrderTotal =
      Math.round((activeFridayOrder.total_amount + addedAmountToPay) * 100) / 100;

    return {
      isMerging: true,
      existingTotal: activeFridayOrder.total_amount,
      crossOrderMixBonus,
      addedAmountToPay,
      mergedOrderTotal,
    };
  }, [activeFridayOrder, mergeMode, cartSummary]);

  const cardBadgeCount = (cardId: string) =>
    cartRows.filter((r) => r.cardId === cardId).reduce((s, r) => s + r.quantity, 0);

  const handleSendOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartRows.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const mergedItems = new Map<number, number>();
      for (const row of cartRows) {
        mergedItems.set(
          row.productId,
          (mergedItems.get(row.productId) || 0) + row.quantity * row.unitsPerQty
        );
      }
      const breakdownNote = cartRows.map((r) => `${r.quantity}× ${r.label}`).join(' | ');
      const combinedNotes = [notes.trim(), breakdownNote].filter(Boolean).join(' · ');

      const effectivePayPref =
        paymentChoice === 'cash_pickup' ? 'cash_pickup' : prepayMethod || 'prepay';
      const payLabelMap: Record<string, string> = {
        cash_pickup: 'תשלום במזומן בעת האיסוף',
        bank_transfer: 'תשלום בהעברה בנקאית',
        bit: 'תשלום מראש ב-Bit',
        paybox: 'תשלום מראש ב-PayBox',
      };

      const isMerging = mergeCalculation.isMerging && activeFridayOrder;
      const targetTotal = isMerging
        ? mergeCalculation.mergedOrderTotal
        : cartSummary.finalTotal;
      const addedAmount = isMerging
        ? mergeCalculation.addedAmountToPay
        : cartSummary.finalTotal;

      const res = await apiFetch<{
        id?: number;
        merged?: boolean;
        customer_id?: number;
        user_id?: number;
        order?: { id: number };
      }>('/api/public/orders', {
        method: 'POST',
        body: JSON.stringify({
          friday_date: fridayDate,
          merge_order_id: isMerging ? activeFridayOrder.id : undefined,
          customer_id: savedProfile?.customerId || undefined,
          recipient_name: customerName.trim(),
          phone: customerPhone.trim(),
          total_amount: targetTotal,
          payment_preference: effectivePayPref,
          notes: combinedNotes,
          items: Array.from(mergedItems.entries()).map(([product_id, quantity]) => ({
            product_id,
            quantity,
          })),
        }),
      });

      const orderId = isMerging
        ? activeFridayOrder.id
        : res.order?.id ?? res.id ?? Date.now();
      const resolvedCustomerId = res.customer_id ?? res.user_id ?? savedProfile?.customerId ?? null;
      const nextProfile: SavedCustomerProfile = {
        customerId: resolvedCustomerId,
        name: customerName.trim(),
        phone: customerPhone.trim(),
      };
      setSavedProfile(nextProfile);
      try {
        localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(nextProfile));
      } catch {}
      fetchCustomerHistory(nextProfile);

      const targetPhone =
        data?.admin_whatsapp_phone && data.admin_whatsapp_phone !== '050-5551000'
          ? data.admin_whatsapp_phone
          : DEFAULT_ADMIN_WHATSAPP;

      const addedItemsForWa = cartRows.map((r) => ({
        product_id: r.productId,
        product_name: r.label,
        quantity: r.quantity,
        unit_price: r.unitPrice,
      }));

      // איחוד רשימת הפריטים המלאה לקישור האישור (?d=...) כך שהמוכר יאשר את כל ההזמנה המעודכנת בלחיצה אחת
      const combinedWaItems = isMerging
        ? [
            ...(activeFridayOrder.items || []).map((it) => ({
              product_id: it.product_id,
              product_name: it.product_name,
              quantity: it.quantity,
              unit_price: it.unit_price_snapshot,
            })),
            ...addedItemsForWa,
          ]
        : addedItemsForWa;

      const waText = formatPublicApprovalWhatsApp({
        id: orderId,
        business_name: data?.business_name || 'המטבח התימני – תפריט יום שישי',
        recipient_name: customerName.trim(),
        phone: customerPhone.trim(),
        friday_date: fridayDate,
        pricing_mode: preorderOpen ? 'preorder' : 'stall',
        items: combinedWaItems,
        total_amount: targetTotal,
        mix_discount: cartSummary.totalMixDiscount + mergeCalculation.crossOrderMixBonus,
        payment_label: payLabelMap[effectivePayPref] || '',
        notes: notes.trim(),
        is_update: Boolean(isMerging),
        previous_total: isMerging ? activeFridayOrder.total_amount : undefined,
        added_items: isMerging ? addedItemsForWa : undefined,
      });
      const waUrl = buildWhatsAppShareUrl(waText, targetPhone);
      setSubmitted({
        orderId,
        waUrl,
        total: targetTotal,
        addedAmount,
        merged: Boolean(isMerging),
        paymentChoice,
        prepayMethod,
      });
      setCartRows([]);
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
    <div className="min-h-screen bg-[#FAF5EE] text-[#1E242B] pb-32">
      {/* סרגל עליון צף וקומפקטי (Sticky Header) */}
      <div className="sticky top-0 z-40 bg-[#1E242B]/95 backdrop-blur-md text-white border-b border-white/10 px-3.5 py-2.5 shadow-md">
        <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
          {/* צד ימין: שם הלקוח המזוהה + כפתור החלף */}
          <div className="flex items-center gap-1.5 min-w-0">
            {savedProfile ? (
              <>
                <span className="font-extrabold text-xs sm:text-sm text-amber-100 truncate">
                  היי {savedProfile.name} 👋
                </span>
                <button
                  type="button"
                  onClick={handleSwitchUser}
                  className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold text-slate-200 shrink-0"
                >
                  החלף
                </button>
              </>
            ) : (
              <span className="font-serif font-extrabold text-sm text-amber-100 truncate flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-[#E59838] shrink-0" />
                <span>דוכן שישי תימני</span>
              </span>
            )}
          </div>

          {/* צד שמאל: כפתור ההזמנות והיתרה שלי + כפתור סל קניות צף */}
          <div className="flex items-center gap-1.5 shrink-0">
            {savedProfile?.customerId && (
              <a
                href={`#/c/${savedProfile.customerId}`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-amber-100 text-[11px] font-extrabold transition-colors"
              >
                <span>📋 ההזמנות והיתרה שלי</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => {
                if (cartSummary.totalCount > 0) setCheckoutOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#C85A17] hover:bg-[#A9440F] text-white text-[11px] font-extrabold tabular-nums shadow-sm transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>🛒 {formatILS(cartSummary.finalTotal)}</span>
              {cartSummary.totalCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-white text-[#C85A17] text-[10px] font-black">
                  {cartSummary.totalCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* כותרת ממותגת חמה */}
      <header className="px-4 pt-3 pb-3.5 bg-gradient-to-b from-[#2B1B12] to-[#4A2816] text-white shadow-sm">
        <div className="max-w-lg mx-auto space-y-1.5 text-center">
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E59838] to-[#C85A17] flex items-center justify-center shadow">
              <Flame className="w-4 h-4 text-white" />
            </div>
            <h1 className="font-serif text-xl font-extrabold text-amber-50">
              המטבח התימני – תפריט שישי
            </h1>
          </div>

          <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-xs font-bold text-amber-100">
            <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            <span>
              {preorderOpen
                ? `המחירים הם בהזמנה מוקדמת (א׳–ו׳ 06:00) · ${formatFridayLabel(fridayDate)}`
                : `מחירון יום שישי · ${formatFridayLabel(fridayDate)}`}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3.5 pt-3 space-y-3">
        {error && (
          <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
            {error}
          </div>
        )}

        {/* באנר התראה ללקוח שכבר קיימת עבורו הזמנה פעילה לאותו יום שישי */}
        {!submitted && activeFridayOrder && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-bold flex items-center justify-between gap-2 shadow-soft">
            <span>
              💡 יש לך כבר הזמנה פעילה לשישי הקרוב (#{activeFridayOrder.id} —{' '}
              {formatILS(activeFridayOrder.total_amount)}). פריטים שתוסיף יצורפו להזמנה הקיימת!
            </span>
            {savedProfile?.customerId && (
              <a
                href={`#/c/${savedProfile.customerId}`}
                className="shrink-0 px-2.5 py-1 rounded-xl bg-[#2B1B12] text-amber-100 text-[11px] font-extrabold whitespace-nowrap"
              >
                📋 לצפייה
              </a>
            )}
          </div>
        )}

        {/* מסך אישור הזמנה ממוקד (מסתיר את רשימת התפריט שמתחת) */}
        {submitted ? (
          <section className="bg-white rounded-3xl border-2 border-emerald-400 shadow-card p-5 space-y-4">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h2 className="font-serif text-xl font-extrabold text-emerald-900">
                {submitted.merged
                  ? `התוספת צורפה להזמנה #${submitted.orderId} ונשלחה לאישור המוכר!`
                  : `הזמנה #${submitted.orderId} נשלחה לאישור המוכר!`}
              </h2>
              <p className="text-xs text-slate-600">
                סה״כ מעודכן להזמנה:{' '}
                <strong className="text-[#C85A17]">{formatILS(submitted.total)}</strong>
                {submitted.merged && submitted.addedAmount !== undefined && (
                  <span className="text-emerald-700 font-bold">
                    {' '}
                    (תוספת נוכחית: {formatILS(submitted.addedAmount)})
                  </span>
                )}
              </p>
            </div>

            {/* סרגל 4 שלבים */}
            <div className="space-y-1.5">
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex gap-1">
                <div className="flex-1 bg-red-600" />
                <div className="flex-1 bg-slate-200" />
                <div className="flex-1 bg-slate-200" />
                <div className="flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-4 text-center text-[10px] font-bold leading-tight">
                {LIVE_STEPS.map((st, idx) => (
                  <span key={st} className={idx === 0 ? 'text-red-700 font-extrabold' : 'text-slate-400'}>
                    {st}
                  </span>
                ))}
              </div>
            </div>

            {/* קופסת תשלום מהיר ב-Bit / PayBox / מזומן */}
            <QuickCustomerPayBox
              amountToPay={submitted.addedAmount ?? submitted.total}
              paymentChoice={submitted.paymentChoice}
              onPaymentChoiceChange={(next) =>
                setSubmitted((prev) => (prev ? { ...prev, paymentChoice: next } : prev))
              }
              prepayMethod={submitted.prepayMethod}
              onPrepayMethodChange={(next) =>
                setSubmitted((prev) => (prev ? { ...prev, prepayMethod: next } : prev))
              }
            />

            {/* פעולות המשך — תמיד 2 כפתורים בשורה (50% / 50%) */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              {savedProfile?.customerId ? (
                <a
                  href={`#/c/${savedProfile.customerId}`}
                  className="py-2.5 px-3 rounded-xl bg-[#2A1F18] hover:bg-[#3d2e24] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 text-center"
                >
                  <span>📋 ההזמנות והיתרה שלי</span>
                </a>
              ) : (
                <a
                  href="#/menu"
                  onClick={() => setSubmitted(null)}
                  className="py-2.5 px-3 rounded-xl bg-[#2A1F18] hover:bg-[#3d2e24] text-white font-extrabold text-xs flex items-center justify-center gap-1.5 text-center"
                >
                  <span>🍽️ לתפריט הראשי</span>
                </a>
              )}
              <button
                type="button"
                onClick={() => setSubmitted(null)}
                className="py-2.5 px-3 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] text-[#8A330B] font-extrabold text-xs flex items-center justify-center gap-1.5 hover:bg-[#F3E9DC] text-center"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>+ הזמנה נוספת</span>
              </button>
            </div>

            {/* קישור משני עדין לשליחה חוזרת בוואטסאפ */}
            <div className="pt-2 border-t border-[#F3E9DC] text-center">
              <a
                href={submitted.waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#25D366] underline underline-offset-2"
              >
                <ExternalLink className="w-3 h-3" />
                <span>וואטסאפ לא נפתח אוטומטית? לחץ לשליחה חוזרת</span>
              </a>
            </div>
          </section>
        ) : (
          <>
            {/* סרגל סינון קטגוריות מהיר */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {MENU_CATEGORIES.map((cat) => {
                const active = selectedCategory === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSelectedCategory(cat.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all border ${
                      active
                        ? 'bg-[#2B1B12] text-amber-50 border-[#2B1B12] shadow-sm'
                        : 'bg-white text-slate-700 border-[#E8D5BE] hover:border-[#C85A17]/60'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* רשימת כרטיסיות מוצר קומפקטיות — לחיצה פותחת ProductOptionsModal */}
            {loading ? (
              <div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-400 border border-[#E8D5BE]">
                טוען את התפריט...
              </div>
            ) : (
              <div className="space-y-2">
                {catalogCards
                  .filter((c) => selectedCategory === 'all' || c.category === selectedCategory)
                  .map((card) => {
                    const inCartCount = cardBadgeCount(card.id);
                    return (
                      <button
                        key={card.id}
                        type="button"
                        disabled={!card.inStock}
                        onClick={() => openProductModal(card)}
                        className={`w-full text-right rounded-2xl px-3.5 py-2.5 border transition-all flex items-center justify-between gap-2.5 ${
                          !card.inStock
                            ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                            : inCartCount > 0
                            ? 'bg-[#FFF7ED] border-[#C85A17] shadow-sm active:scale-[0.99]'
                            : 'bg-white border-[#E8D5BE] hover:border-[#C85A17]/60 shadow-soft active:scale-[0.99]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-9 h-9 rounded-xl bg-[#FAF3E8] border border-[#E8D5BE] flex items-center justify-center text-lg shrink-0">
                            {card.emoji}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-sm text-slate-900">{card.title}</span>
                              <span
                                className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                  card.inStock ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {card.inStock ? 'במלאי' : 'אזל'}
                              </span>
                              {inCartCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-[#C85A17] text-white text-[10px] font-extrabold tabular-nums">
                                  {inCartCount} בסל
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-bold text-[#8A330B] leading-snug mt-0.5">
                              {card.priceSummary}
                            </div>
                          </div>
                        </div>
                        <div className="w-7 h-7 rounded-xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center text-[#C85A17] shrink-0">
                          {card.inStock ? <Plus className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 text-slate-400" />}
                        </div>
                      </button>
                    );
                  })}
              </div>
            )}
          </>
        )}
      </main>

      {/* חלונית התאמה אישית למוצר (ProductOptionsModal) */}
      <BottomSheet
        open={Boolean(activeCard)}
        onClose={() => setActiveCard(null)}
        title={activeCard ? `${activeCard.emoji} ${activeCard.title}` : ''}
        subtitle={activeCard?.description}
        maxWidthClass="md:max-w-md"
      >
        {activeCard && activeOption && (
          <div className="space-y-4">
            {/* בחירת סוג / גודל */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-slate-700">בחר אפשרות:</div>
              <div className="space-y-2">
                {activeCard.options.map((opt) => {
                  const selected = opt.id === activeOption.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedOptionId(opt.id)}
                      className={`w-full p-3.5 rounded-2xl border-2 text-right flex items-center justify-between gap-2 transition-all ${
                        selected
                          ? 'border-[#C85A17] bg-[#FFF7ED] shadow-sm'
                          : 'border-[#E8D5BE] bg-white hover:bg-[#FAF6F0]'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold text-sm text-slate-900">{opt.label}</div>
                        {opt.sublabel && (
                          <div className="text-[11px] font-bold text-emerald-700 mt-0.5">{opt.sublabel}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 tabular-nums">
                        {opt.regularPrice > opt.price && (
                          <span className="text-xs font-bold text-slate-400 line-through decoration-red-600 decoration-2">
                            {formatILS(opt.regularPrice)}
                          </span>
                        )}
                        <span className="font-extrabold text-base text-[#C85A17]">
                          {formatILS(opt.price)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* בחירת טעם (בג'בטה מאורכת ובפרנה גדולה) */}
            {activeCard.hasFlavors && (
              <div className="space-y-2">
                <div className="text-xs font-extrabold text-slate-700">בחר טעם:</div>
                <div className="grid grid-cols-4 gap-2">
                  {FLAVORS.map((fl) => {
                    const active = selectedFlavor === fl;
                    return (
                      <button
                        key={fl}
                        type="button"
                        onClick={() => setSelectedFlavor(fl)}
                        className={`py-2.5 rounded-xl border-2 text-xs font-extrabold transition-all ${
                          active
                            ? 'border-[#1E242B] bg-[#1E242B] text-white'
                            : 'border-[#E8D5BE] bg-[#FAF6F0] text-slate-700'
                        }`}
                      >
                        {fl}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* הערה אופציונלית לפריט */}
            <div>
              <label className="block text-xs font-extrabold text-slate-700 mb-1">
                הערה לפריט (אופציונלי)
              </label>
              <input
                type="text"
                value={modalItemNote}
                onChange={(e) => setModalItemNote(e.target.value)}
                placeholder="למשל: שילוב טעמים / בקשה מיוחדת..."
                className="w-full px-3.5 py-2 rounded-xl border border-[#E8D5BE] bg-[#FDFBF7] text-xs"
              />
            </div>

            {/* בקר כמות + כפתור הוסף לסל */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#F3E9DC]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModalQty((q) => Math.max(1, q - 1))}
                  className="w-11 h-11 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-8 text-center font-extrabold text-base tabular-nums">{modalQty}</span>
                <button
                  type="button"
                  onClick={() => setModalQty((q) => q + 1)}
                  className="w-11 h-11 rounded-2xl bg-[#FAF6F0] border border-[#E8D5BE] flex items-center justify-center active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleAddFromModal}
                className="flex-1 min-h-[48px] px-4 py-3 rounded-2xl bg-[#C85A17] hover:bg-[#A9440F] text-white font-extrabold text-sm shadow-md active:scale-[0.98]"
              >
                הוסף לסל — {formatILS(modalPreviewPrice)}
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* סרגל סיכום צף בתחתית המסך + באנר Upsell חכם (מוסתר במסך אישור ההזמנה) */}
      {!submitted && (
      <div className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#E8D5BE] shadow-[0_-6px_24px_rgba(30,36,43,0.12)]">
        {cartSummary.upsell && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center text-[11px] font-extrabold text-amber-950 flex items-center justify-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-[#C85A17] shrink-0" />
            <span>{cartSummary.upsell}</span>
          </div>
        )}
        <div className="max-w-lg mx-auto px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3">
          <div className="tabular-nums">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500">
                {cartSummary.totalCount > 0 ? `${cartSummary.totalCount} פריטים בסל` : 'לחץ על מוצר לבחירה'}
              </span>
              {cartSummary.totalSavings > 0 && (
                <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  חסכת {formatILS(cartSummary.totalSavings)}!
                </span>
              )}
            </div>
            <div className="text-xl font-extrabold text-[#C85A17]">{formatILS(cartSummary.finalTotal)}</div>
          </div>
          <button
            type="button"
            disabled={cartSummary.totalCount === 0}
            onClick={() => setCheckoutOpen(true)}
            className="px-5 py-3 rounded-2xl bg-[#25D366] hover:bg-[#1EB958] disabled:opacity-45 text-white font-extrabold text-sm flex items-center gap-2 shadow-md active:scale-[0.98]"
          >
            <Send className="w-4 h-4" />
            <span>לסל ושליחה</span>
          </button>
        </div>
      </div>
      )}

      {/* חלונית סל קניות חכם ושליחה בוואטסאפ */}
      <BottomSheet
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        title="סל ההזמנה שלך"
        subtitle={
          mergeCalculation.isMerging && activeFridayOrder
            ? `תוספת להזמנה #${activeFridayOrder.id}: ${formatILS(mergeCalculation.addedAmountToPay)} (סה״כ מעודכן: ${formatILS(mergeCalculation.mergedOrderTotal)})`
            : `סה״כ לתשלום: ${formatILS(cartSummary.finalTotal)}`
        }
        maxWidthClass="md:max-w-md"
      >
        <form onSubmit={handleSendOrder} className="space-y-3.5">
          {/* בורר איחוד להזמנה קיימת לאותו יום שישי לעומת פתיחת הזמנה נפרדת */}
          {activeFridayOrder && (
            <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-300 space-y-2">
              <div className="text-xs font-extrabold text-amber-950">
                💡 נמצאה הזמנה פעילה לשישי הקרוב (#{activeFridayOrder.id} — {formatILS(activeFridayOrder.total_amount)})
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white border border-amber-300">
                <button
                  type="button"
                  onClick={() => setMergeMode('merge')}
                  className={`py-2 px-2 rounded-lg text-[11px] font-extrabold transition-all ${
                    mergeMode === 'merge'
                      ? 'bg-[#C85A17] text-white shadow-sm'
                      : 'text-slate-600 hover:bg-[#FAF6F0]'
                  }`}
                >
                  ➕ הוסף להזמנה הקיימת (#{activeFridayOrder.id})
                </button>
                <button
                  type="button"
                  onClick={() => setMergeMode('new')}
                  className={`py-2 px-2 rounded-lg text-[11px] font-extrabold transition-all ${
                    mergeMode === 'new'
                      ? 'bg-[#2B1B12] text-amber-50 shadow-sm'
                      : 'text-slate-600 hover:bg-[#FAF6F0]'
                  }`}
                >
                  🆕 פתח הזמנה נפרדת
                </button>
              </div>
              {mergeCalculation.isMerging && (
                <div className="text-[11px] text-amber-900 font-bold flex items-center justify-between pt-1 border-t border-amber-200/80 tabular-nums">
                  <span>
                    קיים: {formatILS(mergeCalculation.existingTotal)} + תוספת:{' '}
                    {formatILS(mergeCalculation.addedAmountToPay)}
                  </span>
                  <span className="text-[#8A330B] font-extrabold">
                    סה״כ מאוחד: {formatILS(mergeCalculation.mergedOrderTotal)}
                  </span>
                </div>
              )}
              {mergeCalculation.isMerging && mergeCalculation.crossOrderMixBonus > 0 && (
                <div className="text-[11px] font-extrabold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                  ✨ השלמת זוג מארזים עם ההזמנה הקיימת! הופעלה הנחת מבצע זוג ב-20 ₪ (-{formatILS(mergeCalculation.crossOrderMixBonus)})
                </div>
              )}
            </div>
          )}
          <div className="divide-y divide-[#F3E9DC] border border-[#E8D5BE] rounded-2xl overflow-hidden">
            {cartRows.map((r) => (
              <div key={r.rowKey} className="p-2.5 flex items-center justify-between gap-2 text-xs bg-[#FAF6F0]">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-800">{r.label}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    {r.quantity} × {formatILS(r.unitPrice)} ={' '}
                    <strong className="text-[#8A330B]">{formatILS(r.quantity * r.unitPrice)}</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setCartRows((prev) =>
                        prev
                          .map((x) => (x.rowKey === r.rowKey ? { ...x, quantity: x.quantity - 1 } : x))
                          .filter((x) => x.quantity > 0)
                      )
                    }
                    className="w-7 h-7 rounded-lg bg-white border border-[#E8D5BE] flex items-center justify-center"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCartRows((prev) =>
                        prev.map((x) => (x.rowKey === r.rowKey ? { ...x, quantity: x.quantity + 1 } : x))
                      )
                    }
                    className="w-7 h-7 rounded-lg bg-[#C85A17] text-white flex items-center justify-center"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCartRows((prev) => prev.filter((x) => x.rowKey !== r.rowKey))}
                    className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 flex items-center justify-center"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {cartSummary.totalMixDiscount > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-extrabold flex items-center justify-between tabular-nums">
              <span>✨ הנחת מבצע זוג מארזים (2 ב-20 ₪):</span>
              <span>-{formatILS(cartSummary.totalMixDiscount)}</span>
            </div>
          )}

          {cartSummary.upsell && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-extrabold flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-[#C85A17] shrink-0" />
              <span>{cartSummary.upsell}</span>
            </div>
          )}

          {cartSummary.totalSavings > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-xs font-extrabold flex items-center justify-between tabular-nums">
              <span>🎉 סה״כ חסכת בהזמנה זו:</span>
              <span className="text-sm">{formatILS(cartSummary.totalSavings)}</span>
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

          {/* קופסת תשלום נקייה (תשלום מראש / תשלום באיסוף) */}
          <QuickCustomerPayBox
            amountToPay={
              mergeCalculation.isMerging
                ? mergeCalculation.addedAmountToPay
                : cartSummary.finalTotal
            }
            title={
              mergeCalculation.isMerging && activeFridayOrder
                ? `תשלום עבור התוספת להזמנה #${activeFridayOrder.id}`
                : 'אופן תשלום'
            }
            paymentChoice={paymentChoice}
            onPaymentChoiceChange={setPaymentChoice}
            prepayMethod={prepayMethod}
            onPrepayMethodChange={setPrepayMethod}
          />

          <button
            type="submit"
            disabled={submitting || cartRows.length === 0 || !canSubmitPayment}
            className={`w-full min-h-[52px] py-3.5 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
              canSubmitPayment
                ? 'bg-[#25D366] hover:bg-[#1EB958] text-white'
                : 'bg-slate-200 text-slate-600 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4 shrink-0" />
            <span>
              {submitting
                ? 'שולח...'
                : !canSubmitPayment
                ? 'יש ללחוץ לתשלום מראש לפני שליחת ההזמנה'
                : mergeCalculation.isMerging && activeFridayOrder
                ? `הוסף להזמנה #${activeFridayOrder.id} ושלח בוואטסאפ (+${formatILS(
                    mergeCalculation.addedAmountToPay
                  )})`
                : `שלח הזמנה בוואטסאפ (${formatILS(cartSummary.finalTotal)})`}
            </span>
          </button>
        </form>
      </BottomSheet>
    </div>
  );
}
