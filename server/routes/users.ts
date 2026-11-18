import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.ts';
import { requireAuth, requireRole, type UserRole } from '../auth.ts';

const router = Router();

interface DbUser {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  balance: number;
  notes: string;
  created_at: string;
}

router.use(requireAuth, requireRole('admin'));

router.get('/', async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.query<DbUser>(
      'SELECT id, name, phone, email, role, balance, notes, created_at FROM users ORDER BY role ASC, name ASC'
    );
    res.json({
      users: rows.map((u) => ({
        id: Number(u.id),
        name: u.name,
        phone: u.phone || '',
        email: u.email,
        role: u.role,
        balance: Number(u.balance ?? 0),
        notes: u.notes || '',
        created_at: u.created_at,
      })),
    });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת רשימת המשתמשים' });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    let email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '123456');
    const roleRaw = String(req.body?.role || 'customer');
    const role: UserRole =
      roleRaw === 'admin' || roleRaw === 'supplier' ? roleRaw : 'customer';
    const balance = Number(req.body?.balance || 0);
    const notes = String(req.body?.notes || '').trim();

    if (!name) {
      res.status(400).json({ error: 'יש להזין שם מלא או שם עסק' });
      return;
    }

    if (!email) {
      const slug = phone.replace(/\D/g, '') || String(Date.now());
      email = `u_${slug}_${Math.floor(Math.random() * 1000)}@teimani.local`;
    }

    const db = await getDb();
    const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (existing) {
      res.status(409).json({ error: 'משתמש עם אימייל זה כבר קיים' });
      return;
    }

    const hash = bcrypt.hashSync(password, 10);
    const created = await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email, hash, role, Number.isNaN(balance) ? 0 : balance, notes]
    );

    const newUser = await db.get<DbUser>(
      'SELECT id, name, phone, email, role, balance, notes, created_at FROM users WHERE id = ?',
      [created.lastInsertId]
    );

    res.status(201).json({
      id: created.lastInsertId,
      user: newUser
        ? {
            id: Number(newUser.id),
            name: newUser.name,
            phone: newUser.phone || '',
            email: newUser.email,
            role: newUser.role,
            balance: Number(newUser.balance ?? 0),
            notes: newUser.notes || '',
            created_at: newUser.created_at,
          }
        : null,
    });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת משתמש חדש' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const existing = await db.get<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'המשתמש לא נמצא' });
      return;
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : existing.phone;
    const roleRaw = req.body?.role !== undefined ? String(req.body.role) : existing.role;
    const role: UserRole =
      roleRaw === 'admin' || roleRaw === 'supplier' || roleRaw === 'customer' ? roleRaw : existing.role;
    const balance =
      req.body?.balance !== undefined && !Number.isNaN(Number(req.body.balance))
        ? Number(req.body.balance)
        : Number(existing.balance);
    const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : existing.notes;

    await db.run(
      `UPDATE users SET name = ?, phone = ?, role = ?, balance = ?, notes = ? WHERE id = ?`,
      [name, phone, role, balance, notes, id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון פרטי המשתמש' });
  }
});

// Record payment received from a supplier/customer -> increases balance (reduces debt) + logs income transaction
router.post('/:id/payment', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body?.amount);
    const paymentMethodRaw = String(req.body?.payment_method || 'transfer');
    const payment_method =
      paymentMethodRaw === 'cash' || paymentMethodRaw === 'bit' ? paymentMethodRaw : 'transfer';
    const friday_date = req.body?.friday_date ? String(req.body.friday_date).slice(0, 10) : null;
    const notes = String(req.body?.notes || '').trim();

    if (Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'יש להזין סכום תשלום חיובי' });
      return;
    }

    const db = await getDb();
    const user = await db.get<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      res.status(404).json({ error: 'המשתמש לא נמצא' });
      return;
    }

    await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, id]);
    const todayStr = new Date().toISOString().slice(0, 10);
    await db.run(
      `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
       VALUES (?, ?, 'income', ?, ?, ?, ?, ?)`,
      [
        todayStr,
        friday_date,
        user.role === 'supplier' ? 'סגירת חוב ספק' : 'תשלום מלקוח',
        payment_method,
        amount,
        id,
        notes || `תשלום מאת ${user.name}`,
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Record user payment error:', err);
    res.status(500).json({ error: 'שגיאה ברישום התשלום' });
  }
});

