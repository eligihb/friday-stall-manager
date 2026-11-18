import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  lastInsertId?: number;
}

export interface DbClient {
  isPostgres: boolean;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;
  run(sql: string, params?: unknown[]): Promise<{ lastInsertId?: number; changes: number }>;
  exec(sql: string): Promise<void>;
}

function convertPlaceholders(sql: string): string {
  let idx = 0;
  return sql.replace(/\?/g, () => `$${++idx}`);
}

let dbInstance: DbClient | null = null;

export async function getDb(): Promise<DbClient> {
  if (dbInstance) return dbInstance;

  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    });

    dbInstance = {
      isPostgres: true,
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
        const res = await pool.query(convertPlaceholders(sql), params);
        return res.rows as T[];
      },
      async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
        const res = await pool.query(convertPlaceholders(sql), params);
        return res.rows[0] as T | undefined;
      },
      async run(sql: string, params: unknown[] = []): Promise<{ lastInsertId?: number; changes: number }> {
        let finalSql = convertPlaceholders(sql);
        const isInsert = /^\s*INSERT\s+/i.test(finalSql);
        if (isInsert && !/RETURNING\s+/i.test(finalSql)) {
          finalSql += ' RETURNING id';
        }
        const res = await pool.query(finalSql, params);
        return {
          lastInsertId: isInsert && res.rows[0]?.id ? Number(res.rows[0].id) : undefined,
          changes: res.rowCount ?? 0,
        };
      },
      async exec(sql: string): Promise<void> {
        await pool.query(sql);
      },
    };
  } else {
    const { DatabaseSync } = await import('node:sqlite');
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = path.join(dataDir, 'hamitbach.db');
    const sqlite = new DatabaseSync(dbPath);
    sqlite.exec('PRAGMA foreign_keys = ON;');
    sqlite.exec('PRAGMA journal_mode = WAL;');

    dbInstance = {
      isPostgres: false,
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
        const stmt = sqlite.prepare(sql);
        const rows = stmt.all(...(params as (string | number | null | Uint8Array)[]));
        return rows.map((r) => ({ ...r })) as T[];
      },
      async get<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
        const stmt = sqlite.prepare(sql);
        const row = stmt.get(...(params as (string | number | null | Uint8Array)[]));
        return row ? ({ ...row } as T) : undefined;
      },
      async run(sql: string, params: unknown[] = []): Promise<{ lastInsertId?: number; changes: number }> {
        const stmt = sqlite.prepare(sql);
        const info = stmt.run(...(params as (string | number | null | Uint8Array)[]));
        return {
          lastInsertId: info.lastInsertRowid !== undefined ? Number(info.lastInsertRowid) : undefined,
          changes: Number(info.changes ?? 0),
        };
      },
      async exec(sql: string): Promise<void> {
        sqlite.exec(sql);
      },
    };
  }

  await initializeSchemaAndSeed(dbInstance);
  return dbInstance;
}

export const INITIAL_PRODUCTS: Array<{
  name: string;
  cost_price: number;
  supplier_price: number;
  preorder_price: number;
  customer_price: number;
}> = [
  { name: 'לחוח', cost_price: 2.5, supplier_price: 3.7, preorder_price: 4.0, customer_price: 5.0 },
  { name: 'סאלוף', cost_price: 2.5, supplier_price: 3.7, preorder_price: 4.0, customer_price: 5.0 },
  { name: 'לאפה', cost_price: 2.5, supplier_price: 3.5, preorder_price: 4.0, customer_price: 5.0 },
  { name: 'קובנה', cost_price: 20.0, supplier_price: 29.0, preorder_price: 30.0, customer_price: 35.0 },
  { name: 'כובנית', cost_price: 18.0, supplier_price: 28.0, preorder_price: 30.0, customer_price: 30.0 },
  { name: 'זלביה', cost_price: 7.0, supplier_price: 9.5, preorder_price: 10.0, customer_price: 12.0 },
  { name: 'פיתה זעתר', cost_price: 2.2, supplier_price: 3.33, preorder_price: 3.5, customer_price: 5.0 },
  { name: "פיתה פלאפל 10 יח'", cost_price: 10.0, supplier_price: 14.0, preorder_price: 16.0, customer_price: 18.0 },
  { name: "ג'חנון", cost_price: 5.0, supplier_price: 7.0, preorder_price: 8.0, customer_price: 9.0 },
  { name: 'פרנה', cost_price: 2.3, supplier_price: 3.5, preorder_price: 4.0, customer_price: 5.0 },
  { name: 'פרנה גדולה', cost_price: 5.0, supplier_price: 9.0, preorder_price: 10.0, customer_price: 12.0 },
  { name: 'פרנה שום', cost_price: 3.0, supplier_price: 5.0, preorder_price: 6.0, customer_price: 7.0 },
  { name: 'סחוג', cost_price: 8.0, supplier_price: 11.5, preorder_price: 13.0, customer_price: 15.0 },
  { name: "חילבה 250 ג'", cost_price: 5.0, supplier_price: 8.0, preorder_price: 10.0, customer_price: 12.0 },
  { name: "חילבה 500 ג'", cost_price: 8.0, supplier_price: 14.0, preorder_price: 16.0, customer_price: 20.0 },
];

