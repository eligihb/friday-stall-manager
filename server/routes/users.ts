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
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '123456');
    const roleRaw = String(req.body?.role || 'customer');
    const role: UserRole =
      roleRaw === 'admin' || roleRaw === 'supplier' ? roleRaw : 'customer';
    const balance = Number(req.body?.balance || 0);
    const notes = String(req.body?.notes || '').trim();

    if (!name || !email) {
      res.status(400).json({ error: 'יש להזין שם ואימייל' });
      return;
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

    res.status(201).json({ id: created.lastInsertId });
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

export default router;
