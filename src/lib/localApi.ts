import type {
  AdminProduct,
  BusinessSettings,
  FixedExpense,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  ProductPriceHistoryEntry,
  Transaction,
  User,
  UserRole,
} from '../types';
import { getNextFridayISO, isBeforeFridayCancelCutoff } from './format';
import { getFridayPricingStatus } from './pricingCutoff';
import { loadImportedOrdersBackup, removeImportedOrderBackup } from './orderLinkCodec';

const STORAGE_KEY = 'ht_static_db_v1';
const SESSION_KEY = 'ht_static_session_uid';

interface StoredUser extends User {
  password: string;
}

interface StoredOrder extends Omit<Order, 'items' | 'estimated_cost' | 'user_name'> {}

interface StoredInventory {
  friday_date: string;
  product_id: number;
  extra_stall_qty: number;
}

interface StoredSubsidizedEntity {
  id: number;
  name: string;
  phone: string;
  notes: string;
  is_active: boolean;
}

interface StoredSubsidizedPayment {
  id: number;
  entity_id: number;
  date: string;
  amount: number;
  payment_method: PaymentMethod;
  notes: string;
  created_at: string;
}

interface StoredWasteLog {
  friday_date: string;
  product_id: number;
  quantity: number;
  unit_cost: number;
  notes: string;
}

interface LocalDb {
  nextIds: {
    users: number;
    products: number;
    price_history?: number;
    orders: number;
    order_items: number;
    transactions: number;
    fixed_expenses: number;
    subsidized_entities?: number;
    subsidized_payments?: number;
  };
  users: StoredUser[];
  products: AdminProduct[];
  product_price_history?: ProductPriceHistoryEntry[];
  orders: StoredOrder[];
  order_items: Array<Omit<OrderItem, 'product_name'> & { cost_price_snapshot: number }>;
  transactions: Array<Omit<Transaction, 'user_name'>>;
  fixed_expenses: FixedExpense[];
  friday_inventory: StoredInventory[];
  subsidized_entities?: StoredSubsidizedEntity[];
  subsidized_payments?: StoredSubsidizedPayment[];
  waste_logs?: StoredWasteLog[];
  demoPurgedV191?: boolean;
  settings: BusinessSettings;
}

function normalizePM(raw: unknown, fallback: PaymentMethod = 'cash'): PaymentMethod {
  const s = String(raw || '');
  if (s === 'cash') return 'cash';
  if (s === 'paybox' || s === 'bit') return 'paybox';
  if (s === 'transfer') return 'transfer';
  return fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function createInitialDb(): LocalDb {
  const today = new Date().toISOString().slice(0, 10);

  const products: AdminProduct[] = [
    { id: 1, name: 'לחוח', cost_price: 2.5, supplier_price: 3.7, preorder_price: 4.0, customer_price: 5.0, is_active: true },
    { id: 2, name: 'סאלוף', cost_price: 2.5, supplier_price: 3.7, preorder_price: 4.0, customer_price: 5.0, is_active: true },
    { id: 3, name: 'לאפה', cost_price: 2.5, supplier_price: 3.5, preorder_price: 4.0, customer_price: 5.0, is_active: true },
    { id: 4, name: 'קובנה', cost_price: 20.0, supplier_price: 29.0, preorder_price: 30.0, customer_price: 35.0, is_active: true },
    { id: 5, name: 'כובנית', cost_price: 18.0, supplier_price: 28.0, preorder_price: 30.0, customer_price: 30.0, is_active: true },
    { id: 6, name: 'זלביה', cost_price: 7.0, supplier_price: 9.5, preorder_price: 10.0, customer_price: 12.0, is_active: true },
    { id: 7, name: 'פיתה זעתר', cost_price: 2.2, supplier_price: 3.33, preorder_price: 3.5, customer_price: 5.0, is_active: true },
    { id: 8, name: "פיתה פלאפל 10 יח'", cost_price: 10.0, supplier_price: 14.0, preorder_price: 16.0, customer_price: 18.0, is_active: true },
    { id: 9, name: "ג'חנון", cost_price: 5.0, supplier_price: 7.0, preorder_price: 8.0, customer_price: 9.0, is_active: true },
    { id: 10, name: 'פרנה', cost_price: 2.3, supplier_price: 3.5, preorder_price: 4.0, customer_price: 5.0, is_active: true },
    { id: 11, name: 'פרנה גדולה', cost_price: 5.0, supplier_price: 9.0, preorder_price: 10.0, customer_price: 12.0, is_active: true },
    { id: 12, name: 'פרנה שום', cost_price: 3.0, supplier_price: 5.0, preorder_price: 6.0, customer_price: 7.0, is_active: true },
    { id: 13, name: 'סחוג', cost_price: 8.0, supplier_price: 11.5, preorder_price: 13.0, customer_price: 15.0, is_active: true },
    { id: 14, name: "חילבה 250 ג'", cost_price: 5.0, supplier_price: 8.0, preorder_price: 10.0, customer_price: 12.0, is_active: true },
    { id: 15, name: "חילבה 500 ג'", cost_price: 8.0, supplier_price: 14.0, preorder_price: 16.0, customer_price: 20.0, is_active: true },
    { id: 16, name: 'מארז זלביה', cost_price: 7.0, supplier_price: 9.5, preorder_price: 12.0, customer_price: 12.0, is_active: true },
    { id: 17, name: 'מארז לחם שום', cost_price: 6.5, supplier_price: 9.5, preorder_price: 12.0, customer_price: 12.0, is_active: true },
    { id: 18, name: 'מארז פיתה זעתר', cost_price: 6.6, supplier_price: 9.99, preorder_price: 12.0, customer_price: 12.0, is_active: true },
    { id: 19, name: 'מארז פיתה שומשום', cost_price: 6.6, supplier_price: 9.99, preorder_price: 12.0, customer_price: 12.0, is_active: true },
  ];

  const users: StoredUser[] = [
    { id: 1, name: 'אליאב מנהל', phone: '0542452100', email: 'admin@teimani.co.il', password: '123456', role: 'admin', balance: 0, notes: 'מנהל ראשי — דוכן שישי תימני', created_at: today },
    { id: 2, name: 'מעדניית ראש העין', phone: '052-4442211', email: 'supplier@teimani.co.il', password: '123456', role: 'supplier', balance: 0, notes: 'ספק קבוע — משלוח בשישי ב-06:30', created_at: today },
    { id: 3, name: 'מינימרקט השכונה', phone: '054-8883322', email: 'market@teimani.co.il', password: '123456', role: 'supplier', balance: 0, notes: 'העברה בנקאית בתחילת שבוע', created_at: today },
  ];

  return {
    nextIds: {
      users: 4,
      products: 20,
      price_history: 20,
      orders: 1,
      order_items: 1,
      transactions: 1,
      fixed_expenses: 1,
      subsidized_entities: 4,
      subsidized_payments: 1,
    },
    users,
    products,
    product_price_history: products.map((p, idx) => ({
      id: idx + 1,
      product_id: p.id,
      effective_date: '2020-01-01',
      cost_price: p.cost_price,
      supplier_price: p.supplier_price,
      preorder_price: p.preorder_price,
      customer_price: p.customer_price,
      created_at: today,
    })),
    subsidized_entities: [
      { id: 1, name: 'הכולל', phone: '', notes: 'חלוקה שבועית קבועה ותשלום חודשי במזומן', is_active: true },
      { id: 2, name: 'משפחה 1', phone: '', notes: 'חבילת שישי מסובסדת', is_active: true },
      { id: 3, name: 'משפחה 2', phone: '', notes: 'חבילת שישי מסובסדת', is_active: true },
    ],
    subsidized_payments: [],
    waste_logs: [],
    orders: [],
    order_items: [],
    transactions: [],
    fixed_expenses: [],
    friday_inventory: [],
    demoPurgedV191: true,
    settings: {
      business_name: 'דוכן שישי תימני',
      admin_whatsapp_phone: '0542452100',
      default_delivery_fee: 0,
      whatsapp_footer: 'שבת שלום ומבורכת! 🕯️',
    },
  };
}

let memoryDbFallback: LocalDb | null = null;
let memorySessionUid: string | null = null;

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return key === SESSION_KEY ? memorySessionUid : null;
  }
}

function safeSetItem(key: string, val: string): void {
  try {
    localStorage.setItem(key, val);
  } catch {
    if (key === SESSION_KEY) memorySessionUid = val;
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    if (key === SESSION_KEY) memorySessionUid = null;
  }
}

function mergeImportedBackupIntoDb(db: LocalDb): boolean {
  const backups = loadImportedOrdersBackup();
  if (!backups.length) return false;
  let mutated = false;
  const normTail = (p: string) => {
    const d = String(p || '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : d;
  };
  const pMap = new Map(db.products.map((p) => [p.id, p]));

  for (const rec of backups) {
    const pl = rec.payload;
    const phoneTail = normTail(pl.p);
    let cust =
      (phoneTail.length >= 7
        ? db.users.find((u) => u.role !== 'admin' && normTail(u.phone || '') === phoneTail)
        : null) ||
      db.users.find((u) => u.role !== 'admin' && u.name.trim().toLowerCase() === pl.n.trim().toLowerCase()) ||
      null;

    if (!cust) {
      const uid = db.nextIds.users++;
      cust = {
        id: uid,
        name: pl.n || 'לקוח',
        phone: pl.p || '',
        email: `customer${uid}@teimani.local`,
        password: '',
        role: 'customer',
        balance: 0,
        notes: 'יובא אוטומטית מקישור הזמנה בוואטסאפ',
        created_at: new Date().toISOString().slice(0, 10),
      };
      db.users.push(cust);
      mutated = true;
    }

    const existing =
      (pl.id ? db.orders.find((o) => o.id === pl.id) : null) ||
      db.orders.find(
        (o) =>
          o.user_id === cust!.id &&
          o.friday_date === pl.f &&
          o.status !== 'cancelled' &&
          o.status !== 'delivered'
      ) ||
      null;

    if (existing) {
      if (pl.t > 0 && Math.abs(existing.total_amount - pl.t) > 0.01) {
        existing.total_amount = round2(pl.t);
        mutated = true;
      }
      if (Array.isArray(pl.i) && pl.i.length > 0) {
        db.order_items = db.order_items.filter((oi) => oi.order_id !== existing.id);
        for (const it of pl.i) {
          const prod = pMap.get(Number(it.pid)) || db.products[0];
          if (!prod) continue;
          db.order_items.push({
            id: db.nextIds.order_items++,
            order_id: existing.id,
            product_id: prod.id,
            quantity: Math.max(1, Number(it.q) || 1),
            unit_price_snapshot: Math.max(0, Number(it.u) || prod.customer_price),
            cost_price_snapshot: prod.cost_price,
          });
        }
        mutated = true;
      }
      if (pl.nt) {
        const updatedNotes = [pl.p ? `טלפון: ${pl.p}` : '', pl.nt].filter(Boolean).join(' | ');
        if (existing.notes !== updatedNotes) {
          existing.notes = updatedNotes;
          mutated = true;
        }
      }
      if (rec.status === 'received' && (existing.status === 'awaiting_approval' || existing.status === 'pending')) {
        existing.status = 'received';
        mutated = true;
      }
      continue;
    }

    const orderId = pl.id && !db.orders.some((o) => o.id === pl.id) ? pl.id : db.nextIds.orders++;
    if (orderId >= db.nextIds.orders) db.nextIds.orders = orderId + 1;

    for (const it of pl.i || []) {
      const prod = pMap.get(Number(it.pid)) || db.products[0];
      if (!prod) continue;
      db.order_items.push({
        id: db.nextIds.order_items++,
        order_id: orderId,
        product_id: prod.id,
        quantity: Math.max(1, Number(it.q) || 1),
        unit_price_snapshot: Math.max(0, Number(it.u) || prod.customer_price),
        cost_price_snapshot: prod.cost_price,
      });
    }

    const combinedNotes = [pl.p ? `טלפון: ${pl.p}` : '', pl.nt || ''].filter(Boolean).join(' | ');
    db.orders.push({
      id: orderId,
      user_id: cust.id,
      recipient_name: cust.name || pl.n || 'לקוח',
      friday_date: pl.f || getNextFridayISO(),
      order_type: 'customer',
      delivery_fee: 0,
      credit_discount: 0,
      total_amount: round2(pl.t),
      paid_amount: 0,
      status: rec.status,
      notes: combinedNotes,
      created_at: new Date().toISOString().slice(0, 10),
    });
    mutated = true;
  }
  return mutated;
}

function loadDb(): LocalDb {
  if (memoryDbFallback) {
    if (mergeImportedBackupIntoDb(memoryDbFallback)) {
      saveDb(memoryDbFallback);
    }
    return memoryDbFallback;
  }
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDb;
      let mutated = false;
      for (const u of parsed.users || []) {
        if (u.role === 'admin' && u.name === 'יגאל מנהל') {
          u.name = 'אליאב מנהל';
          mutated = true;
        }
      }
      if (mergeImportedBackupIntoDb(parsed)) {
        mutated = true;
      }
      memoryDbFallback = parsed;
      if (mutated) saveDb(parsed);
      return memoryDbFallback;
    }
  } catch {}
  const fresh = createInitialDb();
  mergeImportedBackupIntoDb(fresh);
  saveDb(fresh);
  return fresh;
}