export function getNextFridayDate(baseDate = new Date()): string {
  const d = new Date(baseDate);
  const day = d.getDay(); // 0 Sun .. 5 Fri .. 6 Sat
  const diff = (5 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function initializeSchemaAndSeed(db: DbClient): Promise<void> {
  if (db.isPostgres) {
    const schemaPath = path.resolve(process.cwd(), 'supabase', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await db.exec(sql);
  } else {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT DEFAULT '',
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'supplier', 'customer')) DEFAULT 'customer',
        balance REAL NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        cost_price REAL NOT NULL DEFAULT 0,
        supplier_price REAL NOT NULL DEFAULT 0,
        preorder_price REAL NOT NULL DEFAULT 0,
        customer_price REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        recipient_name TEXT NOT NULL,
        friday_date TEXT NOT NULL,
        order_type TEXT NOT NULL CHECK (order_type IN ('customer', 'supplier', 'charity')),
        delivery_fee REAL NOT NULL DEFAULT 0,
        credit_discount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        paid_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'delivered')) DEFAULT 'pending',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price_snapshot REAL NOT NULL,
        cost_price_snapshot REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL DEFAULT (date('now')),
        friday_date TEXT,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
        category TEXT NOT NULL,
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bit', 'transfer')),
        amount REAL NOT NULL CHECK (amount >= 0),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount >= 0),
        frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bit', 'transfer')),
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS friday_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friday_date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        extra_stall_qty INTEGER NOT NULL DEFAULT 0,
        UNIQUE (friday_date, product_id)
      );

      CREATE TABLE IF NOT EXISTS business_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        business_name TEXT NOT NULL DEFAULT 'המטבח התימני',
        default_delivery_fee REAL NOT NULL DEFAULT 0,
        whatsapp_footer TEXT NOT NULL DEFAULT 'שבת שלום ומבורכת! 🕯️'
      );

      INSERT OR IGNORE INTO business_settings (id, business_name, default_delivery_fee, whatsapp_footer)
      VALUES (1, 'המטבח התימני', 0, 'שבת שלום ומבורכת! 🕯️');

      CREATE INDEX IF NOT EXISTS idx_orders_friday_date ON orders(friday_date);
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_friday_date ON transactions(friday_date);
      CREATE INDEX IF NOT EXISTS idx_friday_inventory_date ON friday_inventory(friday_date);
    `);
  }

  // Seed products if table is empty
  const existingProducts = await db.query<{ count: number | string }>('SELECT COUNT(*) as count FROM products');
  if (Number(existingProducts[0]?.count ?? 0) === 0) {
    for (const p of INITIAL_PRODUCTS) {
      await db.run(
        `INSERT INTO products (name, cost_price, supplier_price, preorder_price, customer_price, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [p.name, p.cost_price, p.supplier_price, p.preorder_price, p.customer_price, db.isPostgres ? true : 1]
      );
    }
  }

  // Seed default demo users & sample operational data if users table is empty
  const existingUsers = await db.query<{ count: number | string }>('SELECT COUNT(*) as count FROM users');
  if (Number(existingUsers[0]?.count ?? 0) === 0) {
    const adminHash = bcrypt.hashSync('123456', 10);
    const supplierHash = bcrypt.hashSync('123456', 10);
    const customerHash = bcrypt.hashSync('123456', 10);

    await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['יגאל מנהל', '050-5551000', 'admin@teimani.co.il', adminHash, 'admin', 0, 'מנהל ראשי — המטבח התימני']
    );

    const sup1 = await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['מעדניית ראש העין', '052-4442211', 'supplier@teimani.co.il', supplierHash, 'supplier', -485.0, 'ספק קבוע — משלוח בשישי ב-06:30']
    );

    const sup2 = await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['מינימרקט השכונה', '054-8883322', 'market@teimani.co.il', supplierHash, 'supplier', -210.0, 'העברה בנקאית בתחילת שבוע']
    );

    const cust1 = await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['דנה כהן', '053-7779911', 'customer@teimani.co.il', customerHash, 'customer', 0, 'לקוחה קבועה — איסוף מהדוכן ב-10:00']
    );

    // Seed sample Friday orders, fixed expenses, transactions, and stall inventory
    const upcomingFriday = getNextFridayDate();
    const products = await db.query<{
      id: number;
      name: string;
      cost_price: number;
      supplier_price: number;
      preorder_price: number;
      customer_price: number;
    }>('SELECT * FROM products ORDER BY id ASC');

    const byName = new Map(products.map((p) => [p.name, p]));
    const lachuch = byName.get('לחוח');
    const kubana = byName.get('קובנה');
    const jachnun = byName.get("ג'חנון");
    const schug = byName.get('סחוג');
    const saluf = byName.get('סאלוף');
    const hilbe250 = byName.get("חילבה 250 ג'");

    if (lachuch && kubana && jachnun && schug && saluf && hilbe250) {
      // Sample Supplier Order
      const supTotal = 30 * Number(lachuch.supplier_price) + 10 * Number(kubana.supplier_price) + 12 * Number(jachnun.supplier_price);
      const ord1 = await db.run(
        `INSERT INTO orders (user_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, total_amount, paid_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sup1.lastInsertId, 'מעדניית ראש העין', upcomingFriday, 'supplier', 0, 0, supTotal, 0, 'pending', 'ארוז בארגזי חלוקה']
      );
      if (ord1.lastInsertId) {
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord1.lastInsertId, lachuch.id, 30, lachuch.supplier_price, lachuch.cost_price]
        );
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord1.lastInsertId, kubana.id, 10, kubana.supplier_price, kubana.cost_price]
        );
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord1.lastInsertId, jachnun.id, 12, jachnun.supplier_price, jachnun.cost_price]
        );
      }

      // Sample Customer Preorder
      const custTotal = 6 * Number(lachuch.preorder_price) + 2 * Number(kubana.preorder_price) + 1 * Number(schug.preorder_price) + 1 * Number(hilbe250.preorder_price);
      const ord2 = await db.run(
        `INSERT INTO orders (user_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, total_amount, paid_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cust1.lastInsertId, 'דנה כהן', upcomingFriday, 'customer', 0, 0, custTotal, custTotal, 'ready', 'שולם בביט מראש']
      );
      if (ord2.lastInsertId) {
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord2.lastInsertId, lachuch.id, 6, lachuch.preorder_price, lachuch.cost_price]
        );
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord2.lastInsertId, kubana.id, 2, kubana.preorder_price, kubana.cost_price]
        );
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord2.lastInsertId, schug.id, 1, schug.preorder_price, schug.cost_price]
        );
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord2.lastInsertId, hilbe250.id, 1, hilbe250.preorder_price, hilbe250.cost_price]
        );
      }

      // Sample Charity Order
      const ord3 = await db.run(
        `INSERT INTO orders (user_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, total_amount, paid_amount, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [null, 'חלוקת חסד לשבת — עמותת מאיר פנים', upcomingFriday, 'charity', 0, 0, 0, 0, 'pending', 'תרומה קבועה לשבת']
      );
      if (ord3.lastInsertId) {
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord3.lastInsertId, saluf.id, 15, 0, saluf.cost_price]
        );
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot) VALUES (?, ?, ?, ?, ?)`,
          [ord3.lastInsertId, kubana.id, 3, 0, kubana.cost_price]
        );
      }

      // Sample Friday stall extra inventory
      const stallDefaults = [
        [lachuch.id, 40],
        [saluf.id, 35],
        [kubana.id, 12],
        [jachnun.id, 25],
        [schug.id, 15],
        [hilbe250.id, 10],
      ];
      for (const [prodId, qty] of stallDefaults) {
        await db.run(
          `INSERT INTO friday_inventory (friday_date, product_id, extra_stall_qty) VALUES (?, ?, ?)`,
          [upcomingFriday, prodId, qty]
        );
      }

      // Sample Fixed Expenses
      await db.run(
        `INSERT INTO fixed_expenses (name, amount, frequency, payment_method, is_active) VALUES (?, ?, ?, ?, ?)`,
        ['שכירות דוכן שוק שישי', 450, 'weekly', 'transfer', db.isPostgres ? true : 1]
      );
      await db.run(
        `INSERT INTO fixed_expenses (name, amount, frequency, payment_method, is_active) VALUES (?, ?, ?, ?, ?)`,
        ['שכירות מטבח מאפייה', 4200, 'monthly', 'transfer', db.isPostgres ? true : 1]
      );
      await db.run(
        `INSERT INTO fixed_expenses (name, amount, frequency, payment_method, is_active) VALUES (?, ?, ?, ?, ?)`,
        ['עוזר דוכן ליום שישי', 500, 'weekly', 'cash', db.isPostgres ? true : 1]
      );

      // Sample Transactions
      const todayStr = new Date().toISOString().slice(0, 10);
      await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [todayStr, upcomingFriday, 'income', 'תשלום הזמנה מוקדמת', 'bit', custTotal, cust1.lastInsertId, 'דנה כהן — הזמנה מוקדמת']
      );
      await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [todayStr, upcomingFriday, 'income', 'סגירת חוב ספק', 'transfer', 650, sup2.lastInsertId, 'תשלום משבוע שעבר']
      );
      await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [todayStr, upcomingFriday, 'expense', 'חומרי גלם (קמח, שמן, תבלינים)', 'transfer', 1180, null, 'רכישה שבועית לספק חומרי גלם']
      );
    }
  }
}
