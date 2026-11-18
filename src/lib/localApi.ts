import type {
  AdminProduct,
  BusinessSettings,
  FixedExpense,
  Order,
  OrderItem,
  OrderStatus,
  OrderType,
  PaymentMethod,
  Transaction,
  User,
  UserRole,
} from '../types';
import { getNextFridayISO } from './format';

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

interface LocalDb {
  nextIds: {
    users: number;
    products: number;
    orders: number;
    order_items: number;
    transactions: number;
    fixed_expenses: number;
  };
  users: StoredUser[];
  products: AdminProduct[];
  orders: StoredOrder[];
  order_items: Array<Omit<OrderItem, 'product_name'> & { cost_price_snapshot: number }>;
  transactions: Array<Omit<Transaction, 'user_name'>>;
  fixed_expenses: FixedExpense[];
  friday_inventory: StoredInventory[];
  settings: BusinessSettings;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function createInitialDb(): LocalDb {
  const upcomingFriday = getNextFridayISO();
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
  ];

  const users: StoredUser[] = [
    { id: 1, name: 'יגאל מנהל', phone: '050-5551000', email: 'admin@teimani.co.il', password: '123456', role: 'admin', balance: 0, notes: 'מנהל ראשי — המטבח התימני', created_at: today },
    { id: 2, name: 'מעדניית ראש העין', phone: '052-4442211', email: 'supplier@teimani.co.il', password: '123456', role: 'supplier', balance: -485, notes: 'ספק קבוע — משלוח בשישי ב-06:30', created_at: today },
    { id: 3, name: 'מינימרקט השכונה', phone: '054-8883322', email: 'market@teimani.co.il', password: '123456', role: 'supplier', balance: -210, notes: 'העברה בנקאית בתחילת שבוע', created_at: today },
    { id: 4, name: 'דנה כהן', phone: '053-7779911', email: 'customer@teimani.co.il', password: '123456', role: 'customer', balance: 0, notes: 'לקוחה קבועה — איסוף מהדוכן ב-10:00', created_at: today },
  ];

  const supTotal = 30 * 3.7 + 10 * 29 + 12 * 7; // 485
  const custTotal = 6 * 4 + 2 * 30 + 1 * 13 + 1 * 10; // 107

