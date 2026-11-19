-- דוכן שישי תימני - סכמת PostgreSQL / Supabase מלאה עם RBAC ו-RLS (v1.7.0)

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'supplier', 'customer')) DEFAULT 'customer',
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  custom_prices_json TEXT NOT NULL DEFAULT '{}',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  supplier_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  preorder_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  customer_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  image_url TEXT DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS product_price_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  supplier_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  preorder_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  customer_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, effective_date)
);

CREATE TABLE IF NOT EXISTS subsidized_entities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subsidized_payments (
  id SERIAL PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES subsidized_entities(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')) DEFAULT 'cash',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subsidized_entity_id INTEGER REFERENCES subsidized_entities(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  friday_date DATE NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('customer', 'supplier', 'charity')),
  delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  credit_discount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  include_vat BOOLEAN NOT NULL DEFAULT FALSE,
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('awaiting_approval', 'pending', 'received', 'ready', 'delivered')) DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_snapshot NUMERIC(10, 2) NOT NULL,
  cost_price_snapshot NUMERIC(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  friday_date DATE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fixed_expenses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'paybox', 'transfer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS friday_inventory (
  id SERIAL PRIMARY KEY,
  friday_date DATE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  extra_stall_qty INTEGER NOT NULL DEFAULT 0,
  UNIQUE (friday_date, product_id)
);

CREATE TABLE IF NOT EXISTS waste_logs (
  id SERIAL PRIMARY KEY,
  friday_date DATE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  unit_cost NUMERIC(10, 2) NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (friday_date, product_id)
);

CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  business_name TEXT NOT NULL DEFAULT 'דוכן שישי תימני',
  admin_whatsapp_phone TEXT NOT NULL DEFAULT '050-5551000',
  default_delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0,
  whatsapp_footer TEXT NOT NULL DEFAULT 'שבת שלום ומבורכת! 🕯️'
);

INSERT INTO business_settings (id, business_name, admin_whatsapp_phone, default_delivery_fee, whatsapp_footer)
VALUES (1, 'דוכן שישי תימני', '050-5551000', 0, 'שבת שלום ומבורכת! 🕯️')
ON CONFLICT (id) DO NOTHING;

-- זריעת גופים ברירת מחדל להזמנות מסובסדות
INSERT INTO subsidized_entities (name, phone, notes, is_active) VALUES
  ('הכולל', '', 'חלוקה שבועית קבועה ותשלום חודשי במזומן', TRUE),
  ('משפחה 1', '', 'משלוח שישי קבוע', TRUE),
  ('משפחה 2', '', 'משלוח שישי קבוע', TRUE)
ON CONFLICT (name) DO NOTHING;

-- אינדקסים לביצועים מהירים
CREATE INDEX IF NOT EXISTS idx_orders_friday_date ON orders(friday_date);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_subsidized_entity ON orders(subsidized_entity_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_friday_date ON transactions(friday_date);
CREATE INDEX IF NOT EXISTS idx_friday_inventory_date ON friday_inventory(friday_date);
CREATE INDEX IF NOT EXISTS idx_waste_logs_friday_date ON waste_logs(friday_date);
CREATE INDEX IF NOT EXISTS idx_subsidized_payments_entity ON subsidized_payments(entity_id);

-- זריעת מחירון המוצרים ההתחלתי (19 מוצרים כולל מארזי שלישייה ב-12 ₪)
INSERT INTO products (name, cost_price, supplier_price, preorder_price, customer_price, is_active) VALUES
  ('לחוח', 2.50, 3.70, 4.00, 5.00, TRUE),
  ('סאלוף', 2.50, 3.70, 4.00, 5.00, TRUE),
  ('לאפה', 2.50, 3.50, 4.00, 5.00, TRUE),
  ('קובנה', 20.00, 29.00, 30.00, 35.00, TRUE),
  ('כובנית', 18.00, 28.00, 30.00, 30.00, TRUE),
  ('זלביה', 7.00, 9.50, 10.00, 12.00, TRUE),
  ('פיתה זעתר', 2.20, 3.33, 3.50, 5.00, TRUE),
  ('פיתה פלאפל 10 יח''', 10.00, 14.00, 16.00, 18.00, TRUE),
  ('ג''חנון', 5.00, 7.00, 8.00, 9.00, TRUE),
  ('פרנה', 2.30, 3.50, 4.00, 5.00, TRUE),
  ('פרנה גדולה', 5.00, 9.00, 10.00, 12.00, TRUE),
  ('פרנה שום', 3.00, 5.00, 6.00, 7.00, TRUE),
  ('סחוג', 8.00, 11.50, 13.00, 15.00, TRUE),
  ('חילבה 250 ג''', 5.00, 8.00, 10.00, 12.00, TRUE),
  ('חילבה 500 ג''', 8.00, 14.00, 16.00, 20.00, TRUE),
  ('מארז זלביה', 7.00, 9.50, 12.00, 12.00, TRUE),
  ('מארז לחם שום', 6.50, 9.50, 12.00, 12.00, TRUE),
  ('מארז פיתה זעתר', 6.60, 9.99, 12.00, 12.00, TRUE),
  ('מארז פיתה שומשום', 6.60, 9.99, 12.00, 12.00, TRUE)
ON CONFLICT (name) DO NOTHING;

-- הפעלת Row-Level Security (RLS) לסביבת Supabase
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE friday_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidized_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsidized_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'products_read_active') THEN
      EXECUTE 'CREATE POLICY "products_read_active" ON products FOR SELECT USING (is_active = TRUE OR (auth.jwt() ->> ''role'') = ''admin'')';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'orders_own_or_admin') THEN
      EXECUTE 'CREATE POLICY "orders_own_or_admin" ON orders FOR SELECT USING ((auth.jwt() ->> ''role'') = ''admin'' OR user_id::text = (auth.jwt() ->> ''sub''))';
    END IF;
  END IF;
END $$;
