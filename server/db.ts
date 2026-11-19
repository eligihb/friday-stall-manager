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
  // מארזי שלישייה (3 יח׳ ב-12 ₪)
  { name: 'מארז זלביה', cost_price: 7.0, supplier_price: 9.5, preorder_price: 12.0, customer_price: 12.0 },
  { name: 'מארז לחם שום', cost_price: 6.5, supplier_price: 9.5, preorder_price: 12.0, customer_price: 12.0 },
  { name: 'מארז פיתה זעתר', cost_price: 6.6, supplier_price: 9.99, preorder_price: 12.0, customer_price: 12.0 },
  { name: 'מארז פיתה שומשום', cost_price: 6.6, supplier_price: 9.99, preorder_price: 12.0, customer_price: 12.0 },
];

export const TRIO_PACK_PRODUCTS = INITIAL_PRODUCTS.filter((p) => p.name.startsWith('מארז '));

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
    await db.exec(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS waste_type TEXT NOT NULL DEFAULT 'full';
      ALTER TABLE waste_logs ADD COLUMN IF NOT EXISTS waste_percent NUMERIC(5,2) NOT NULL DEFAULT 100;
    `);
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
        discount_percent REAL NOT NULL DEFAULT 0,
        custom_prices_json TEXT NOT NULL DEFAULT '{}',
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
        image_url TEXT DEFAULT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        waste_type TEXT NOT NULL DEFAULT 'full',
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS product_price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        effective_date TEXT NOT NULL,
        cost_price REAL NOT NULL DEFAULT 0,
        supplier_price REAL NOT NULL DEFAULT 0,
        preorder_price REAL NOT NULL DEFAULT 0,
        customer_price REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (product_id, effective_date)
      );

      CREATE TABLE IF NOT EXISTS subsidized_entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        phone TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS subsidized_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id INTEGER NOT NULL REFERENCES subsidized_entities(id) ON DELETE CASCADE,
        date TEXT NOT NULL DEFAULT (date('now')),
        amount REAL NOT NULL CHECK (amount > 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')) DEFAULT 'cash',
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        subsidized_entity_id INTEGER REFERENCES subsidized_entities(id) ON DELETE SET NULL,
        recipient_name TEXT NOT NULL,
        friday_date TEXT NOT NULL,
        order_type TEXT NOT NULL CHECK (order_type IN ('customer', 'supplier', 'charity')),
        delivery_fee REAL NOT NULL DEFAULT 0,
        credit_discount REAL NOT NULL DEFAULT 0,
        discount_percent REAL NOT NULL DEFAULT 0,
        include_vat INTEGER NOT NULL DEFAULT 0,
        vat_amount REAL NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        paid_amount REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL CHECK (status IN ('awaiting_approval', 'pending', 'received', 'ready', 'delivered')) DEFAULT 'pending',
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
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')),
        amount REAL NOT NULL CHECK (amount >= 0),
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        notes TEXT DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS fixed_expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        amount REAL NOT NULL CHECK (amount >= 0),
        frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')),
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS friday_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friday_date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        extra_stall_qty INTEGER NOT NULL DEFAULT 0,
        UNIQUE (friday_date, product_id)
      );

      CREATE TABLE IF NOT EXISTS waste_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        friday_date TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity >= 0),
        unit_cost REAL NOT NULL DEFAULT 0,
        waste_percent REAL NOT NULL DEFAULT 100,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (friday_date, product_id)
      );

      CREATE TABLE IF NOT EXISTS business_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        business_name TEXT NOT NULL DEFAULT 'דוכן שישי תימני',
        admin_whatsapp_phone TEXT NOT NULL DEFAULT '050-5551000',
        default_delivery_fee REAL NOT NULL DEFAULT 0,
        whatsapp_footer TEXT NOT NULL DEFAULT 'שבת שלום ומבורכת! 🕯️'
      );

      CREATE INDEX IF NOT EXISTS idx_orders_friday_date ON orders(friday_date);
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_friday_date ON transactions(friday_date);
      CREATE INDEX IF NOT EXISTS idx_friday_inventory_date ON friday_inventory(friday_date);
      CREATE INDEX IF NOT EXISTS idx_waste_logs_friday_date ON waste_logs(friday_date);
      CREATE INDEX IF NOT EXISTS idx_subsidized_payments_entity ON subsidized_payments(entity_id);
    `);

    // מיגרציה בטוחה לטבלאות קיימות ב-SQLite (הוספת awaiting_approval ו-admin_whatsapp_phone)
    const ordDef = await db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'"
    );
    if (ordDef?.sql && !ordDef.sql.includes('awaiting_approval')) {
      await db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE orders_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          recipient_name TEXT NOT NULL,
          friday_date TEXT NOT NULL,
          order_type TEXT NOT NULL CHECK (order_type IN ('customer', 'supplier', 'charity')),
          delivery_fee REAL NOT NULL DEFAULT 0,
          credit_discount REAL NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL DEFAULT 0,
          paid_amount REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('awaiting_approval', 'pending', 'received', 'ready', 'delivered')) DEFAULT 'pending',
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO orders_new SELECT * FROM orders;
        DROP TABLE orders;
        ALTER TABLE orders_new RENAME TO orders;
        CREATE INDEX IF NOT EXISTS idx_orders_friday_date ON orders(friday_date);
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        PRAGMA foreign_keys = ON;
      `);
    }

    const setCols = await db.query<{ name: string }>('PRAGMA table_info(business_settings)');
    if (!setCols.some((c) => c.name === 'admin_whatsapp_phone')) {
      await db.exec(
        "ALTER TABLE business_settings ADD COLUMN admin_whatsapp_phone TEXT NOT NULL DEFAULT '050-5551000';"
      );
    }
    await db.run(
      `INSERT OR IGNORE INTO business_settings (id, business_name, admin_whatsapp_phone, default_delivery_fee, whatsapp_footer)
       VALUES (1, 'דוכן שישי תימני', '050-5551000', 0, 'שבת שלום ומבורכת! 🕯️')`
    );
    await db.run(
      "UPDATE business_settings SET business_name = 'דוכן שישי תימני' WHERE id = 1 AND business_name = 'המטבח התימני'"
    );

    // מיגרציות עמודות v1.6.0–v1.9.0 (image_url, sort_order, הנחה/תמחור מותאם, מע״מ, סטטוס 'received')
    const prodCols = await db.query<{ name: string }>('PRAGMA table_info(products)');
    if (!prodCols.some((c) => c.name === 'image_url')) {
      await db.exec('ALTER TABLE products ADD COLUMN image_url TEXT DEFAULT NULL;');
    }
    if (!prodCols.some((c) => c.name === 'sort_order')) {
      await db.exec('ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;');
      await db.exec('UPDATE products SET sort_order = id WHERE sort_order = 0;');
    }
    if (!prodCols.some((c) => c.name === 'waste_type')) {
      await db.exec("ALTER TABLE products ADD COLUMN waste_type TEXT NOT NULL DEFAULT 'full';");
    }

    const wasteCols = await db.query<{ name: string }>('PRAGMA table_info(waste_logs)');
    if (!wasteCols.some((c) => c.name === 'waste_percent')) {
      await db.exec('ALTER TABLE waste_logs ADD COLUMN waste_percent REAL NOT NULL DEFAULT 100;');
    }

    const userCols = await db.query<{ name: string }>('PRAGMA table_info(users)');
    if (!userCols.some((c) => c.name === 'discount_percent')) {
      await db.exec('ALTER TABLE users ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;');
    }
    if (!userCols.some((c) => c.name === 'custom_prices_json')) {
      await db.exec("ALTER TABLE users ADD COLUMN custom_prices_json TEXT NOT NULL DEFAULT '{}';");
    }

    const ordCols = await db.query<{ name: string }>('PRAGMA table_info(orders)');
    if (!ordCols.some((c) => c.name === 'discount_percent')) {
      await db.exec('ALTER TABLE orders ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0;');
    }
    if (!ordCols.some((c) => c.name === 'include_vat')) {
      await db.exec('ALTER TABLE orders ADD COLUMN include_vat INTEGER NOT NULL DEFAULT 0;');
    }
    if (!ordCols.some((c) => c.name === 'vat_amount')) {
      await db.exec('ALTER TABLE orders ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0;');
    }
    if (!ordCols.some((c) => c.name === 'subsidized_entity_id')) {
      await db.exec('ALTER TABLE orders ADD COLUMN subsidized_entity_id INTEGER DEFAULT NULL;');
    }
    await db.exec('CREATE INDEX IF NOT EXISTS idx_orders_subsidized_entity ON orders(subsidized_entity_id);');

    // מיגרציית v1.7.0: החלפת 'bit' ב-'paybox' בטבלאות transactions ו-fixed_expenses
    const txDef = await db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'"
    );
    if (txDef?.sql && txDef.sql.includes("'bit'")) {
      await db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE transactions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL DEFAULT (date('now')),
          friday_date TEXT,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          category TEXT NOT NULL,
          payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')),
          amount REAL NOT NULL CHECK (amount >= 0),
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          notes TEXT DEFAULT ''
        );
        INSERT INTO transactions_new (id, date, friday_date, type, category, payment_method, amount, user_id, notes)
        SELECT id, date, friday_date, type,
               REPLACE(category, 'ביט', 'פייבוקס'),
               CASE WHEN payment_method = 'bit' THEN 'paybox' ELSE payment_method END,
               amount, user_id,
               REPLACE(COALESCE(notes, ''), 'ביט', 'פייבוקס')
        FROM transactions;
        DROP TABLE transactions;
        ALTER TABLE transactions_new RENAME TO transactions;
        CREATE INDEX IF NOT EXISTS idx_transactions_friday_date ON transactions(friday_date);
        PRAGMA foreign_keys = ON;
      `);
    }

    const fixDef = await db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'fixed_expenses'"
    );
    if (fixDef?.sql && fixDef.sql.includes("'bit'")) {
      await db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE fixed_expenses_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          amount REAL NOT NULL CHECK (amount >= 0),
          frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
          payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')),
          is_active INTEGER NOT NULL DEFAULT 1
        );
        INSERT INTO fixed_expenses_new (id, name, amount, frequency, payment_method, is_active)
        SELECT id, name, amount, frequency,
               CASE WHEN payment_method = 'bit' THEN 'paybox' ELSE payment_method END,
               is_active
        FROM fixed_expenses;
        DROP TABLE fixed_expenses;
        ALTER TABLE fixed_expenses_new RENAME TO fixed_expenses;
        PRAGMA foreign_keys = ON;
      `);
    }

    // מיגרציית v1.9.0: הוספת סטטוס 'received' ("התקבל") לטבלת orders ב-SQLite
    const ordDefV19 = await db.get<{ sql: string }>(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'orders'"
    );
    if (ordDefV19?.sql && !ordDefV19.sql.includes("'received'")) {
      await db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE orders_v19 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          subsidized_entity_id INTEGER REFERENCES subsidized_entities(id) ON DELETE SET NULL,
          recipient_name TEXT NOT NULL,
          friday_date TEXT NOT NULL,
          order_type TEXT NOT NULL CHECK (order_type IN ('customer', 'supplier', 'charity')),
          delivery_fee REAL NOT NULL DEFAULT 0,
          credit_discount REAL NOT NULL DEFAULT 0,
          discount_percent REAL NOT NULL DEFAULT 0,
          include_vat INTEGER NOT NULL DEFAULT 0,
          vat_amount REAL NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL DEFAULT 0,
          paid_amount REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('awaiting_approval', 'pending', 'received', 'ready', 'delivered')) DEFAULT 'pending',
          notes TEXT DEFAULT '',
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO orders_v19 (id, user_id, subsidized_entity_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, discount_percent, include_vat, vat_amount, total_amount, paid_amount, status, notes, created_at)
        SELECT id, user_id, subsidized_entity_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, discount_percent, include_vat, vat_amount, total_amount, paid_amount, status, notes, created_at
        FROM orders;
        DROP TABLE orders;
        ALTER TABLE orders_v19 RENAME TO orders;
        CREATE INDEX IF NOT EXISTS idx_orders_friday_date ON orders(friday_date);
        CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
        CREATE INDEX IF NOT EXISTS idx_orders_subsidized_entity ON orders(subsidized_entity_id);
        PRAGMA foreign_keys = ON;
      `);
    }

    // עדכון טקסטים היסטוריים של 'ביט' בהערות הזמנות לדוגמה
    await db.run("UPDATE orders SET notes = REPLACE(notes, 'בביט', 'בפייבוקס') WHERE notes LIKE '%בביט%'");
  }

  // זריעת 3 הגופים המוגדרים מראש להזמנות מסובסדות ("הכולל", "משפחה 1", "משפחה 2")
  const existingEntities = await db.query<{ count: number | string }>(
    'SELECT COUNT(*) as count FROM subsidized_entities'
  );
  if (Number(existingEntities[0]?.count ?? 0) === 0) {
    const defaultEntities = [
      { name: 'הכולל', phone: '', notes: 'חלוקה שבועית קבועה ותשלום חודשי במזומן' },
      { name: 'משפחה 1', phone: '', notes: 'חבילת שישי מסובסדת' },
      { name: 'משפחה 2', phone: '', notes: 'חבילת שישי מסובסדת' },
    ];
    for (const ent of defaultEntities) {
      await db.run(
        `INSERT INTO subsidized_entities (name, phone, notes, is_active) VALUES (?, ?, ?, ?)`,
        [ent.name, ent.phone, ent.notes, db.isPostgres ? true : 1]
      );
    }
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
  } else {
    // ודא שכל 4 מארזי השלישייה (12 ₪) קיימים גם במסדי נתונים קיימים
    for (const tp of TRIO_PACK_PRODUCTS) {
      const exists = await db.get<{ id: number }>('SELECT id FROM products WHERE name = ?', [tp.name]);
      if (!exists) {
        await db.run(
          `INSERT INTO products (name, cost_price, supplier_price, preorder_price, customer_price, is_active)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [tp.name, tp.cost_price, tp.supplier_price, tp.preorder_price, tp.customer_price, db.isPostgres ? true : 1]
        );
      }
    }
  }

  // ודא שלכל מוצר קיימת רשומת היסטוריית מחיר בסיסית ('2020-01-01')
  const allProds = await db.query<{
    id: number;
    cost_price: number;
    supplier_price: number;
    preorder_price: number;
    customer_price: number;
  }>('SELECT id, cost_price, supplier_price, preorder_price, customer_price FROM products');
  for (const p of allProds) {
    const hasHist = await db.get<{ id: number }>(
      'SELECT id FROM product_price_history WHERE product_id = ? LIMIT 1',
      [p.id]
    );
    if (!hasHist) {
      await db.run(
        `INSERT INTO product_price_history (product_id, effective_date, cost_price, supplier_price, preorder_price, customer_price)
         VALUES (?, '2020-01-01', ?, ?, ?, ?)`,
        [p.id, p.cost_price, p.supplier_price, p.preorder_price, p.customer_price]
      );
    }
  }

  // זריעת חשבונות בסיס בלבד (מנהל + ספקים, ללא נתוני דמו של הזמנות/לקוחות/תנועות)
  const existingUsers = await db.query<{ count: number | string }>('SELECT COUNT(*) as count FROM users');
  if (Number(existingUsers[0]?.count ?? 0) === 0) {
    const adminHash = bcrypt.hashSync('123456', 10);
    const supplierHash = bcrypt.hashSync('123456', 10);

    await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['יגאל מנהל', '050-5551000', 'admin@teimani.co.il', adminHash, 'admin', 0, 'מנהל ראשי — דוכן שישי תימני']
    );

    await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['מעדניית ראש העין', '052-4442211', 'supplier@teimani.co.il', supplierHash, 'supplier', 0, 'ספק קבוע — משלוח בשישי ב-06:30']
    );

    await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['מינימרקט השכונה', '054-8883322', 'market@teimani.co.il', supplierHash, 'supplier', 0, 'העברה בנקאית בתחילת שבוע']
    );
  }

  // מיגרציה חד-פעמית v1.9.1: ניקוי מלא של נתוני דמו (הזמנות, לקוחות דמו, תנועות, מלאי ופחת)
  // תוך שמירה מלאה על קטלוג המוצרים, היסטוריית המחירים, חשבון המנהל וחשבונות הספקים
  await db.exec(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      key TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const purgeDone = await db.get<{ key: string }>(
    "SELECT key FROM app_migrations WHERE key = 'purge_demo_v191'"
  );
  if (!purgeDone) {
    await db.run('DELETE FROM order_items');
    await db.run('DELETE FROM orders');
    await db.run('DELETE FROM transactions');
    await db.run('DELETE FROM friday_inventory');
    await db.run('DELETE FROM waste_logs');
    await db.run('DELETE FROM subsidized_payments');
    await db.run('DELETE FROM fixed_expenses');
    await db.run("DELETE FROM users WHERE role = 'customer'");
    await db.run('UPDATE users SET balance = 0');
    await db.run(
      "UPDATE users SET notes = REPLACE(notes, 'המטבח התימני', 'דוכן שישי תימני') WHERE notes LIKE '%המטבח התימני%'"
    );
    await db.run(
      'INSERT INTO app_migrations (key, applied_at) VALUES (?, ?)',
      ['purge_demo_v191', new Date().toISOString()]
    );
  }
}