  return {
    nextIds: { users: 5, products: 16, orders: 4, order_items: 10, transactions: 4, fixed_expenses: 4 },
    users,
    products,
    orders: [
      { id: 1, user_id: 2, recipient_name: 'מעדניית ראש העין', friday_date: upcomingFriday, order_type: 'supplier', delivery_fee: 0, credit_discount: 0, total_amount: supTotal, paid_amount: 0, status: 'pending', notes: 'ארוז בארגזי חלוקה', created_at: today },
      { id: 2, user_id: 4, recipient_name: 'דנה כהן', friday_date: upcomingFriday, order_type: 'customer', delivery_fee: 0, credit_discount: 0, total_amount: custTotal, paid_amount: custTotal, status: 'ready', notes: 'שולם בביט מראש', created_at: today },
      { id: 3, user_id: null, recipient_name: 'חלוקת חסד לשבת — עמותת מאיר פנים', friday_date: upcomingFriday, order_type: 'charity', delivery_fee: 0, credit_discount: 0, total_amount: 0, paid_amount: 0, status: 'pending', notes: 'תרומה קבועה לשבת', created_at: today },
    ],
    order_items: [
      { id: 1, order_id: 1, product_id: 1, quantity: 30, unit_price_snapshot: 3.7, cost_price_snapshot: 2.5 },
      { id: 2, order_id: 1, product_id: 4, quantity: 10, unit_price_snapshot: 29, cost_price_snapshot: 20 },
      { id: 3, order_id: 1, product_id: 9, quantity: 12, unit_price_snapshot: 7, cost_price_snapshot: 5 },
      { id: 4, order_id: 2, product_id: 1, quantity: 6, unit_price_snapshot: 4, cost_price_snapshot: 2.5 },
      { id: 5, order_id: 2, product_id: 4, quantity: 2, unit_price_snapshot: 30, cost_price_snapshot: 20 },
      { id: 6, order_id: 2, product_id: 13, quantity: 1, unit_price_snapshot: 13, cost_price_snapshot: 8 },
      { id: 7, order_id: 2, product_id: 14, quantity: 1, unit_price_snapshot: 10, cost_price_snapshot: 5 },
      { id: 8, order_id: 3, product_id: 2, quantity: 15, unit_price_snapshot: 0, cost_price_snapshot: 2.5 },
      { id: 9, order_id: 3, product_id: 4, quantity: 3, unit_price_snapshot: 0, cost_price_snapshot: 20 },
    ],
    transactions: [
      { id: 1, date: today, friday_date: upcomingFriday, type: 'income', category: 'תשלום הזמנה מוקדמת', payment_method: 'bit', amount: custTotal, user_id: 4, notes: 'דנה כהן — הזמנה מוקדמת' },
      { id: 2, date: today, friday_date: upcomingFriday, type: 'income', category: 'סגירת חוב ספק', payment_method: 'transfer', amount: 650, user_id: 3, notes: 'תשלום משבוע שעבר' },
      { id: 3, date: today, friday_date: upcomingFriday, type: 'expense', category: 'חומרי גלם (קמח, שמן, תבלינים)', payment_method: 'transfer', amount: 1180, user_id: null, notes: 'רכישה שבועית לספק חומרי גלם' },
    ],
    fixed_expenses: [
      { id: 1, name: 'שכירות דוכן שוק שישי', amount: 450, frequency: 'weekly', payment_method: 'transfer', is_active: true },
      { id: 2, name: 'שכירות מטבח מאפייה', amount: 4200, frequency: 'monthly', payment_method: 'transfer', is_active: true },
      { id: 3, name: 'עוזר דוכן ליום שישי', amount: 500, frequency: 'weekly', payment_method: 'cash', is_active: true },
    ],
    friday_inventory: [
      { friday_date: upcomingFriday, product_id: 1, extra_stall_qty: 40 },
      { friday_date: upcomingFriday, product_id: 2, extra_stall_qty: 35 },
      { friday_date: upcomingFriday, product_id: 4, extra_stall_qty: 12 },
      { friday_date: upcomingFriday, product_id: 9, extra_stall_qty: 25 },
      { friday_date: upcomingFriday, product_id: 13, extra_stall_qty: 15 },
      { friday_date: upcomingFriday, product_id: 14, extra_stall_qty: 10 },
    ],
    settings: {
      business_name: 'המטבח התימני',
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

function loadDb(): LocalDb {
  if (memoryDbFallback) return memoryDbFallback;
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (raw) {
      memoryDbFallback = JSON.parse(raw) as LocalDb;
      return memoryDbFallback;
    }
  } catch {}
  const fresh = createInitialDb();
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
      business_name: String(body.business_name || 'המטבח התימני').trim(),
      default_delivery_fee: Math.max(0, Number(body.default_delivery_fee || 0)),
      whatsapp_footer: String(body.whatsapp_footer ?? '').trim(),
    };
    saveDb(db);
    return { settings: db.settings } as T;
  }

  // --- PRODUCTS ---
  if (path === '/api/products' && method === 'GET') {
    if (me.role === 'admin') return { products: db.products } as T;
    const active = db.products.filter((p) => p.is_active);
    if (me.role === 'supplier') {
      return {
        products: active.map((p) => ({ id: p.id, name: p.name, supplier_price: p.supplier_price, is_active: true })),
      } as T;
    }
    return {
      products: active.map((p) => ({
        id: p.id,
        name: p.name,
        preorder_price: p.preorder_price,
        customer_price: p.customer_price,
        is_active: true,
      })),
    } as T;
  }

