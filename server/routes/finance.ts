import { Router } from 'express';
import { getDb } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';

const router = Router();
router.use(requireAuth, requireRole('admin'));

interface DbTransaction {
  id: number;
  date: string;
  friday_date: string | null;
  type: 'income' | 'expense';
  category: string;
  payment_method: 'cash' | 'bit' | 'transfer';
  amount: number;
  user_id: number | null;
  user_name?: string;
  notes: string;
}

interface DbFixedExpense {
  id: number;
  name: string;
  amount: number;
  frequency: 'weekly' | 'monthly';
  payment_method: 'cash' | 'bit' | 'transfer';
  is_active: number | boolean;
}

router.get('/summary', async (req, res) => {
  try {
    const db = await getDb();
    const fridayDate = req.query.friday_date ? String(req.query.friday_date) : '';
    const params: unknown[] = [];
    const orderWhere = fridayDate ? 'WHERE o.friday_date = ?' : '';
    if (fridayDate) params.push(fridayDate);

    const cogsRows = await db.query<{ order_type: string; total_cost: number; total_units: number }>(
      `SELECT o.order_type,
              COALESCE(SUM(oi.quantity * oi.cost_price_snapshot), 0) as total_cost,
              COALESCE(SUM(oi.quantity), 0) as total_units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       ${orderWhere}
       GROUP BY o.order_type`,
      params
    );

    let sales_cogs = 0;
    let charity_cogs = 0;
    let charity_units = 0;

    for (const r of cogsRows) {
      if (r.order_type === 'charity') {
        charity_cogs += Number(r.total_cost || 0);
        charity_units += Number(r.total_units || 0);
      } else {
        sales_cogs += Number(r.total_cost || 0);
      }
    }

    res.json({
      sales_cogs: Math.round(sales_cogs * 100) / 100,
      charity_cogs: Math.round(charity_cogs * 100) / 100,
      charity_units,
      total_cogs: Math.round((sales_cogs + charity_cogs) * 100) / 100,
    });
  } catch (err) {
    console.error('Finance summary error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת סיכום העלויות' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const db = await getDb();
    const fridayDate = req.query.friday_date ? String(req.query.friday_date) : '';
    const params: unknown[] = [];
    let where = '';
    if (fridayDate) {
      where = 'WHERE t.friday_date = ?';
      params.push(fridayDate);
    }

    const rows = await db.query<DbTransaction>(
      `SELECT t.*, u.name as user_name
       FROM transactions t
       LEFT JOIN users u ON u.id = t.user_id
       ${where}
       ORDER BY t.date DESC, t.id DESC`,
      params
    );

    res.json({
      transactions: rows.map((t) => ({
        id: Number(t.id),
        date: String(t.date).slice(0, 10),
        friday_date: t.friday_date ? String(t.friday_date).slice(0, 10) : null,
        type: t.type,
        category: t.category,
        payment_method: t.payment_method,
        amount: Number(t.amount),
        user_id: t.user_id !== null ? Number(t.user_id) : null,
        user_name: t.user_name || null,
        notes: t.notes || '',
      })),
    });
  } catch (err) {
    console.error('List transactions error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת תנועות כספיות' });
  }
});

router.post('/transactions', async (req, res) => {
  try {
    const date = String(req.body?.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const friday_date = req.body?.friday_date ? String(req.body.friday_date).slice(0, 10) : null;
    const type = req.body?.type === 'expense' ? 'expense' : 'income';
    const category = String(req.body?.category || '').trim();
    const pm = String(req.body?.payment_method || 'cash');
    const payment_method = pm === 'bit' || pm === 'transfer' ? pm : 'cash';
    const amount = Number(req.body?.amount);
    const user_id = req.body?.user_id ? Number(req.body.user_id) : null;
    const notes = String(req.body?.notes || '').trim();

    if (!category || Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'יש להזין קטגוריה וסכום חיובי' });
      return;
    }

    const db = await getDb();
    const created = await db.run(
      `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, friday_date, type, category, payment_method, amount, user_id, notes]
    );

    res.status(201).json({ id: created.lastInsertId });
  } catch (err) {
    console.error('Create transaction error:', err);
    res.status(500).json({ error: 'שגיאה ברישום התנועה הכספית' });
  }
});

router.delete('/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    await db.run('DELETE FROM transactions WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת התנועה' });
  }
});

router.get('/fixed-expenses', async (_req, res) => {
  try {
    const db = await getDb();
    const rows = await db.query<DbFixedExpense>('SELECT * FROM fixed_expenses ORDER BY id ASC');
    res.json({
      fixed_expenses: rows.map((f) => ({
        id: Number(f.id),
        name: f.name,
        amount: Number(f.amount),
        frequency: f.frequency,
        payment_method: f.payment_method,
        is_active: Boolean(f.is_active),
      })),
    });
  } catch (err) {
    console.error('List fixed expenses error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הוצאות קבועות' });
  }
});

router.post('/fixed-expenses', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const amount = Number(req.body?.amount);
    const frequency = req.body?.frequency === 'monthly' ? 'monthly' : 'weekly';
    const pm = String(req.body?.payment_method || 'transfer');
    const payment_method = pm === 'cash' || pm === 'bit' ? pm : 'transfer';

    if (!name || Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'יש להזין שם הוצאה וסכום חיובי' });
      return;
    }

    const db = await getDb();
    const created = await db.run(
      `INSERT INTO fixed_expenses (name, amount, frequency, payment_method, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [name, amount, frequency, payment_method, db.isPostgres ? true : 1]
    );
    res.status(201).json({ id: created.lastInsertId });
  } catch (err) {
    console.error('Create fixed expense error:', err);
    res.status(500).json({ error: 'שגיאה בהוספת הוצאה קבועה' });
  }
});

router.patch('/fixed-expenses/:id/toggle', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const existing = await db.get<DbFixedExpense>('SELECT * FROM fixed_expenses WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'ההוצאה לא נמצאה' });
      return;
    }
    const next = !Boolean(existing.is_active);
    await db.run('UPDATE fixed_expenses SET is_active = ? WHERE id = ?', [
      db.isPostgres ? next : next ? 1 : 0,
      id,
    ]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Toggle fixed expense error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון ההוצאה הקבועה' });
  }
});

router.delete('/fixed-expenses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    await db.run('DELETE FROM fixed_expenses WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete fixed expense error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת ההוצאה הקבועה' });
  }
});

export default router;