// Record a credit / return for a supplier or customer (increases balance without logging cash income)
router.post('/:id/credit', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const amount = Number(req.body?.amount);
    const orderId = req.body?.order_id ? Number(req.body.order_id) : null;
    const notes = String(req.body?.notes || '').trim();

    if (Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'יש להזין סכום זיכוי חיובי' });
      return;
    }

    const db = await getDb();
    const user = await db.get<DbUser>('SELECT * FROM users WHERE id = ?', [id]);
    if (!user) {
      res.status(404).json({ error: 'המשתמש לא נמצא' });
      return;
    }

    if (orderId) {
      const ord = await db.get<{ id: number; credit_discount: number; total_amount: number; notes: string }>(
        'SELECT id, credit_discount, total_amount, notes FROM orders WHERE id = ? AND user_id = ?',
        [orderId, id]
      );
      if (ord) {
        const nextCredit = Math.round((Number(ord.credit_discount) + amount) * 100) / 100;
        const nextTotal = Math.max(0, Math.round((Number(ord.total_amount) - amount) * 100) / 100);
        const creditNote = notes ? `${ord.notes ? ord.notes + ' | ' : ''}זיכוי: ${notes}` : ord.notes;
        await db.run('UPDATE orders SET credit_discount = ?, total_amount = ?, notes = ? WHERE id = ?', [
          nextCredit,
          nextTotal,
          creditNote,
          orderId,
        ]);
      }
    }

    await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Record credit error:', err);
    res.status(500).json({ error: 'שגיאה ברישום הזיכוי' });
  }
});

// Unified ledger for a specific user (orders + transactions + running debt/credit)
router.get('/:id/ledger', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const user = await db.get<DbUser>(
      'SELECT id, name, phone, email, role, balance, notes, created_at FROM users WHERE id = ?',
      [id]
    );
    if (!user) {
      res.status(404).json({ error: 'המשתמש לא נמצא' });
      return;
    }

    const orders = await db.query<{
      id: number;
      friday_date: string;
      order_type: string;
      delivery_fee: number;
      credit_discount: number;
      total_amount: number;
      paid_amount: number;
      status: string;
      notes: string;
      created_at: string;
    }>('SELECT * FROM orders WHERE user_id = ? ORDER BY friday_date DESC, id DESC', [id]);

    const orderIds = orders.map((o) => Number(o.id));
    const itemsByOrder = new Map<
      number,
      Array<{ id: number; product_id: number; product_name: string; quantity: number; unit_price_snapshot: number }>
    >();

    if (orderIds.length > 0) {
      const ph = orderIds.map(() => '?').join(', ');
      const items = await db.query<{
        id: number;
        order_id: number;
        product_id: number;
        product_name: string;
        quantity: number;
        unit_price_snapshot: number;
      }>(
        `SELECT oi.id, oi.order_id, oi.product_id, p.name as product_name, oi.quantity, oi.unit_price_snapshot
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id IN (${ph})
         ORDER BY oi.id ASC`,
        orderIds
      );
      for (const it of items) {
        const oid = Number(it.order_id);
        const list = itemsByOrder.get(oid) || [];
        list.push({
          id: Number(it.id),
          product_id: Number(it.product_id),
          product_name: it.product_name,
          quantity: Number(it.quantity),
          unit_price_snapshot: Number(it.unit_price_snapshot),
        });
        itemsByOrder.set(oid, list);
      }
    }

    const transactions = await db.query<{
      id: number;
      date: string;
      friday_date: string | null;
      type: 'income' | 'expense';
      category: string;
      payment_method: 'cash' | 'bit' | 'transfer';
      amount: number;
      notes: string;
    }>('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC', [id]);

    res.json({
      user: {
        id: Number(user.id),
        name: user.name,
        phone: user.phone || '',
        email: user.email,
        role: user.role,
        balance: Number(user.balance ?? 0),
        notes: user.notes || '',
      },
      orders: orders.map((o) => ({
        id: Number(o.id),
        friday_date: String(o.friday_date).slice(0, 10),
        order_type: o.order_type,
        delivery_fee: Number(o.delivery_fee),
        credit_discount: Number(o.credit_discount),
        total_amount: Number(o.total_amount),
        paid_amount: Number(o.paid_amount),
        status: o.status,
        notes: o.notes || '',
        created_at: o.created_at,
        items: itemsByOrder.get(Number(o.id)) || [],
      })),
      transactions: transactions.map((t) => ({
        id: Number(t.id),
        date: String(t.date).slice(0, 10),
        friday_date: t.friday_date ? String(t.friday_date).slice(0, 10) : null,
        type: t.type,
        category: t.category,
        payment_method: t.payment_method,
        amount: Number(t.amount),
        notes: t.notes || '',
      })),
    });
  } catch (err) {
    console.error('Get user ledger error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת כרטסת החשבון' });
  }
});

export default router;