  if (path === '/api/products' && method === 'POST') {
    requireAdmin();
    const prod: AdminProduct = {
      id: db.nextIds.products++,
      name: String(body.name || '').trim(),
      cost_price: Number(body.cost_price || 0),
      supplier_price: Number(body.supplier_price || 0),
      preorder_price: Number(body.preorder_price || 0),
      customer_price: Number(body.customer_price || 0),
      is_active: body.is_active !== undefined ? Boolean(body.is_active) : true,
    };
    db.products.push(prod);
    saveDb(db);
    return { product: prod } as T;
  }

  const prodMatch = path.match(/^\/api\/products\/(\d+)(\/toggle)?$/);
  if (prodMatch) {
    requireAdmin();
    const pid = Number(prodMatch[1]);
    const prod = db.products.find((p) => p.id === pid);
    if (!prod) throwErr('המוצר לא נמצא', 404);
    if (prodMatch[2] === '/toggle' && method === 'PATCH') {
      prod.is_active = !prod.is_active;
      saveDb(db);
      return { product: prod } as T;
    }
    if (method === 'PUT') {
      prod.name = body.name !== undefined ? String(body.name).trim() : prod.name;
      prod.cost_price = body.cost_price !== undefined ? Number(body.cost_price) : prod.cost_price;
      prod.supplier_price = body.supplier_price !== undefined ? Number(body.supplier_price) : prod.supplier_price;
      prod.preorder_price = body.preorder_price !== undefined ? Number(body.preorder_price) : prod.preorder_price;
      prod.customer_price = body.customer_price !== undefined ? Number(body.customer_price) : prod.customer_price;
      prod.is_active = body.is_active !== undefined ? Boolean(body.is_active) : prod.is_active;
      saveDb(db);
      return { product: prod } as T;
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
      recipient_name = String(body.recipient_name || (user_id ? userMap.get(user_id)?.name : '') || '').trim();
      if (!recipient_name) throwErr('יש להזין שם מקבל ההזמנה', 400);
      delivery_fee = order_type === 'charity' ? 0 : Math.max(0, Number(body.delivery_fee || 0));
      credit_discount = order_type === 'charity' ? 0 : Math.max(0, Number(body.credit_discount || 0));
      paid_amount = order_type === 'charity' ? 0 : Math.max(0, Number(body.paid_amount || 0));
      payment_method = body.payment_method === 'bit' || body.payment_method === 'transfer' ? body.payment_method : 'cash';
      tier =
        order_type === 'charity'
          ? 'charity'
          : order_type === 'supplier'
          ? 'supplier_price'
          : body.price_tier === 'customer_price'
          ? 'customer_price'
          : 'preorder_price';
    }

    let subtotal = 0;
    const orderId = db.nextIds.orders++;
    for (const it of validItems) {
      const p = prodMap.get(Number(it.product_id));
      if (!p) throwErr('מוצר לא נמצא', 400);
      const unitPrice = tier === 'charity' ? 0 : p[tier];
      subtotal += unitPrice * it.quantity;
      db.order_items.push({
        id: db.nextIds.order_items++,
        order_id: orderId,
        product_id: p.id,
        quantity: it.quantity,
        unit_price_snapshot: unitPrice,
        cost_price_snapshot: p.cost_price,
      });
    }

    const total_amount = order_type === 'charity' ? 0 : Math.max(0, round2(subtotal + delivery_fee - credit_discount));
    db.orders.push({
      id: orderId,
      user_id,
      recipient_name,
      friday_date,
      order_type,
      delivery_fee,
      credit_discount,
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

  const orderMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (orderMatch) {
    requireAdmin();
    const oid = Number(orderMatch[1]);
    const ord = db.orders.find((o) => o.id === oid);
    if (!ord) throwErr('ההזמנה לא נמצאה', 404);

    if (method === 'PATCH') {
      if (body.status) ord.status = body.status as OrderStatus;
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
            const pm: PaymentMethod =
              body.payment_method === 'bit' || body.payment_method === 'transfer' ? body.payment_method : 'cash';
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
      }
      if (Array.isArray(body.items)) {
        const tier =
          ord.order_type === 'charity'
            ? 'charity'
            : ord.order_type === 'supplier'
            ? 'supplier_price'
            : body.price_tier === 'customer_price'
            ? 'customer_price'
            : 'preorder_price';
        db.order_items = db.order_items.filter((i) => i.order_id !== oid);
        let sub = 0;
        for (const it of body.items as Array<{ product_id: number; quantity: number }>) {
          const p = prodMap.get(Number(it.product_id));
          if (!p || it.quantity <= 0) continue;
          const up = tier === 'charity' ? 0 : p[tier];
          sub += up * it.quantity;
          db.order_items.push({
            id: db.nextIds.order_items++,
            order_id: oid,
            product_id: p.id,
            quantity: it.quantity,
            unit_price_snapshot: up,
            cost_price_snapshot: p.cost_price,
          });
        }
        ord.total_amount = ord.order_type === 'charity' ? 0 : Math.max(0, round2(sub + ord.delivery_fee - ord.credit_discount));
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
      if (ord.user_id && ord.order_type !== 'charity') {
        const u = userMap.get(ord.user_id);
        if (u) u.balance = round2(u.balance + (ord.total_amount - ord.paid_amount));
      }
      db.orders = db.orders.filter((o) => o.id !== oid);
      db.order_items = db.order_items.filter((i) => i.order_id !== oid);
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
      if (body.notes !== undefined) u.notes = String(body.notes).trim();
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
        payment_method: body.payment_method === 'cash' || body.payment_method === 'bit' ? body.payment_method : 'transfer',
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
    const friOrders = db.orders.filter((o) => o.friday_date === fri);
    const orderTypeById = new Map(friOrders.map((o) => [o.id, o.order_type]));
    const items = db.products
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

  // --- FINANCE ---
  if (path.startsWith('/api/finance')) {
    requireAdmin();

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
      const bit = Math.max(0, Number(body.bit_amount || 0));
      if (cash <= 0 && bit <= 0) throwErr('יש להזין סכום במזומן או בביט', 400);
      const ids: number[] = [];
      if (cash > 0) {
        const id = db.nextIds.transactions++;
        db.transactions.push({ id, date, friday_date: fri, type: 'income', category: 'מכירות דוכן שישי (מזומן)', payment_method: 'cash', amount: round2(cash), user_id: null, notes: String(body.notes || `סיכום קופה מזומן — ${fri}`) });
        ids.push(id);
      }
      if (bit > 0) {
        const id = db.nextIds.transactions++;
        db.transactions.push({ id, date, friday_date: fri, type: 'income', category: 'מכירות דוכן שישי (ביט)', payment_method: 'bit', amount: round2(bit), user_id: null, notes: String(body.notes || `סיכום קופה ביט — ${fri}`) });
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
        payment_method: body.payment_method === 'bit' || body.payment_method === 'transfer' ? body.payment_method : 'cash',
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
        payment_method: body.payment_method === 'cash' || body.payment_method === 'bit' ? body.payment_method : 'transfer',
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
        fx.payment_method = body.payment_method === 'cash' || body.payment_method === 'bit' ? body.payment_method : 'transfer';
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
      const pOrders = db.orders.filter((o) => inRange(o.friday_date));
      const pOrderMap = new Map(pOrders.map((o) => [o.id, o]));
      const customer_orders_revenue = round2(pOrders.filter((o) => o.order_type === 'customer').reduce((s, o) => s + o.total_amount, 0));
      const supplier_orders_revenue = round2(pOrders.filter((o) => o.order_type === 'supplier').reduce((s, o) => s + o.total_amount, 0));

      let orders_cogs = 0;
      let charity_cogs = 0;
      let charity_units = 0;
      for (const oi of db.order_items) {
        const ord = pOrderMap.get(oi.order_id);
        if (!ord) continue;
        if (ord.order_type === 'charity') {
          charity_cogs += oi.quantity * oi.cost_price_snapshot;
          charity_units += oi.quantity;
        } else {
          orders_cogs += oi.quantity * oi.cost_price_snapshot;
        }
      }

      let extra_stall_cogs = 0;
      let extra_stall_units = 0;
      for (const fi of db.friday_inventory) {
        if (!inRange(fi.friday_date)) continue;
        const p = prodMap.get(fi.product_id);
        extra_stall_units += fi.extra_stall_qty;
        extra_stall_cogs += fi.extra_stall_qty * (p?.cost_price ?? 0);
      }

      const pTx = db.transactions.filter((t) => inRange(t.friday_date || t.date));
      let walkin_stall_cash = 0;
      let walkin_stall_bit = 0;
      let variable_expenses = 0;
      let posted_fixed_expenses = 0;
      const expMap = new Map<string, number>();
      const rec = { cash: { in: 0, out: 0, net: 0 }, bit: { in: 0, out: 0, net: 0 }, transfer: { in: 0, out: 0, net: 0 } };

      for (const t of pTx) {
        if (t.type === 'income') {
          rec[t.payment_method].in = round2(rec[t.payment_method].in + t.amount);
          if (t.category.includes('דוכן')) {
            if (t.payment_method === 'cash') walkin_stall_cash += t.amount;
            else if (t.payment_method === 'bit') walkin_stall_bit += t.amount;
          }
        } else {
          rec[t.payment_method].out = round2(rec[t.payment_method].out + t.amount);
          if (t.notes.includes('[הוצאה קבועה]')) posted_fixed_expenses += t.amount;
          else {
            variable_expenses += t.amount;
            expMap.set(t.category, round2((expMap.get(t.category) || 0) + t.amount));
          }
        }
      }
      rec.cash.net = round2(rec.cash.in - rec.cash.out);
      rec.bit.net = round2(rec.bit.in - rec.bit.out);
      rec.transfer.net = round2(rec.transfer.in - rec.transfer.out);

      const walkin_stall_revenue = round2(walkin_stall_cash + walkin_stall_bit);
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
      const total_cogs = round2(orders_cogs + extra_stall_cogs + charity_cogs);
      const gross_profit = round2(total_revenue - total_cogs);
      const gross_margin_pct = total_revenue > 0 ? round2((gross_profit / total_revenue) * 100) : 0;
      const net_profit = round2(gross_profit - variable_expenses - prorated_fixed_expenses);
      const net_margin_pct = total_revenue > 0 ? round2((net_profit / total_revenue) * 100) : 0;

      const openUsers = db.users.filter((u) => Math.abs(u.balance) > 0.009).sort((a, b) => a.balance - b.balance).map(sanitizeUser);
      return {
        period: { mode, label },
        pnl: {
          customer_orders_revenue,
          supplier_orders_revenue,
          walkin_stall_cash: round2(walkin_stall_cash),
          walkin_stall_bit: round2(walkin_stall_bit),
          walkin_stall_revenue,
          total_revenue,
          orders_cogs: round2(orders_cogs),
          extra_stall_cogs: round2(extra_stall_cogs),
          extra_stall_units,
          charity_cogs: round2(charity_cogs),
          charity_units,
          total_cogs,
          gross_profit,
          gross_margin_pct,
          variable_expenses: round2(variable_expenses),
          expense_breakdown: Array.from(expMap.entries()).map(([category, amount]) => ({ category, amount })),
          prorated_fixed_expenses,
          prorated_fixed_items,
          posted_fixed_expenses: round2(posted_fixed_expenses),
          net_profit,
          net_margin_pct,
        },
        reconciliation: {
          ...rec,
          digital_combined: {
            in: round2(rec.bit.in + rec.transfer.in),
            out: round2(rec.bit.out + rec.transfer.out),
            net: round2(rec.bit.net + rec.transfer.net),
          },
          total_in: round2(rec.cash.in + rec.bit.in + rec.transfer.in),
          total_out: round2(rec.cash.out + rec.bit.out + rec.transfer.out),
          total_net: round2(rec.cash.net + rec.bit.net + rec.transfer.net),
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