function saveDb(db: LocalDb) {
  memoryDbFallback = db;
  safeSetItem(STORAGE_KEY, JSON.stringify(db));
}

function sanitizeUser(u: StoredUser): User {
  const { password: _p, ...rest } = u;
  return rest;
}

function getSessionUser(db: LocalDb): StoredUser | null {
  const uid = Number(safeGetItem(SESSION_KEY) || 0);
  if (!uid) return null;
  return db.users.find((u) => u.id === uid) || null;
}

function throwErr(message: string, status: number): never {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  throw err;
}

function getMonthBounds(ym: string) {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || new Date().getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  const from = `${y}-${String(m).padStart(2, '0')}-01`;
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  let fridays = 0;
  for (let d = 1; d <= lastDay; d++) {
    if (new Date(y, m - 1, d).getDay() === 5) fridays++;
  }
  return { from, to, fridays: Math.max(1, fridays) };
}

export async function localApiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const db = loadDb();
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(String(options.body)) : {};
  const parsedUrl = new URL(url, window.location.origin);
  const path = parsedUrl.pathname;
  const q = parsedUrl.searchParams;

  // תמיכה במיגרציה אוטומטית ובטוחה להגדרות, מארזי שלישייה, היסטוריית מחירים ו-v1.7.0 ב-localStorage
  if (!db.settings) {
    db.settings = {
      business_name: 'דוכן שישי תימני',
      admin_whatsapp_phone: '0542452100',
      default_delivery_fee: 0,
      whatsapp_footer: 'שבת שלום ומבורכת! 🕯️',
    };
  }
  if (!db.settings.admin_whatsapp_phone) {
    db.settings.admin_whatsapp_phone = '0542452100';
  }
  if (db.settings.business_name === 'המטבח התימני') {
    db.settings.business_name = 'דוכן שישי תימני';
  }
  if (!Array.isArray(db.products)) db.products = createInitialDb().products;
  if (!Array.isArray(db.users)) db.users = createInitialDb().users;
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.order_items)) db.order_items = [];
  if (!Array.isArray(db.transactions)) db.transactions = [];
  if (!Array.isArray(db.fixed_expenses)) db.fixed_expenses = [];
  if (!Array.isArray(db.friday_inventory)) db.friday_inventory = [];
  // תיקון אוטומטי של מזהים כפולים במוצרים (אם נוצרו במיגרציה קודמת) וסנכרון כל מוני ה-nextIds
  let dbMutated = false;
  const seenProdIds = new Set<number>();
  let maxProdId = db.products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  for (const p of db.products) {
    const pid = Number(p.id) || 0;
    if (pid <= 0 || seenProdIds.has(pid)) {
      maxProdId += 1;
      p.id = maxProdId;
      dbMutated = true;
    }
    seenProdIds.add(p.id);
  }
  const safeNextProdId = Math.max(Number(db.nextIds.products) || 1, maxProdId + 1);
  if (db.nextIds.products !== safeNextProdId) {
    db.nextIds.products = safeNextProdId;
    dbMutated = true;
  }

  const trioDefs: Array<Omit<AdminProduct, 'id' | 'is_active'>> = [
    { name: 'מארז זלביה', cost_price: 7.0, supplier_price: 9.5, preorder_price: 12.0, customer_price: 12.0 },
    { name: 'מארז לחם שום', cost_price: 6.5, supplier_price: 9.5, preorder_price: 12.0, customer_price: 12.0 },
    { name: 'מארז פיתה זעתר', cost_price: 6.6, supplier_price: 9.99, preorder_price: 12.0, customer_price: 12.0 },
    { name: 'מארז פיתה שומשום', cost_price: 6.6, supplier_price: 9.99, preorder_price: 12.0, customer_price: 12.0 },
  ];
  for (const tp of trioDefs) {
    if (!db.products.some((p) => p.name === tp.name)) {
      db.products.push({ id: db.nextIds.products++, ...tp, is_active: true });
      dbMutated = true;
    }
  }
  if (!db.product_price_history) {
    db.product_price_history = [];
    db.nextIds.price_history = 1;
    dbMutated = true;
  }
  db.nextIds.price_history = Math.max(
    Number(db.nextIds.price_history) || 1,
    db.product_price_history.reduce((m, h) => Math.max(m, Number(h.id) || 0), 0) + 1
  );
  // מיגרציות v1.7.0 ב-localStorage: פייבוקס, הזמנות מסובסדות ופחת
  if (!db.subsidized_entities) {
    db.subsidized_entities = [
      { id: 1, name: 'הכולל', phone: '', notes: 'חלוקה שבועית קבועה ותשלום חודשי במזומן', is_active: true },
      { id: 2, name: 'משפחה 1', phone: '', notes: 'חבילת שישי מסובסדת', is_active: true },
      { id: 3, name: 'משפחה 2', phone: '', notes: 'חבילת שישי מסובסדת', is_active: true },
    ];
    db.nextIds.subsidized_entities = 4;
    dbMutated = true;
  }
  db.nextIds.subsidized_entities = Math.max(
    Number(db.nextIds.subsidized_entities) || 1,
    db.subsidized_entities.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0) + 1
  );
  if (!db.subsidized_payments) {
    db.subsidized_payments = [];
    db.nextIds.subsidized_payments = 1;
    dbMutated = true;
  }
  db.nextIds.subsidized_payments = Math.max(
    Number(db.nextIds.subsidized_payments) || 1,
    db.subsidized_payments.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1
  );
  if (!db.waste_logs) {
    db.waste_logs = [];
    dbMutated = true;
  }
  // סנכרון מוני nextIds נוספים למניעת התנגשות מזהים
  db.nextIds.users = Math.max(Number(db.nextIds.users) || 1, db.users.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
  db.nextIds.orders = Math.max(Number(db.nextIds.orders) || 1, db.orders.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
  db.nextIds.order_items = Math.max(Number(db.nextIds.order_items) || 1, db.order_items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
  db.nextIds.transactions = Math.max(Number(db.nextIds.transactions) || 1, db.transactions.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
  db.nextIds.fixed_expenses = Math.max(Number(db.nextIds.fixed_expenses) || 1, db.fixed_expenses.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);

  for (const t of db.transactions) {
    if ((t.payment_method as string) === 'bit') { t.payment_method = 'paybox'; dbMutated = true; }
    if (String(t.category || '').includes('ביט')) { t.category = String(t.category).replace(/ביט/g, 'פייבוקס'); dbMutated = true; }
    if (String(t.notes || '').includes('ביט')) { t.notes = String(t.notes).replace(/ביט/g, 'פייבוקס'); dbMutated = true; }
  }
  for (const f of db.fixed_expenses) {
    if ((f.payment_method as string) === 'bit') { f.payment_method = 'paybox'; dbMutated = true; }
  }
  for (const o of db.orders) {
    if (String(o.notes || '').includes('בביט')) { o.notes = String(o.notes).replace(/בביט/g, 'בפייבוקס'); dbMutated = true; }
  }
  for (const p of db.products) {
    if (!db.product_price_history.some((h) => h.product_id === p.id)) {
      db.product_price_history.push({
        id: db.nextIds.price_history++,
        product_id: p.id,
        effective_date: '2020-01-01',
        cost_price: p.cost_price,
        supplier_price: p.supplier_price,
        preorder_price: p.preorder_price,
        customer_price: p.customer_price,
        created_at: new Date().toISOString().slice(0, 10),
      });
      dbMutated = true;
    }
  }
  // מיגרציה חד-פעמית v1.9.1: ניקוי מלא של נתוני דמו (הזמנות, לקוחות דמו, תנועות, מלאי ופחת)
  // תוך שמירה מלאה על קטלוג המוצרים, היסטוריית המחירים, חשבון המנהל וחשבונות הספקים
  if (!db.demoPurgedV191) {
    db.orders = [];
    db.order_items = [];
    db.transactions = [];
    db.friday_inventory = [];
    db.waste_logs = [];
    db.subsidized_payments = [];
    db.fixed_expenses = [];
    db.users = db.users
      .filter((u) => u.role === 'admin' || u.role === 'supplier')
      .map((u) => ({
        ...u,
        balance: 0,
        notes: String(u.notes || '').replace(/המטבח התימני/g, 'דוכן שישי תימני'),
      }));
    const currentSessionUid = Number(safeGetItem(SESSION_KEY) || 0);
    if (currentSessionUid && !db.users.some((u) => u.id === currentSessionUid)) {
      safeRemoveItem(SESSION_KEY);
    }
    db.nextIds.orders = 1;
    db.nextIds.order_items = 1;
    db.nextIds.transactions = 1;
    db.nextIds.fixed_expenses = 1;
    db.nextIds.subsidized_payments = 1;
    db.nextIds.users = Math.max(1, db.users.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1);
    db.demoPurgedV191 = true;
    dbMutated = true;
  }

  if (dbMutated) {
    saveDb(db);
  }

  // --- PUBLIC STOREFRONT (ללא התחברות) ---
  const sortProducts = (list: AdminProduct[]) =>
    [...list].sort((a, b) => (a.sort_order ?? a.id) - (b.sort_order ?? b.id) || a.id - b.id);

  if (path === '/api/public/storefront' && method === 'GET') {
    return {
      business_name: db.settings.business_name || 'דוכן שישי תימני',
      admin_whatsapp_phone: db.settings.admin_whatsapp_phone || '0542452100',
      whatsapp_footer: db.settings.whatsapp_footer || 'שבת שלום ומבורכת! 🕯️',
      products: sortProducts(db.products)
        .filter((p) => p.is_active)
        .map((p) => ({
          id: p.id,
          name: p.name,
          preorder_price: p.preorder_price,
          customer_price: p.customer_price,
          image_url: p.image_url || null,
          sort_order: p.sort_order ?? p.id,
          is_active: true,
        })),
    } as T;
  }

  // ייבוא / אישור הזמנה מקישור וואטסאפ מקודד (?d=...) כאשר הלקוח הזמין ממכשיר אחר
  if (path === '/api/public/import-order' && method === 'POST') {
    const externalId = Number(body.id || 0);
    const recipient_name = String(body.recipient_name || body.n || '').trim() || 'לקוח';
    const phone = String(body.phone || body.p || '').trim();
    const friday_date = String(body.friday_date || body.f || getNextFridayISO()).slice(0, 10);
    const notesRaw = String(body.notes || body.nt || '').trim();
    const targetStatus = (body.status === 'received' ? 'received' : 'awaiting_approval') as OrderStatus;
    const rawItems = (Array.isArray(body.items) ? body.items : []) as Array<{
      product_id?: number;
      pid?: number;
      quantity?: number;
      q?: number;
      unit_price?: number;
      u?: number;
      name?: string;
      nm?: string;
    }>;

    // 1. איתור או יצירת לקוח לפי מספר טלפון מנורמל (ללא כפילויות)
    const normTail = (p: string) => {
      const d = p.replace(/\D/g, '');
      return d.length >= 9 ? d.slice(-9) : d;
    };
    const phoneTail = normTail(phone);
    let matchedCustomer =
      (phoneTail.length >= 7
        ? db.users.find((u) => u.role !== 'admin' && normTail(u.phone || '') === phoneTail)
        : null) ||
      db.users.find((u) => u.role !== 'admin' && u.name.trim().toLowerCase() === recipient_name.toLowerCase()) ||
      null;

    if (!matchedCustomer) {
      const newUid = db.nextIds.users++;
      matchedCustomer = {
        id: newUid,
        name: recipient_name,
        phone,
        email: `customer${newUid}@teimani.local`,
        password: '',
        role: 'customer',
        balance: 0,
        notes: 'יובא אוטומטית מקישור הזמנה בוואטסאפ',
        created_at: new Date().toISOString().slice(0, 10),
      };
      db.users.push(matchedCustomer);
    }

    // 2. בדיקה אם ההזמנה כבר קיימת לפי ID או לפי אותו לקוח + תאריך שישי פעיל (למניעת כפילויות ומיזוג תוספות)
    const incomingTotal = round2(Number(body.total_amount ?? body.t ?? 0));
    const existingOrder =
      (externalId ? db.orders.find((o) => o.id === externalId) : null) ||
      db.orders.find(
        (o) =>
          o.user_id === matchedCustomer!.id &&
          o.friday_date === friday_date &&
          o.status !== 'cancelled' &&
          o.status !== 'delivered'
      ) ||
      null;

    const pMap = new Map(db.products.map((p) => [p.id, p]));

    if (existingOrder) {
      if (incomingTotal > 0) {
        existingOrder.total_amount = incomingTotal;
      }
      if (rawItems.length > 0) {
        db.order_items = db.order_items.filter((oi) => oi.order_id !== existingOrder.id);
        for (const it of rawItems) {
          const pid = Number(it.product_id ?? it.pid ?? 0);
          const qty = Math.max(1, Number(it.quantity ?? it.q ?? 1));
          const prod = pMap.get(pid) || db.products[0];
          const unitPrice = Math.max(0, Number(it.unit_price ?? it.u ?? prod?.customer_price ?? 0));
          if (prod) {
            db.order_items.push({
              id: db.nextIds.order_items++,
              order_id: existingOrder.id,
              product_id: prod.id,
              quantity: qty,
              unit_price_snapshot: unitPrice,
              cost_price_snapshot: prod.cost_price,
            });
          }
        }
      }
      if (notesRaw) {
        existingOrder.notes = [phone ? `טלפון: ${phone}` : '', notesRaw].filter(Boolean).join(' | ');
      }
      if (targetStatus === 'received') {
        existingOrder.status = 'received';
      }
      saveDb(db);
      return { id: existingOrder.id, order: existingOrder, imported: false, updated: true } as T;
    }

    // 3. יצירת ההזמנה במאגר המנהל
    const orderId = externalId && !db.orders.some((o) => o.id === externalId) ? externalId : db.nextIds.orders++;
    if (orderId >= db.nextIds.orders) db.nextIds.orders = orderId + 1;

    let calcTotal = 0;
    for (const it of rawItems) {
      const pid = Number(it.product_id ?? it.pid ?? 0);
      const qty = Math.max(1, Number(it.quantity ?? it.q ?? 1));
      const prod = pMap.get(pid) || db.products[0];
      const unitPrice = Math.max(0, Number(it.unit_price ?? it.u ?? prod?.customer_price ?? 0));
      calcTotal += qty * unitPrice;
      if (prod) {
        db.order_items.push({
          id: db.nextIds.order_items++,
          order_id: orderId,
          product_id: prod.id,
          quantity: qty,
          unit_price_snapshot: unitPrice,
          cost_price_snapshot: prod.cost_price,
        });
      }
    }

    const finalTotal = incomingTotal > 0 ? incomingTotal : round2(calcTotal);
    const combinedNotes = [phone ? `טלפון: ${phone}` : '', notesRaw].filter(Boolean).join(' | ');
    const newOrder: StoredOrder = {
      id: orderId,
      user_id: matchedCustomer.id,
      recipient_name: matchedCustomer.name || recipient_name,
      friday_date,
      order_type: 'customer',
      delivery_fee: 0,
      credit_discount: 0,
      total_amount: finalTotal,
      paid_amount: 0,
      status: targetStatus,
      notes: combinedNotes,
      created_at: new Date().toISOString().slice(0, 10),
    };
    db.orders.push(newOrder);
    saveDb(db);

    return { id: orderId, order: newOrder, imported: true } as T;
  }

  // בקשת ביטול הזמנה מצד הלקוח (עד שישי 06:00 בלבד — מועבר לממתין לאישור ביטול)
  if (path === '/api/public/request-cancel' && method === 'POST') {
    const orderId = Number(body.order_id || body.id || 0);
    const order = db.orders.find((o) => o.id === orderId);
    if (!order) throwErr('ההזמנה לא נמצאה', 404);
    if (order.status === 'cancelled') {
      return { ok: true, order } as T;
    }
    if (!isBeforeFridayCancelCutoff(order.friday_date)) {
      throwErr('לא ניתן לבטל הזמנות לאחר השעה 06:00 בבוקר ביום שישי', 400);
    }
    order.status = 'cancel_requested';
    saveDb(db);
    return { ok: true, order } as T;
  }

  // אישור או דחיית בקשת ביטול הזמנה ע"י המנהל (תומך גם בייבוא מקישור ?d= ממכשיר אחר)
  if (path === '/api/public/resolve-cancel' && method === 'POST') {
    const orderId = Number(body.order_id || body.id || 0);
    const action: 'approve' | 'reject' = body.action === 'reject' ? 'reject' : 'approve';
    let order = db.orders.find((o) => o.id === orderId) || null;

    if (!order && body.decoded && typeof body.decoded === 'object') {
      const dec = body.decoded as {
        id?: number;
        n?: string;
        p?: string;
        f?: string;
        t?: number;
        nt?: string;
        i?: Array<{ pid?: number; q?: number; u?: number; nm?: string }>;
      };
      const recipient_name = String(dec.n || 'לקוח').trim();
      const phone = String(dec.p || '').trim();
      const friday_date = String(dec.f || getNextFridayISO()).slice(0, 10);
      const normTail = (p: string) => {
        const d = p.replace(/\D/g, '');
        return d.length >= 9 ? d.slice(-9) : d;
      };
      const phoneTail = normTail(phone);
      let matchedCustomer =
        (phoneTail.length >= 7
          ? db.users.find((u) => u.role !== 'admin' && normTail(u.phone || '') === phoneTail)
          : null) ||
        db.users.find((u) => u.role !== 'admin' && u.name.trim().toLowerCase() === recipient_name.toLowerCase()) ||
        null;
      if (!matchedCustomer) {
        const newUid = db.nextIds.users++;
        matchedCustomer = {
          id: newUid,
          name: recipient_name,
          phone,
          email: `customer${newUid}@teimani.local`,
          password: '',
          role: 'customer',
          balance: 0,
          notes: 'יובא אוטומטית מקישור ביטול בוואטסאפ',
          created_at: new Date().toISOString().slice(0, 10),
        };
        db.users.push(matchedCustomer);
      }
      const assignedId = orderId && !db.orders.some((o) => o.id === orderId) ? orderId : db.nextIds.orders++;
      if (assignedId >= db.nextIds.orders) db.nextIds.orders = assignedId + 1;

      const pMap = new Map(db.products.map((p) => [p.id, p]));
      for (const it of dec.i || []) {
        const prod = pMap.get(Number(it.pid || 0)) || db.products[0];
        if (prod) {
          db.order_items.push({
            id: db.nextIds.order_items++,
            order_id: assignedId,
            product_id: prod.id,
            quantity: Math.max(1, Number(it.q || 1)),
            unit_price_snapshot: Math.max(0, Number(it.u ?? prod.customer_price)),
            cost_price_snapshot: prod.cost_price,
          });
        }
      }
      order = {
        id: assignedId,
        user_id: matchedCustomer.id,
        recipient_name: matchedCustomer.name || recipient_name,
        friday_date,
        order_type: 'customer',
        delivery_fee: 0,
        credit_discount: 0,
        total_amount: round2(Number(dec.t || 0)),
        paid_amount: 0,
        status: 'cancel_requested',
        notes: [phone ? `טלפון: ${phone}` : '', dec.nt || ''].filter(Boolean).join(' | '),
        created_at: new Date().toISOString().slice(0, 10),
      };
      db.orders.push(order);
    }

    if (!order) throwErr('ההזמנה לא נמצאה', 404);

    if (action === 'approve') {
      order.status = 'cancelled';
      order.total_amount = 0;
      order.paid_amount = 0;
      order.delivery_fee = 0;
      order.credit_discount = 0;
    } else {
      order.status = 'received';
    }
    saveDb(db);
    return { ok: true, action, order } as T;
  }

  if (path === '/api/public/customer-history' && method === 'GET') {
    const cid = Number(q.get('customer_id') || 0);
    const phoneParam = String(q.get('phone') || '').replace(/\D/g, '');
    const normTail = (p: string) => {
      const d = p.replace(/\D/g, '');
      return d.length >= 9 ? d.slice(-9) : d;
    };
    const targetTail = normTail(phoneParam);

    let found = cid ? db.users.find((u) => u.id === cid) || null : null;
    if (!found && targetTail.length >= 7) {
      found = db.users.find((u) => u.role !== 'admin' && normTail(u.phone || '') === targetTail) || null;
    }
    if (!found) {
      return { customer: null, orders: [] } as T;
    }

    const pMap = new Map(db.products.map((p) => [p.id, p]));
    const allCustOrders = db.orders
      .filter((o) => o.user_id === found!.id)
      .sort((a, b) => b.friday_date.localeCompare(a.friday_date) || b.id - a.id);

    const activeOrders = allCustOrders.filter((o) => o.status !== 'cancelled');
    const computedTotal = round2(activeOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0));
    const computedPaid = round2(activeOrders.reduce((s, o) => s + (Number(o.paid_amount) || 0), 0));
    const computedBalance = round2(computedPaid - computedTotal);

    const custOrders = allCustOrders.map((o) => ({
        ...o,
        items: db.order_items
          .filter((it) => it.order_id === o.id)
          .map((it) => ({
            ...it,
            product_name: pMap.get(it.product_id)?.name || `#${it.product_id}`,
          })),
      }));

    return {
      customer: {
        id: found.id,
        name: found.name,
        phone: found.phone,
        balance: computedBalance,
      },
      orders: custOrders,
    } as T;
  }

  if (path === '/api/public/orders' && method === 'POST') {
    const friday_date = String(body.friday_date || getNextFridayISO()).slice(0, 10);
    const recipient_name = String(body.recipient_name || '').trim();
    const phone = String(body.phone || '').trim();
    const incomingUserId = Number(body.user_id || body.customer_id || 0);
    const notesRaw = String(body.notes || '').trim();
    const rawItems = (Array.isArray(body.items) ? body.items : []) as Array<{
      product_id: number;
      quantity: number;
    }>;
    const validItems = rawItems.filter((i) => i.product_id && i.quantity > 0);
    if (!recipient_name || !phone) throwErr('יש להזין שם מלא ומספר טלפון', 400);
    if (!validItems.length) throwErr('יש לבחור לפחות מוצר אחד להזמנה', 400);

    // מניעת כפילויות לפי מספר טלפון מנורמל (9 ספרות אחרונות) או user_id קיים
    const normTail = (p: string) => {
      const d = p.replace(/\D/g, '');
      return d.length >= 9 ? d.slice(-9) : d;
    };
    const phoneTail = normTail(phone);

    let matchedCustomer =
      (incomingUserId ? db.users.find((u) => u.id === incomingUserId && u.role !== 'admin') : null) ||
      (phoneTail.length >= 7
        ? db.users.find((u) => u.role !== 'admin' && normTail(u.phone || '') === phoneTail)
        : null) ||
      null;

    if (!matchedCustomer) {
      const newUid = db.nextIds.users++;
      matchedCustomer = {
        id: newUid,
        name: recipient_name,
        phone,
        email: `customer${newUid}@teimani.local`,
        password: '',
        role: 'customer',
        balance: 0,
        notes: 'נרשם אוטומטית מתפריט הלקוחות',
        created_at: new Date().toISOString().slice(0, 10),
      };
      db.users.push(matchedCustomer);
    }

    const pMap = new Map(db.products.map((p) => [p.id, p]));
    const pricing = getFridayPricingStatus(friday_date);
    const payPrefMap: Record<string, string> = {
      cash_pickup: 'תשלום במזומן בעת האיסוף',
      bank_transfer: 'תשלום בהעברה בנקאית',
      bit: 'תשלום מראש ב-Bit',
      paybox: 'תשלום מראש ב-PayBox',
    };
    const payPrefNote = payPrefMap[String(body.payment_preference || '')] || '';

    // בדיקה אם התבקש מיזוג להזמנה קיימת לאותו יום שישי
    const mergeOrderId = Number(body.merge_order_id || 0);
    const existingToMerge = mergeOrderId
      ? db.orders.find(
          (o) =>
            o.id === mergeOrderId &&
            o.status !== 'cancelled' &&
            o.status !== 'delivered'
        ) || null
      : null;

    if (existingToMerge) {
      let addedCalcTotal = 0;
      const resultItems: Array<{
        product_id: number;
        product_name: string;
        quantity: number;
        unit_price: number;
      }> = [];

      for (const it of validItems) {
        const prod = pMap.get(Number(it.product_id));
        if (!prod || !prod.is_active) throwErr('אחד המוצרים שנבחרו אינו זמין', 400);
        const unitPrice = pricing.isPreorder ? prod.preorder_price : prod.customer_price;
        addedCalcTotal += unitPrice * it.quantity;

        const existingItem = db.order_items.find(
          (oi) => oi.order_id === existingToMerge.id && oi.product_id === prod.id
        );
        if (existingItem) {
          existingItem.quantity += it.quantity;
        } else {
          db.order_items.push({
            id: db.nextIds.order_items++,
            order_id: existingToMerge.id,
            product_id: prod.id,
            quantity: it.quantity,
            unit_price_snapshot: unitPrice,
            cost_price_snapshot: prod.cost_price,
          });
        }
        resultItems.push({
          product_id: prod.id,
          product_name: prod.name,
          quantity: it.quantity,
          unit_price: unitPrice,
        });
      }

      const oldTotal = existingToMerge.total_amount;
      const clientMergedTotal = Number(body.total_amount ?? 0);
      const nextTotal =
        clientMergedTotal > 0 ? round2(clientMergedTotal) : round2(oldTotal + addedCalcTotal);

      existingToMerge.total_amount = nextTotal;
      existingToMerge.status = 'awaiting_approval';
      const additionNote = [payPrefNote, notesRaw ? `תוספת: ${notesRaw}` : '']
        .filter(Boolean)
        .join(' | ');
      if (additionNote) {
        existingToMerge.notes = [existingToMerge.notes, additionNote].filter(Boolean).join(' | ');
      }
      matchedCustomer.balance = round2((matchedCustomer.balance || 0) - Math.max(0, nextTotal - oldTotal));
      saveDb(db);

      return {
        id: existingToMerge.id,
        merged: true,
        customer_id: matchedCustomer.id,
        user_id: matchedCustomer.id,
        friday_date,
        recipient_name: matchedCustomer.name || recipient_name,
        phone,
        pricing_mode: pricing.mode,
        total_amount: nextTotal,
        status: 'awaiting_approval',
        items: resultItems,
        business_name: db.settings.business_name || 'דוכן שישי תימני',
        admin_whatsapp_phone: db.settings.admin_whatsapp_phone || '0542452100',
        whatsapp_footer: db.settings.whatsapp_footer || 'שבת שלום ומבורכת! 🕯️',
      } as T;
    }

    const orderId = db.nextIds.orders++;
    let total_amount = 0;
    const resultItems: Array<{
      product_id: number;
      product_name: string;
      quantity: number;
      unit_price: number;
    }> = [];

    for (const it of validItems) {
      const prod = pMap.get(Number(it.product_id));
      if (!prod || !prod.is_active) throwErr('אחד המוצרים שנבחרו אינו זמין', 400);
      const unitPrice = pricing.isPreorder ? prod.preorder_price : prod.customer_price;
      total_amount += unitPrice * it.quantity;
      db.order_items.push({
        id: db.nextIds.order_items++,
        order_id: orderId,
        product_id: prod.id,
        quantity: it.quantity,
        unit_price_snapshot: unitPrice,
        cost_price_snapshot: prod.cost_price,
      });
      resultItems.push({
        product_id: prod.id,
        product_name: prod.name,
        quantity: it.quantity,
        unit_price: unitPrice,
      });
    }

    const clientTotal = Number(body.total_amount ?? 0);
    total_amount = clientTotal > 0 ? round2(clientTotal) : round2(total_amount);
    const combinedNotes = [`טלפון: ${phone}`, payPrefNote, notesRaw].filter(Boolean).join(' | ');
    db.orders.push({
      id: orderId,
      user_id: matchedCustomer.id,
      recipient_name: matchedCustomer.name || recipient_name,
      friday_date,
      order_type: 'customer',
      delivery_fee: 0,
      credit_discount: 0,
      total_amount,
      paid_amount: 0,
      status: 'awaiting_approval',
      notes: combinedNotes,
      created_at: new Date().toISOString().slice(0, 10),
    });
    matchedCustomer.balance = round2((matchedCustomer.balance || 0) - total_amount);
    saveDb(db);

    return {
      id: orderId,
      customer_id: matchedCustomer.id,
      user_id: matchedCustomer.id,
      friday_date,
      recipient_name: matchedCustomer.name || recipient_name,
      phone,
      pricing_mode: pricing.mode,
      total_amount,
      status: 'awaiting_approval',
      items: resultItems,
      business_name: db.settings.business_name || 'דוכן שישי תימני',
      admin_whatsapp_phone: db.settings.admin_whatsapp_phone || '0542452100',
      whatsapp_footer: db.settings.whatsapp_footer || 'שבת שלום ומבורכת! 🕯️',
    } as T;
  }

  // --- AUTH ---
  if (path === '/api/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const user = db.users.find((u) => u.email.toLowerCase() === email && u.password === password);
    if (!user) throwErr('פרטי ההתחברות שגויים', 401);
    safeSetItem(SESSION_KEY, String(user.id));
    return { user: sanitizeUser(user) } as T;
  }

  if (path === '/api/auth/signup' && method === 'POST') {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!name || !email || password.length < 6) {
      throwErr('יש למלא שם מלא, אימייל וסיסמה בת 6 תווים לפחות', 400);
    }
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      throwErr('כתובת האימייל כבר קיימת במערכת', 409);
    }
    const role: UserRole = body.role === 'supplier' ? 'supplier' : 'customer';
    const user: StoredUser = {
      id: db.nextIds.users++,
      name,
      phone: String(body.phone || '').trim(),
      email,
      password,
      role,
      balance: 0,
      notes: '',
      created_at: new Date().toISOString().slice(0, 10),
    };
    db.users.push(user);
    saveDb(db);
    safeSetItem(SESSION_KEY, String(user.id));
    return { user: sanitizeUser(user) } as T;
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    safeRemoveItem(SESSION_KEY);
    return { ok: true } as T;
  }

  const me = getSessionUser(db);
  if (!me) throwErr('נדרשת התחברות למערכת', 401);

  if (path === '/api/auth/me' && method === 'GET') {
    return { user: sanitizeUser(me) } as T;
  }

  const requireAdmin = () => {
    if (me.role !== 'admin') throwErr('אין לך הרשאה לביצוע פעולה זו', 403);
  };

  // --- SETTINGS ---
  if (path === '/api/settings' && method === 'GET') {
    return { settings: db.settings } as T;
  }
  if (path === '/api/settings' && method === 'PUT') {
    requireAdmin();
    db.settings = {
      business_name: String(body.business_name || 'דוכן שישי תימני').trim(),
      admin_whatsapp_phone: String(body.admin_whatsapp_phone || '0542452100').trim(),
      default_delivery_fee: Math.max(0, Number(body.default_delivery_fee || 0)),
      whatsapp_footer: String(body.whatsapp_footer ?? '').trim(),
    };
    saveDb(db);
    return { settings: db.settings } as T;
  }

  // --- PRODUCTS ---
  if (path === '/api/products' && method === 'GET') {
    const sorted = sortProducts(db.products);
    if (me.role === 'admin') return { products: sorted } as T;
    const active = sorted.filter((p) => p.is_active);
    if (me.role === 'supplier') {
      return {
        products: active.map((p) => ({ id: p.id, name: p.name, supplier_price: p.supplier_price, image_url: p.image_url || null, sort_order: p.sort_order ?? p.id, is_active: true })),
      } as T;
    }
    return {
      products: active.map((p) => ({
        id: p.id,
        name: p.name,
        preorder_price: p.preorder_price,
        customer_price: p.customer_price,
        image_url: p.image_url || null,
        sort_order: p.sort_order ?? p.id,
        is_active: true,
      })),
    } as T;
  }

  if (path === '/api/products/reorder' && method === 'PUT') {
    requireAdmin();
    const orderedIds = Array.isArray(body.ordered_ids)
      ? body.ordered_ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    if (orderedIds.length === 0) throwErr('יש לספק רשימת מוצרים לסידור', 400);
    const byId = new Map(db.products.map((p) => [p.id, p]));
    orderedIds.forEach((pid: number, idx: number) => {
      const p = byId.get(pid);
      if (p) p.sort_order = idx + 1;
    });
    saveDb(db);
    return { ok: true, products: sortProducts(db.products) } as T;
  }

  if (path === '/api/products' && method === 'POST') {
    requireAdmin();
    const name = String(body.name || '').trim();
    if (!name) throwErr('יש להזין שם מוצר', 400);
    if (db.products.some((p) => p.name.trim() === name)) {
      throwErr('מוצר בשם זה כבר קיים במחירון', 409);
    }
    const effective_date = String(body.effective_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const nextUniqueId = Math.max(
      Number(db.nextIds.products) || 1,
      db.products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0) + 1
    );
    db.nextIds.products = nextUniqueId + 1;
    const nextSortOrder = db.products.reduce((m, p) => Math.max(m, Number(p.sort_order ?? p.id) || 0), 0) + 1;
    const prod: AdminProduct = {
      id: nextUniqueId,
      name,
      cost_price: Number(body.cost_price || 0),
      supplier_price: Number(body.supplier_price || 0),
      preorder_price: Number(body.preorder_price || 0),
      customer_price: Number(body.customer_price || 0),
      image_url: body.image_url ? String(body.image_url).trim() : null,
      sort_order: nextSortOrder,
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    };
    db.products.push(prod);
    db.product_price_history!.push({
      id: db.nextIds.price_history!++,
      product_id: prod.id,
      effective_date,
      cost_price: prod.cost_price,
      supplier_price: prod.supplier_price,
      preorder_price: prod.preorder_price,
      customer_price: prod.customer_price,
      created_at: new Date().toISOString().slice(0, 10),
    });
    saveDb(db);
    return { product: prod } as T;
  }

  const prodMatch = path.match(/^\/api\/products\/(\d+)(\/toggle|\/history)?$/);
  if (prodMatch) {
    requireAdmin();
    const pid = Number(prodMatch[1]);
    const prod = db.products.find((p) => p.id === pid);
    if (!prod) throwErr('המוצר לא נמצא', 404);
    if (prodMatch[2] === '/history' && method === 'GET') {
      const history = db.product_price_history!
        .filter((h) => h.product_id === pid)
        .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.id - a.id);
      return { history } as T;
    }
    if (prodMatch[2] === '/toggle' && method === 'PATCH') {
      prod.is_active = !prod.is_active;
      saveDb(db);
      return { product: prod } as T;
    }
    if (method === 'PUT') {
      const today = new Date().toISOString().slice(0, 10);
      const effective_date = String(body.effective_date || today).slice(0, 10);
      const nextCost = body.cost_price !== undefined ? Number(body.cost_price) : prod.cost_price;
      const nextSup = body.supplier_price !== undefined ? Number(body.supplier_price) : prod.supplier_price;
      const nextPre = body.preorder_price !== undefined ? Number(body.preorder_price) : prod.preorder_price;
      const nextCust = body.customer_price !== undefined ? Number(body.customer_price) : prod.customer_price;
      const pricesChanged =
        nextCost !== prod.cost_price ||
        nextSup !== prod.supplier_price ||
        nextPre !== prod.preorder_price ||
        nextCust !== prod.customer_price;

      if (pricesChanged) {
        const existingHist = db.product_price_history!.find(
          (h) => h.product_id === pid && h.effective_date === effective_date
        );
        if (existingHist) {
          existingHist.cost_price = nextCost;
          existingHist.supplier_price = nextSup;
          existingHist.preorder_price = nextPre;
          existingHist.customer_price = nextCust;
        } else {
          db.product_price_history!.push({
            id: db.nextIds.price_history!++,
            product_id: pid,
            effective_date,
            cost_price: nextCost,
            supplier_price: nextSup,
            preorder_price: nextPre,
            customer_price: nextCust,
            created_at: today,
          });
        }
      }

      if (body.name !== undefined) prod.name = String(body.name).trim();
      if (body.image_url !== undefined) prod.image_url = String(body.image_url || '').trim() || null;
      if (body.is_active !== undefined) prod.is_active = Boolean(body.is_active);
      const applyNow = effective_date <= today || !pricesChanged;
      if (applyNow) {
        prod.cost_price = nextCost;
        prod.supplier_price = nextSup;
        prod.preorder_price = nextPre;
        prod.customer_price = nextCust;
      }
      saveDb(db);
      return { product: prod, scheduled: !applyNow, effective_date } as T;
    }
    if (method === 'DELETE' && !prodMatch[2]) {
      const orderRefs = db.order_items.filter((oi) => oi.product_id === pid).length;
      if (orderRefs > 0) {
        throwErr(
          `לא ניתן למחוק את "${prod.name}" לצמיתות כי הוא מופיע ב-${orderRefs} שורות הזמנה היסטוריות. ניתן להשבית אותו כדי להסיר מהתפריט.`,
          409
        );
      }
      db.products = db.products.filter((p) => p.id !== pid);
      db.product_price_history = (db.product_price_history || []).filter((h) => h.product_id !== pid);
      db.friday_inventory = db.friday_inventory.filter((fi) => fi.product_id !== pid);
      db.waste_logs = (db.waste_logs || []).filter((w) => w.product_id !== pid);
      saveDb(db);
      return { ok: true } as T;
    }
  }

  // --- ORDERS ---
  const prodMap = new Map(db.products.map((p) => [p.id, p]));
  const userMap = new Map(db.users.map((u) => [u.id, u]));

  const hydrateOrder = (o: StoredOrder): Order => {
    const items: OrderItem[] = db.order_items
      .filter((it) => it.order_id === o.id)
      .map((it) => ({
        ...it,
        product_name: prodMap.get(it.product_id)?.name || `מוצר #${it.product_id}`,
        cost_price_snapshot: me.role === 'admin' ? it.cost_price_snapshot : 0,
      }));
    const estimated_cost =
      me.role === 'admin'
        ? round2(items.reduce((s, it) => s + it.quantity * (it.cost_price_snapshot ?? 0), 0))
        : undefined;
    return {
      ...o,
      user_name: o.user_id ? userMap.get(o.user_id)?.name || null : null,
      items,
      ...(me.role === 'admin' ? { estimated_cost } : {}),
    };
  };

  if (path === '/api/orders' && method === 'GET') {
    let list = [...db.orders];
    if (me.role !== 'admin') {
      list = list.filter((o) => o.user_id === me.id);
    } else if (q.get('user_id')) {
      list = list.filter((o) => o.user_id === Number(q.get('user_id')));
    }
    if (q.get('friday_date')) list = list.filter((o) => o.friday_date === q.get('friday_date'));
    if (q.get('order_type') && me.role === 'admin') {
      list = list.filter((o) => o.order_type === q.get('order_type'));
    }
    if (q.get('status')) list = list.filter((o) => o.status === q.get('status'));
    list.sort((a, b) => b.friday_date.localeCompare(a.friday_date) || b.id - a.id);
    return { orders: list.map(hydrateOrder) } as T;
  }

  if (path === '/api/orders' && method === 'POST') {
    const friday_date = String(body.friday_date || getNextFridayISO()).slice(0, 10);
    const itemsInput = (Array.isArray(body.items) ? body.items : []) as Array<{ product_id: number; quantity: number }>;
    const validItems = itemsInput.filter((i) => i.product_id && i.quantity > 0);
    if (!validItems.length) throwErr('יש לבחור לפחות מוצר אחד', 400);

    let order_type: OrderType = 'customer';
    let user_id: number | null = null;
    let recipient_name = '';
    let delivery_fee = 0;
    let credit_discount = 0;
    let paid_amount = 0;
    let payment_method: PaymentMethod = 'cash';
    let tier: 'supplier_price' | 'preorder_price' | 'customer_price' | 'charity' = 'preorder_price';

    if (me.role === 'supplier') {
      order_type = 'supplier';
      user_id = me.id;
      recipient_name = me.name;
      tier = 'supplier_price';
    } else if (me.role === 'customer') {
      order_type = 'customer';
      user_id = me.id;
      recipient_name = me.name;
      tier = 'preorder_price';
    } else {
      order_type = body.order_type === 'supplier' || body.order_type === 'charity' ? body.order_type : 'customer';
      user_id = body.user_id ? Number(body.user_id) : null;
      const subEntId =
        order_type === 'charity' && body.subsidized_entity_id ? Number(body.subsidized_entity_id) : null;
      const matchedEnt = subEntId
        ? db.subsidized_entities?.find((e) => e.id === subEntId)
        : order_type === 'charity' && body.recipient_name
        ? db.subsidized_entities?.find((e) => e.name === String(body.recipient_name).trim())
        : undefined;
      recipient_name = String(
        body.recipient_name || matchedEnt?.name || (user_id ? userMap.get(user_id)?.name : '') || ''
      ).trim();
      if (!recipient_name) throwErr('יש להזין שם מקבל ההזמנה', 400);
      delivery_fee = order_type === 'charity' ? 0 : Math.max(0, Number(body.delivery_fee || 0));
      credit_discount = order_type === 'charity' ? 0 : Math.max(0, Number(body.credit_discount || 0));
      paid_amount = order_type === 'charity' ? 0 : Math.max(0, Number(body.paid_amount || 0));
      payment_method = normalizePM(body.payment_method, 'cash');
      tier =
        order_type === 'charity'
          ? 'charity'
          : order_type === 'supplier'
          ? 'supplier_price'
          : body.price_tier === 'customer_price'
          ? 'customer_price'
          : 'preorder_price';
      (body as Record<string, unknown>).__resolvedSubEntId = matchedEnt?.id ?? subEntId ?? null;
    }

    let subtotal = 0;
    const orderId = db.nextIds.orders++;
    const userCustomPrices = user_id ? userMap.get(user_id)?.custom_prices || {} : {};
    const discountPercent =
      order_type === 'charity'
        ? 0
        : me.role === 'admin'
        ? Math.max(0, Math.min(100, Number(body.discount_percent || 0)))
        : Number(me.discount_percent || 0);
    const includeVat = order_type === 'charity' ? false : Boolean(body.include_vat);

    for (const it of validItems) {
      const p = prodMap.get(Number(it.product_id));
      if (!p) throwErr('מוצר לא נמצא', 400);
      const hist = (db.product_price_history || [])
        .filter((h) => h.product_id === p.id && h.effective_date <= friday_date)
        .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.id - a.id)[0];
      const eff = hist || p;
      const override = userCustomPrices[p.id];
      const unitPrice =
        tier === 'charity'
          ? 0
          : override !== undefined && override >= 0
          ? Number(override)
          : eff[tier];
      subtotal += unitPrice * it.quantity;
      db.order_items.push({
        id: db.nextIds.order_items++,
        order_id: orderId,
        product_id: p.id,
        quantity: it.quantity,
        unit_price_snapshot: unitPrice,
        cost_price_snapshot: eff.cost_price,
      });
    }

    const pctDisc = discountPercent > 0 ? round2((subtotal * discountPercent) / 100) : 0;
    const finalDiscount = order_type === 'charity' ? 0 : round2(credit_discount + pctDisc);
    const preVat = order_type === 'charity' ? 0 : Math.max(0, round2(subtotal + delivery_fee - finalDiscount));
    const vat_amount = includeVat ? round2(preVat * 0.18) : 0;
    const total_amount = order_type === 'charity' ? 0 : round2(preVat + vat_amount);
    db.orders.push({
      id: orderId,
      user_id,
      subsidized_entity_id:
        order_type === 'charity'
          ? ((body as Record<string, unknown>).__resolvedSubEntId as number | null) ?? null
          : null,
      recipient_name,
      friday_date,
      order_type,
      delivery_fee,
      credit_discount: finalDiscount,
      discount_percent: discountPercent,
      include_vat: includeVat,
      vat_amount,
      total_amount,
      paid_amount,
      status: 'pending',
      notes: String(body.notes || '').trim(),
      created_at: new Date().toISOString().slice(0, 10),
    });

    if (user_id && order_type !== 'charity') {
      const u = userMap.get(user_id);
      if (u) u.balance = round2(u.balance - (total_amount - paid_amount));
    }
    if (paid_amount > 0) {
      db.transactions.push({
        id: db.nextIds.transactions++,
        date: new Date().toISOString().slice(0, 10),
        friday_date,
        type: 'income',
        category: order_type === 'supplier' ? 'תשלום הזמנת ספק' : 'תשלום הזמנת לקוח',
        payment_method,
        amount: paid_amount,
        user_id,
        notes: `הזמנה #${orderId} — ${recipient_name}`,
      });
    }

    saveDb(db);
    return { id: orderId, total_amount } as T;
  }

  const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch) {
    requireAdmin();
    const oidRaw = orderMatch[1];
    const oid = Number(oidRaw);
    const ord = db.orders.find((o) => String(o.id) === String(oidRaw));
    if (!ord) throwErr('ההזמנה לא נמצאה', 404);

    if (method === 'PATCH') {
      if (body.status) {
        ord.status = body.status as OrderStatus;
        if (ord.status === 'cancelled') {
          ord.total_amount = 0;
          ord.paid_amount = 0;
          ord.delivery_fee = 0;
          ord.credit_discount = 0;
        }
      }
      if (body.notes !== undefined) ord.notes = String(body.notes);
      if (body.paid_amount !== undefined) {
        const nextPaid = Math.max(0, Number(body.paid_amount));
        const diff = round2(nextPaid - ord.paid_amount);
        ord.paid_amount = nextPaid;
        if (diff !== 0) {
          if (ord.user_id) {
            const u = userMap.get(ord.user_id);
            if (u) u.balance = round2(u.balance + diff);
          }
          if (diff > 0) {
            const pm: PaymentMethod = normalizePM(body.payment_method, 'cash');
            db.transactions.push({
              id: db.nextIds.transactions++,
              date: new Date().toISOString().slice(0, 10),
              friday_date: ord.friday_date,
              type: 'income',
              category: ord.order_type === 'supplier' ? 'תשלום הזמנת ספק' : 'תשלום הזמנת לקוח',
              payment_method: pm,
              amount: diff,
              user_id: ord.user_id,
              notes: `עדכון תשלום להזמנה #${oid} — ${ord.recipient_name}`,
            });
          }
        }
      }
      saveDb(db);
      return { ok: true } as T;
    }

    if (method === 'PUT') {
      const oldTotal = ord.total_amount;
      if (body.friday_date) ord.friday_date = String(body.friday_date).slice(0, 10);
      if (body.recipient_name !== undefined) ord.recipient_name = String(body.recipient_name).trim();
      if (body.notes !== undefined) ord.notes = String(body.notes).trim();
      if (ord.order_type !== 'charity') {
        if (body.delivery_fee !== undefined) ord.delivery_fee = Math.max(0, Number(body.delivery_fee) || 0);
        if (body.credit_discount !== undefined) ord.credit_discount = Math.max(0, Number(body.credit_discount) || 0);
        if (body.discount_percent !== undefined) ord.discount_percent = Math.max(0, Math.min(100, Number(body.discount_percent) || 0));
        if (body.include_vat !== undefined) ord.include_vat = Boolean(body.include_vat);
      }
      let sub = 0;
      if (Array.isArray(body.items)) {
        const tier =
          ord.order_type === 'charity'
            ? 'charity'
            : ord.order_type === 'supplier'
            ? 'supplier_price'
            : body.price_tier === 'customer_price'
            ? 'customer_price'
            : 'preorder_price';
        const userCustomPrices = ord.user_id ? userMap.get(ord.user_id)?.custom_prices || {} : {};
        db.order_items = db.order_items.filter((i) => i.order_id !== oid);
        for (const it of body.items as Array<{ product_id: number; quantity: number }>) {
          const p = prodMap.get(Number(it.product_id));
          if (!p || it.quantity <= 0) continue;
          const hist = (db.product_price_history || [])
            .filter((h) => h.product_id === p.id && h.effective_date <= ord.friday_date)
            .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.id - a.id)[0];
          const eff = hist || p;
          const override = userCustomPrices[p.id];
          const up = tier === 'charity' ? 0 : override !== undefined && override >= 0 ? Number(override) : eff[tier];
          sub += up * it.quantity;
          db.order_items.push({
            id: db.nextIds.order_items++,
            order_id: oid,
            product_id: p.id,
            quantity: it.quantity,
            unit_price_snapshot: up,
            cost_price_snapshot: eff.cost_price,
          });
        }
      } else {
        sub = db.order_items
          .filter((i) => i.order_id === oid)
          .reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0);
      }
      if (ord.order_type !== 'charity') {
        const pctDisc = (ord.discount_percent || 0) > 0 ? round2((sub * (ord.discount_percent || 0)) / 100) : 0;
        const fixedDisc = body.credit_discount !== undefined ? Math.max(0, Number(body.credit_discount) || 0) : 0;
        ord.credit_discount = round2(fixedDisc + pctDisc);
        const preVat = Math.max(0, round2(sub + ord.delivery_fee - ord.credit_discount));
        ord.vat_amount = ord.include_vat ? round2(preVat * 0.18) : 0;
        ord.total_amount = round2(preVat + ord.vat_amount);
      } else {
        ord.total_amount = 0;
      }
      const diff = round2(ord.total_amount - oldTotal);
      if (ord.user_id && ord.order_type !== 'charity' && diff !== 0) {
        const u = userMap.get(ord.user_id);
        if (u) u.balance = round2(u.balance - diff);
      }
      saveDb(db);
      return { ok: true, total_amount: ord.total_amount } as T;
    }

    if (method === 'DELETE') {
      if (ord.user_id && ord.order_type !== 'charity' && ord.status !== 'cancelled') {
        const u = userMap.get(ord.user_id);
        if (u) u.balance = round2(u.balance + (ord.total_amount - ord.paid_amount));
      }
      db.orders = db.orders.filter((o) => String(o.id) !== String(oidRaw));
      db.order_items = db.order_items.filter((i) => String(i.order_id) !== String(oidRaw));
      removeImportedOrderBackup(oidRaw, ord.recipient_name, ord.friday_date);
      saveDb(db);
      return { ok: true } as T;
    }
  }

  // --- USERS ---
  if (path === '/api/users' && method === 'GET') {
    requireAdmin();
    return { users: db.users.map(sanitizeUser) } as T;
  }

  if (path === '/api/users' && method === 'POST') {
    requireAdmin();
    const name = String(body.name || '').trim();
    if (!name) throwErr('יש להזין שם', 400);
    const phone = String(body.phone || '').trim();
    const email = String(body.email || `u_${Date.now()}@teimani.local`).trim().toLowerCase();
    const user: StoredUser = {
      id: db.nextIds.users++,
      name,
      phone,
      email,
      password: String(body.password || '123456'),
      role: body.role === 'admin' || body.role === 'supplier' ? body.role : 'customer',
      balance: Number(body.balance || 0),
      discount_percent: Math.max(0, Math.min(100, Number(body.discount_percent || 0))),
      custom_prices: body.custom_prices && typeof body.custom_prices === 'object' ? body.custom_prices : {},
      notes: String(body.notes || '').trim(),
      created_at: new Date().toISOString().slice(0, 10),
    };
    db.users.push(user);
    saveDb(db);
    return { id: user.id, user: sanitizeUser(user) } as T;
  }

  const userAction = path.match(/^\/api\/users\/(\d+)(?:\/(payment|credit|ledger|reset-password))?$/);
  if (userAction) {
    requireAdmin();
    const uid = Number(userAction[1]);
    const action = userAction[2];
    const u = db.users.find((x) => x.id === uid);
    if (!u) throwErr('המשתמש לא נמצא', 404);

    if (!action && method === 'PUT') {
      if (body.name !== undefined) u.name = String(body.name).trim();
      if (body.phone !== undefined) u.phone = String(body.phone).trim();
      if (body.role) u.role = body.role;
      if (body.balance !== undefined) u.balance = Number(body.balance);
      if (body.discount_percent !== undefined) u.discount_percent = Math.max(0, Math.min(100, Number(body.discount_percent)));
      if (body.custom_prices !== undefined && typeof body.custom_prices === 'object') u.custom_prices = body.custom_prices;
      if (body.notes !== undefined) u.notes = String(body.notes).trim();
      saveDb(db);
      return { ok: true } as T;
    }
    if (!action && method === 'DELETE') {
      if (uid === me.id) throwErr('לא ניתן למחוק את המשתמש המחובר כרגע', 400);
      db.orders.forEach((o) => {
        if (o.user_id === uid) o.user_id = null;
      });
      db.transactions.forEach((t) => {
        if (t.user_id === uid) t.user_id = null;
      });
      db.users = db.users.filter((x) => x.id !== uid);
      saveDb(db);
      return { ok: true } as T;
    }
    if (action === 'reset-password' && method === 'POST') {
      const pw = String(body.password || '').trim();
      if (pw.length < 6) throwErr('הסיסמה החדשה חייבת להכיל לפחות 6 תווים', 400);
      u.password = pw;
      saveDb(db);
      return { ok: true } as T;
    }
    if (action === 'payment' && method === 'POST') {
      const amt = Number(body.amount);
      if (!amt || amt <= 0) throwErr('יש להזין סכום חיובי', 400);
      u.balance = round2(u.balance + amt);
      db.transactions.push({
        id: db.nextIds.transactions++,
        date: new Date().toISOString().slice(0, 10),
        friday_date: body.friday_date ? String(body.friday_date).slice(0, 10) : null,
        type: 'income',
        category: u.role === 'supplier' ? 'סגירת חוב ספק' : 'תשלום מלקוח',
        payment_method: normalizePM(body.payment_method, 'transfer'),
        amount: round2(amt),
        user_id: uid,
        notes: String(body.notes || `תשלום מאת ${u.name}`).trim(),
      });
      saveDb(db);
      return { ok: true } as T;
    }
    if (action === 'credit' && method === 'POST') {
      const amt = Number(body.amount);
      if (!amt || amt <= 0) throwErr('יש להזין סכום זיכוי חיובי', 400);
      if (body.order_id) {
        const ord = db.orders.find((o) => o.id === Number(body.order_id) && o.user_id === uid);
        if (ord) {
          ord.credit_discount = round2(ord.credit_discount + amt);
          ord.total_amount = Math.max(0, round2(ord.total_amount - amt));
        }
      }
      u.balance = round2(u.balance + amt);
      saveDb(db);
      return { ok: true } as T;
    }
    if (action === 'ledger' && method === 'GET') {
      const orders = db.orders
        .filter((o) => o.user_id === uid)
        .sort((a, b) => b.friday_date.localeCompare(a.friday_date) || b.id - a.id)
        .map(hydrateOrder);
      const transactions = db.transactions
        .filter((t) => t.user_id === uid)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      return { user: sanitizeUser(u), orders, transactions } as T;
    }
  }

  // --- INVENTORY ---
  if (path === '/api/inventory' && method === 'GET') {
    requireAdmin();
    const fri = String(q.get('friday_date') || getNextFridayISO()).slice(0, 10);
    const friOrders = db.orders.filter(
      (o) => o.friday_date === fri && o.status !== 'awaiting_approval'
    );
    const orderTypeById = new Map(friOrders.map((o) => [o.id, o.order_type]));
    const items = sortProducts(db.products)
      .filter((p) => p.is_active)
      .map((p) => {
        let supplier_qty = 0;
        let customer_qty = 0;
        let charity_qty = 0;
        for (const oi of db.order_items) {
          if (oi.product_id !== p.id) continue;
          const ot = orderTypeById.get(oi.order_id);
          if (ot === 'supplier') supplier_qty += oi.quantity;
          else if (ot === 'customer') customer_qty += oi.quantity;
          else if (ot === 'charity') charity_qty += oi.quantity;
        }
        const extra =
          db.friday_inventory.find((f) => f.friday_date === fri && f.product_id === p.id)?.extra_stall_qty ?? 0;
        const ordered_total = supplier_qty + customer_qty + charity_qty;
        return {
          product_id: p.id,
          product_name: p.name,
          cost_price: p.cost_price,
          customer_price: p.customer_price,
          supplier_qty,
          customer_qty,
          charity_qty,
          ordered_total,
          extra_stall_qty: extra,
          total_to_bake: ordered_total + extra,
        };
      });
    return { friday_date: fri, items } as T;
  }

  if (path === '/api/inventory' && method === 'PUT') {
    requireAdmin();
    const fri = String(body.friday_date || '').slice(0, 10);
    const pid = Number(body.product_id);
    const qty = Math.max(0, Math.floor(Number(body.extra_stall_qty || 0)));
    const ex = db.friday_inventory.find((f) => f.friday_date === fri && f.product_id === pid);
    if (ex) ex.extra_stall_qty = qty;
    else db.friday_inventory.push({ friday_date: fri, product_id: pid, extra_stall_qty: qty });
    saveDb(db);
    return { ok: true } as T;
  }

  // --- SUBSIDIZED ENTITIES & PAYMENTS ---
  if (path.startsWith('/api/subsidized')) {
    requireAdmin();
    const entities = db.subsidized_entities || [];
    const payments = db.subsidized_payments || [];

    if (path === '/api/subsidized' && method === 'GET') {
      const entityByName = new Map(entities.map((e) => [e.name.trim(), e.id]));
      const stats = new Map<number, { orders: number; units: number; cost: number; paid: number }>();
      for (const e of entities) stats.set(e.id, { orders: 0, units: 0, cost: 0, paid: 0 });

      let unlinkedCost = 0;
      let unlinkedUnits = 0;
      for (const o of db.orders) {
        if (o.order_type !== 'charity' || o.status === 'awaiting_approval') continue;
        const oItems = db.order_items.filter((oi) => oi.order_id === o.id);
        const cost = round2(oItems.reduce((s, it) => s + it.quantity * it.cost_price_snapshot, 0));
        const units = oItems.reduce((s, it) => s + it.quantity, 0);
        const eid = o.subsidized_entity_id ?? entityByName.get(o.recipient_name.trim()) ?? null;
        if (eid && stats.has(eid)) {
          const st = stats.get(eid)!;
          st.orders += 1;
          st.units += units;
          st.cost = round2(st.cost + cost);
        } else {
          unlinkedCost = round2(unlinkedCost + cost);
          unlinkedUnits += units;
        }
      }
      for (const p of payments) {
        if (stats.has(p.entity_id)) {
          stats.get(p.entity_id)!.paid = round2(stats.get(p.entity_id)!.paid + p.amount);
        }
      }

      const entMap = new Map(entities.map((e) => [e.id, e]));
      const hydrated = entities.map((e) => {
        const s = stats.get(e.id) || { orders: 0, units: 0, cost: 0, paid: 0 };
        return {
          ...e,
          total_orders: s.orders,
          total_units: s.units,
          total_cost: round2(s.cost),
          total_paid: round2(s.paid),
          net_subsidy_gap: round2(s.cost - s.paid),
        };
      });
      const total_cost = round2(hydrated.reduce((s, e) => s + e.total_cost, 0) + unlinkedCost);
      const total_paid = round2(hydrated.reduce((s, e) => s + e.total_paid, 0));
      const total_units = hydrated.reduce((s, e) => s + e.total_units, 0) + unlinkedUnits;

      return {
        entities: hydrated,
        payments: [...payments]
          .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
          .map((p) => ({ ...p, entity_name: entMap.get(p.entity_id)?.name || '' })),
        totals: {
          total_cost,
          total_paid,
          net_subsidy_expense: round2(total_cost - total_paid),
          total_units,
        },
      } as T;
    }

    if (path === '/api/subsidized/entities' && method === 'POST') {
      const name = String(body.name || '').trim();
      if (!name) throwErr('יש להזין שם לגוף המסובסד', 400);
      if (entities.some((e) => e.name === name)) throwErr('כבר קיים גוף מסובסד בשם זה', 409);
      const id = db.nextIds.subsidized_entities!++;
      entities.push({
        id,
        name,
        phone: String(body.phone || '').trim(),
        notes: String(body.notes || '').trim(),
        is_active: true,
      });
      saveDb(db);
      return { id } as T;
    }

    const entMatch = path.match(/^\/api\/subsidized\/entities\/(\d+)$/);
    if (entMatch) {
      const eid = Number(entMatch[1]);
      const ent = entities.find((e) => e.id === eid);
      if (!ent) throwErr('הגוף המסובסד לא נמצא', 404);
      if (method === 'PUT') {
        const name = String(body.name || '').trim();
        if (!name) throwErr('יש להזין שם תקין', 400);
        if (entities.some((e) => e.name === name && e.id !== eid)) throwErr('כבר קיים גוף מסובסד בשם זה', 409);
        ent.name = name;
        ent.phone = String(body.phone || '').trim();
        ent.notes = String(body.notes || '').trim();
        for (const o of db.orders) {
          if (o.subsidized_entity_id === eid) o.recipient_name = name;
        }
        saveDb(db);
        return { ok: true } as T;
      }
      if (method === 'DELETE') {
        db.subsidized_entities = entities.filter((e) => e.id !== eid);
        db.subsidized_payments = payments.filter((p) => p.entity_id !== eid);
        for (const o of db.orders) {
          if (o.subsidized_entity_id === eid) o.subsidized_entity_id = null;
        }
        saveDb(db);
        return { ok: true } as T;
      }
    }

    if (path === '/api/subsidized/payments' && method === 'POST') {
      const entity_id = Number(body.entity_id);
      const amount = Number(body.amount);
      const ent = entities.find((e) => e.id === entity_id);
      if (!ent || !amount || amount <= 0) throwErr('יש לבחור גוף ולהזין סכום חיובי', 400);
      const id = db.nextIds.subsidized_payments!++;
      payments.push({
        id,
        entity_id,
        date: String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
        amount: round2(amount),
        payment_method: normalizePM(body.payment_method, 'cash'),
        notes: String(body.notes || `תשלום חודשי — ${ent.name}`).trim(),
        created_at: new Date().toISOString().slice(0, 10),
      });
      saveDb(db);
      return { id } as T;
    }

    const payDel = path.match(/^\/api\/subsidized\/payments\/(\d+)$/);
    if (payDel && method === 'DELETE') {
      db.subsidized_payments = payments.filter((p) => p.id !== Number(payDel[1]));
      saveDb(db);
      return { ok: true } as T;
    }
  }

  // --- FINANCE ---
  if (path.startsWith('/api/finance')) {
    requireAdmin();

    if (path === '/api/finance/waste' && method === 'GET') {
      const fri = String(q.get('friday_date') || getNextFridayISO()).slice(0, 10);
      const wMap = new Map((db.waste_logs || []).filter((w) => w.friday_date === fri).map((w) => [w.product_id, w]));
      const items = sortProducts(db.products)
        .filter((p) => p.is_active)
        .map((p) => {
          const w = wMap.get(p.id);
          const qty = w ? w.quantity : 0;
          const unitCost = w && w.unit_cost > 0 ? w.unit_cost : p.cost_price;
          return {
            product_id: p.id,
            product_name: p.name,
            cost_price: round2(unitCost),
            quantity: qty,
            line_cost: round2(qty * unitCost),
            notes: w?.notes || '',
          };
        });
      return {
        friday_date: fri,
        items,
        total_waste_units: items.reduce((s, i) => s + i.quantity, 0),
        total_waste_cost: round2(items.reduce((s, i) => s + i.line_cost, 0)),
      } as T;
    }

    if (path === '/api/finance/waste' && method === 'PUT') {
      const fri = String(body.friday_date || getNextFridayISO()).slice(0, 10);
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!db.waste_logs) db.waste_logs = [];
      for (const row of rawItems) {
        const pid = Number(row.product_id);
        const qty = Math.max(0, Math.floor(Number(row.quantity) || 0));
        const notes = String(row.notes || '').trim();
        const p = prodMap.get(pid);
        if (!p) continue;
        db.waste_logs = db.waste_logs.filter((w) => !(w.friday_date === fri && w.product_id === pid));
        if (qty > 0) {
          const hist = (db.product_price_history || [])
            .filter((h) => h.product_id === pid && h.effective_date <= fri)
            .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.id - a.id)[0];
          const unitCost = round2(hist ? hist.cost_price : p.cost_price);
          db.waste_logs.push({ friday_date: fri, product_id: pid, quantity: qty, unit_cost: unitCost, notes });
        }
      }
      saveDb(db);
      return { ok: true } as T;
    }

    if (path === '/api/finance/transactions' && method === 'GET') {
      let list = [...db.transactions];
      if (q.get('friday_date')) list = list.filter((t) => t.friday_date === q.get('friday_date'));
      if (q.get('from_date')) list = list.filter((t) => t.date >= q.get('from_date')!);
      if (q.get('to_date')) list = list.filter((t) => t.date <= q.get('to_date')!);
      if (q.get('type')) list = list.filter((t) => t.type === q.get('type'));
      if (q.get('payment_method')) list = list.filter((t) => t.payment_method === q.get('payment_method'));
      list.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      return {
        transactions: list.map((t) => ({ ...t, user_name: t.user_id ? userMap.get(t.user_id)?.name || null : null })),
      } as T;
    }

    if (path === '/api/finance/stall-closeout' && method === 'POST') {
      const fri = String(body.friday_date || getNextFridayISO()).slice(0, 10);
      const date = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
      const cash = Math.max(0, Number(body.cash_amount || 0));
      const paybox = Math.max(0, Number(body.paybox_amount ?? body.bit_amount ?? 0));
      const transfer = Math.max(0, Number(body.transfer_amount || 0));
      if (cash <= 0 && paybox <= 0 && transfer <= 0) {
        throwErr('יש להזין סכום במזומן, בפייבוקס או בהעברה בנקאית', 400);
      }
      const ids: number[] = [];
      if (cash > 0) {
        const id = db.nextIds.transactions++;
        db.transactions.push({ id, date, friday_date: fri, type: 'income', category: 'מכירות דוכן שישי (מזומן)', payment_method: 'cash', amount: round2(cash), user_id: null, notes: String(body.notes || `סיכום קופה מזומן — ${fri}`) });
        ids.push(id);
      }
      if (paybox > 0) {
        const id = db.nextIds.transactions++;
        db.transactions.push({ id, date, friday_date: fri, type: 'income', category: 'מכירות דוכן שישי (פייבוקס)', payment_method: 'paybox', amount: round2(paybox), user_id: null, notes: String(body.notes || `סיכום קופה פייבוקס — ${fri}`) });
        ids.push(id);
      }
      if (transfer > 0) {
        const id = db.nextIds.transactions++;
        db.transactions.push({ id, date, friday_date: fri, type: 'income', category: 'מכירות דוכן שישי (העברה בנקאית)', payment_method: 'transfer', amount: round2(transfer), user_id: null, notes: String(body.notes || `סיכום קופה העברה בנקאית — ${fri}`) });
        ids.push(id);
      }
      saveDb(db);
      return { ok: true, ids } as T;
    }

    if (path === '/api/finance/transactions' && method === 'POST') {
      const id = db.nextIds.transactions++;
      db.transactions.push({
        id,
        date: String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
        friday_date: body.friday_date ? String(body.friday_date).slice(0, 10) : null,
        type: body.type === 'expense' ? 'expense' : 'income',
        category: String(body.category || '').trim(),
        payment_method: normalizePM(body.payment_method, 'cash'),
        amount: round2(Number(body.amount || 0)),
        user_id: body.user_id ? Number(body.user_id) : null,
        notes: String(body.notes || '').trim(),
      });
      saveDb(db);
      return { id } as T;
    }

    const txDel = path.match(/^\/api\/finance\/transactions\/(\d+)$/);
    if (txDel && method === 'DELETE') {
      db.transactions = db.transactions.filter((t) => t.id !== Number(txDel[1]));
      saveDb(db);
      return { ok: true } as T;
    }

    if (path === '/api/finance/fixed-expenses' && method === 'GET') {
      return { fixed_expenses: db.fixed_expenses } as T;
    }
    if (path === '/api/finance/fixed-expenses' && method === 'POST') {
      const id = db.nextIds.fixed_expenses++;
      db.fixed_expenses.push({
        id,
        name: String(body.name || '').trim(),
        amount: round2(Number(body.amount || 0)),
        frequency: body.frequency === 'monthly' ? 'monthly' : 'weekly',
        payment_method: normalizePM(body.payment_method, 'transfer'),
        is_active: true,
      });
      saveDb(db);
      return { id } as T;
    }
    if (path === '/api/finance/fixed-expenses/apply' && method === 'POST') {
      const freq = String(body.frequency || 'weekly');
      const fri = String(body.friday_date || getNextFridayISO()).slice(0, 10);
      const date = new Date().toISOString().slice(0, 10);
      const items = db.fixed_expenses.filter((f) => f.is_active && (freq === 'all' || f.frequency === freq));
      for (const f of items) {
        db.transactions.push({
          id: db.nextIds.transactions++,
          date,
          friday_date: fri,
          type: 'expense',
          category: f.name,
          payment_method: f.payment_method,
          amount: f.amount,
          user_id: null,
          notes: `[הוצאה קבועה] החלה לתקופה (${f.frequency === 'weekly' ? 'שבועי' : 'חודשי'})`,
        });
      }
      saveDb(db);
      return { ok: true, count: items.length } as T;
    }
    const fxMatch = path.match(/^\/api\/finance\/fixed-expenses\/(\d+)(\/toggle)?$/);
    if (fxMatch) {
      const fid = Number(fxMatch[1]);
      const fx = db.fixed_expenses.find((f) => f.id === fid);
      if (!fx) throwErr('ההוצאה לא נמצאה', 404);
      if (fxMatch[2] === '/toggle' && method === 'PATCH') {
        fx.is_active = !fx.is_active;
        saveDb(db);
        return { ok: true } as T;
      }
      if (method === 'PUT') {
        fx.name = String(body.name || fx.name).trim();
        fx.amount = round2(Number(body.amount || fx.amount));
        fx.frequency = body.frequency === 'monthly' ? 'monthly' : 'weekly';
        fx.payment_method = normalizePM(body.payment_method, 'transfer');
        saveDb(db);
        return { ok: true } as T;
      }
      if (method === 'DELETE') {
        db.fixed_expenses = db.fixed_expenses.filter((f) => f.id !== fid);
        saveDb(db);
        return { ok: true } as T;
      }
    }

    if (path === '/api/finance/pnl' && method === 'GET') {
      const modeRaw = q.get('mode') || 'friday';
      const mode: 'friday' | 'month' | 'custom' = modeRaw === 'month' || modeRaw === 'custom' ? modeRaw : 'friday';
      const fri = String(q.get('friday_date') || getNextFridayISO()).slice(0, 10);
      const month = String(q.get('month') || new Date().toISOString().slice(0, 7)).slice(0, 7);
      const fromD = String(q.get('from_date') || fri).slice(0, 10);
      const toD = String(q.get('to_date') || fri).slice(0, 10);

      let from = fri;
      let to = fri;
      let label = fri;
      let weeklyFactor = 1;
      let monthlyFactor = 1 / 4.3333;

      if (mode === 'month') {
        const b = getMonthBounds(month);
        from = b.from;
        to = b.to;
        label = month;
        weeklyFactor = b.fridays;
        monthlyFactor = 1;
      } else if (mode === 'custom') {
        from = fromD <= toD ? fromD : toD;
        to = fromD <= toD ? toD : fromD;
        label = `${from} — ${to}`;
        const days = Math.max(1, Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000) + 1);
        weeklyFactor = days / 7;
        monthlyFactor = days / 30.4375;
      }

      const inRange = (d: string) => d >= from && d <= to;
      const pOrders = db.orders.filter(
        (o) => inRange(o.friday_date) && o.status !== 'awaiting_approval'
      );
      const pOrderMap = new Map(pOrders.map((o) => [o.id, o]));
      const customer_orders_revenue = round2(pOrders.filter((o) => o.order_type === 'customer').reduce((s, o) => s + o.total_amount, 0));
      const supplier_orders_revenue = round2(pOrders.filter((o) => o.order_type === 'supplier').reduce((s, o) => s + o.total_amount, 0));

      let orders_cogs = 0;
      let period_subsidized_cost = 0;
      let period_subsidized_units = 0;
      for (const oi of db.order_items) {
        const ord = pOrderMap.get(oi.order_id);
        if (!ord) continue;
        if (ord.order_type === 'charity') {
          period_subsidized_cost += oi.quantity * oi.cost_price_snapshot;
          period_subsidized_units += oi.quantity;
        } else {
          orders_cogs += oi.quantity * oi.cost_price_snapshot;
        }
      }

      // פחת סוף יום
      let waste_cost = 0;
      let waste_units = 0;
      const wasteByDateProd = new Map<string, number>();
      for (const w of db.waste_logs || []) {
        if (!inRange(w.friday_date)) continue;
        waste_units += w.quantity;
        waste_cost += w.quantity * w.unit_cost;
        const k = `${w.friday_date}_${w.product_id}`;
        wasteByDateProd.set(k, (wasteByDateProd.get(k) || 0) + w.quantity);
      }
      waste_cost = round2(waste_cost);

      let extra_stall_cogs = 0;
      let extra_stall_units = 0;
      for (const fi of db.friday_inventory) {
        if (!inRange(fi.friday_date)) continue;
        const p = prodMap.get(fi.product_id);
        const wastedQty = wasteByDateProd.get(`${fi.friday_date}_${fi.product_id}`) || 0;
        const soldExtra = Math.max(0, fi.extra_stall_qty - wastedQty);
        extra_stall_units += soldExtra;
        extra_stall_cogs += soldExtra * (p?.cost_price ?? 0);
      }
      extra_stall_cogs = round2(extra_stall_cogs);

      const pTx = db.transactions.filter((t) => inRange(t.friday_date || t.date));
      let walkin_stall_cash = 0;
      let walkin_stall_paybox = 0;
      let walkin_stall_transfer = 0;
      let variable_expenses = 0;
      let bakery_cash_purchases = 0;
      let posted_fixed_expenses = 0;
      const expMap = new Map<string, number>();
      const rec = {
        cash: { in: 0, out: 0, net: 0 },
        paybox: { in: 0, out: 0, net: 0 },
        transfer: { in: 0, out: 0, net: 0 },
      };

      for (const t of pTx) {
        const pm = normalizePM(t.payment_method, 'cash');
        if (t.type === 'income') {
          rec[pm].in = round2(rec[pm].in + t.amount);
          if (t.category.includes('דוכן')) {
            if (pm === 'cash') walkin_stall_cash += t.amount;
            else if (pm === 'paybox') walkin_stall_paybox += t.amount;
            else walkin_stall_transfer += t.amount;
          }
        } else {
          rec[pm].out = round2(rec[pm].out + t.amount);
          if (t.notes.includes('[הוצאה קבועה]')) posted_fixed_expenses += t.amount;
          else if (t.category.includes('רכש מאפייה')) bakery_cash_purchases += t.amount;
          else {
            variable_expenses += t.amount;
            expMap.set(t.category, round2((expMap.get(t.category) || 0) + t.amount));
          }
        }
      }
      rec.cash.net = round2(rec.cash.in - rec.cash.out);
      rec.paybox.net = round2(rec.paybox.in - rec.paybox.out);
      rec.transfer.net = round2(rec.transfer.in - rec.transfer.out);

      const walkin_stall_revenue = round2(walkin_stall_cash + walkin_stall_paybox + walkin_stall_transfer);
      const prorated_fixed_items = db.fixed_expenses
        .filter((f) => f.is_active)
        .map((f) => ({
          id: f.id,
          name: f.name,
          frequency: f.frequency,
          base_amount: f.amount,
          prorated_amount: round2(f.amount * (f.frequency === 'weekly' ? weeklyFactor : monthlyFactor)),
        }));
      const prorated_fixed_expenses = round2(prorated_fixed_items.reduce((s, i) => s + i.prorated_amount, 0));
      const total_revenue = round2(customer_orders_revenue + supplier_orders_revenue + walkin_stall_revenue);
      const total_cogs = round2(orders_cogs + extra_stall_cogs);
      const gross_profit = round2(total_revenue - total_cogs - waste_cost);
      const gross_margin_pct = total_revenue > 0 ? round2((gross_profit / total_revenue) * 100) : 0;
      const net_profit = round2(gross_profit - variable_expenses - prorated_fixed_expenses);
      const net_margin_pct = total_revenue > 0 ? round2((net_profit / total_revenue) * 100) : 0;

      // סעיף נפרד: הוצאות הזמנות מסובסדות
      const entities = db.subsidized_entities || [];
      const subPayments = db.subsidized_payments || [];
      const entByName = new Map(entities.map((e) => [e.name.trim(), e.id]));
      const periodSubReceipts = round2(
        subPayments.filter((p) => inRange(p.date)).reduce((s, p) => s + p.amount, 0)
      );
      const cumSubReceipts = round2(subPayments.reduce((s, p) => s + p.amount, 0));
      let cumSubCost = 0;

      const entPeriod = new Map<number, { cost: number; paid: number }>();
      const entCum = new Map<number, { cost: number; paid: number }>();
      for (const e of entities) {
        entPeriod.set(e.id, { cost: 0, paid: 0 });
        entCum.set(e.id, { cost: 0, paid: 0 });
      }
      for (const o of db.orders) {
        if (o.order_type !== 'charity' || o.status === 'awaiting_approval') continue;
        const c = round2(
          db.order_items
            .filter((oi) => oi.order_id === o.id)
            .reduce((s, oi) => s + oi.quantity * oi.cost_price_snapshot, 0)
        );
        cumSubCost = round2(cumSubCost + c);
        const eid = o.subsidized_entity_id ?? entByName.get(o.recipient_name.trim()) ?? null;
        if (eid && entCum.has(eid)) {
          entCum.get(eid)!.cost = round2(entCum.get(eid)!.cost + c);
          if (inRange(o.friday_date)) {
            entPeriod.get(eid)!.cost = round2(entPeriod.get(eid)!.cost + c);
          }
        }
      }
      for (const p of subPayments) {
        if (entCum.has(p.entity_id)) {
          entCum.get(p.entity_id)!.paid = round2(entCum.get(p.entity_id)!.paid + p.amount);
          if (inRange(p.date)) {
            entPeriod.get(p.entity_id)!.paid = round2(entPeriod.get(p.entity_id)!.paid + p.amount);
          }
        }
      }

      const openUsers = db.users.filter((u) => Math.abs(u.balance) > 0.009).sort((a, b) => a.balance - b.balance).map(sanitizeUser);
      return {
        period: { mode, label },
        pnl: {
          customer_orders_revenue,
          supplier_orders_revenue,
          walkin_stall_cash: round2(walkin_stall_cash),
          walkin_stall_paybox: round2(walkin_stall_paybox),
          walkin_stall_transfer: round2(walkin_stall_transfer),
          walkin_stall_revenue,
          total_revenue,
          orders_cogs: round2(orders_cogs),
          extra_stall_cogs: round2(extra_stall_cogs),
          extra_stall_units,
          total_cogs,
          waste_cost,
          waste_units,
          gross_profit,
          gross_margin_pct,
          variable_expenses: round2(variable_expenses),
          bakery_cash_purchases: round2(bakery_cash_purchases),
          expense_breakdown: Array.from(expMap.entries()).map(([category, amount]) => ({ category, amount })),
          prorated_fixed_expenses,
          prorated_fixed_items,
          posted_fixed_expenses: round2(posted_fixed_expenses),
          net_profit,
          net_margin_pct,
        },
        subsidized: {
          period_cost: round2(period_subsidized_cost),
          period_units: period_subsidized_units,
          period_receipts: periodSubReceipts,
          period_net_expense: round2(period_subsidized_cost - periodSubReceipts),
          cumulative_cost: cumSubCost,
          cumulative_receipts: cumSubReceipts,
          cumulative_net_expense: round2(cumSubCost - cumSubReceipts),
          entities: entities.map((e) => {
            const pm = entPeriod.get(e.id) || { cost: 0, paid: 0 };
            const cm = entCum.get(e.id) || { cost: 0, paid: 0 };
            return {
              id: e.id,
              name: e.name,
              period_cost: round2(pm.cost),
              period_receipts: round2(pm.paid),
              period_net_gap: round2(pm.cost - pm.paid),
              cumulative_net_gap: round2(cm.cost - cm.paid),
            };
          }),
        },
        reconciliation: {
          ...rec,
          digital_combined: {
            in: round2(rec.paybox.in + rec.transfer.in),
            out: round2(rec.paybox.out + rec.transfer.out),
            net: round2(rec.paybox.net + rec.transfer.net),
          },
          total_in: round2(rec.cash.in + rec.paybox.in + rec.transfer.in),
          total_out: round2(rec.cash.out + rec.paybox.out + rec.transfer.out),
          total_net: round2(rec.cash.net + rec.paybox.net + rec.transfer.net),
        },
        open_balances: {
          items: openUsers,
          total_receivables: round2(openUsers.filter((u) => u.balance < 0).reduce((s, u) => s + Math.abs(u.balance), 0)),
          total_credits: round2(openUsers.filter((u) => u.balance > 0).reduce((s, u) => s + u.balance, 0)),
        },
      } as T;
    }
  }

  throwErr(`נתיב לא נתמך: ${path}`, 404);
}
