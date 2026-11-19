import { Router } from 'express';
import { getDb, getNextFridayDate } from '../db.ts';
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getMonthBounds(ym: string): { from: string; to: string; days: number; fridays: number } {
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
  return { from, to, days: lastDay, fridays: Math.max(1, fridays) };
}

router.get('/summary', async (req, res) => {
  try {
    const db = await getDb();
    const fridayDate = req.query.friday_date ? String(req.query.friday_date) : '';
    const params: unknown[] = [];
    const orderWhere = fridayDate
      ? "WHERE o.friday_date = ? AND o.status != 'awaiting_approval'"
      : "WHERE o.status != 'awaiting_approval'";
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
      sales_cogs: round2(sales_cogs),
      charity_cogs: round2(charity_cogs),
      charity_units,
      total_cogs: round2(sales_cogs + charity_cogs),
    });
  } catch (err) {
    console.error('Finance summary error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת סיכום העלויות' });
  }
});

// דוח רווח והפסד, התאמת קופה (מזומן מול ביט) ודוח חייבים וזכאים
router.get('/pnl', async (req, res) => {
  try {
    const db = await getDb();
    const modeRaw = String(req.query.mode || 'friday');
    const mode: 'friday' | 'month' | 'custom' =
      modeRaw === 'month' || modeRaw === 'custom' ? modeRaw : 'friday';

    const fridayDate = String(req.query.friday_date || getNextFridayDate()).slice(0, 10);
    const month = String(req.query.month || new Date().toISOString().slice(0, 7)).slice(0, 7);
    const customFrom = String(req.query.from_date || fridayDate).slice(0, 10);
    const customTo = String(req.query.to_date || fridayDate).slice(0, 10);

    let periodLabel = '';
    let orderWhere = '';
    let orderParams: unknown[] = [];
    let invWhere = '';
    let invParams: unknown[] = [];
    let txWhere = '';
    let txParams: unknown[] = [];
    let weeklyFactor = 1;
    let monthlyFactor = 1 / 4.3333;

    if (mode === 'friday') {
      periodLabel = fridayDate;
      orderWhere = "WHERE o.friday_date = ? AND o.status != 'awaiting_approval'";
      orderParams = [fridayDate];
      invWhere = 'WHERE fi.friday_date = ?';
      invParams = [fridayDate];
      txWhere = 'WHERE (t.friday_date = ? OR (t.friday_date IS NULL AND t.date = ?))';
      txParams = [fridayDate, fridayDate];
      weeklyFactor = 1;
      monthlyFactor = 1 / 4.3333;
    } else if (mode === 'month') {
      const bounds = getMonthBounds(month);
      periodLabel = month;
      orderWhere = "WHERE o.friday_date >= ? AND o.friday_date <= ? AND o.status != 'awaiting_approval'";
      orderParams = [bounds.from, bounds.to];
      invWhere = 'WHERE fi.friday_date >= ? AND fi.friday_date <= ?';
      invParams = [bounds.from, bounds.to];
      txWhere =
        'WHERE ((t.friday_date IS NOT NULL AND t.friday_date >= ? AND t.friday_date <= ?) OR (t.friday_date IS NULL AND t.date >= ? AND t.date <= ?))';
      txParams = [bounds.from, bounds.to, bounds.from, bounds.to];
      weeklyFactor = bounds.fridays;
      monthlyFactor = 1;
    } else {
      const from = customFrom <= customTo ? customFrom : customTo;
      const to = customFrom <= customTo ? customTo : customFrom;
      periodLabel = `${from} — ${to}`;
      orderWhere = "WHERE o.friday_date >= ? AND o.friday_date <= ? AND o.status != 'awaiting_approval'";
      orderParams = [from, to];
      invWhere = 'WHERE fi.friday_date >= ? AND fi.friday_date <= ?';
      invParams = [from, to];
      txWhere =
        'WHERE ((t.friday_date IS NOT NULL AND t.friday_date >= ? AND t.friday_date <= ?) OR (t.friday_date IS NULL AND t.date >= ? AND t.date <= ?))';
      txParams = [from, to, from, to];
      const diffMs = new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime();
      const days = Math.max(1, Math.round(diffMs / 86400000) + 1);
      weeklyFactor = days / 7;
      monthlyFactor = days / 30.4375;
    }

    // 1. הכנסות מהזמנות לפי סוג
    const orderRevRows = await db.query<{ order_type: string; total_rev: number; order_count: number }>(
      `SELECT o.order_type, COALESCE(SUM(o.total_amount), 0) as total_rev, COUNT(*) as order_count
       FROM orders o
       ${orderWhere}
       GROUP BY o.order_type`,
      orderParams
    );

    let customer_orders_revenue = 0;
    let supplier_orders_revenue = 0;
    for (const r of orderRevRows) {
      if (r.order_type === 'customer') customer_orders_revenue = Number(r.total_rev || 0);
      if (r.order_type === 'supplier') supplier_orders_revenue = Number(r.total_rev || 0);
    }

    // 2. עלות מכר (COGS) מהזמנות + תרומות + מלאי חופשי לדוכן
    const cogsRows = await db.query<{ order_type: string; total_cost: number; total_units: number }>(
      `SELECT o.order_type,
              COALESCE(SUM(oi.quantity * oi.cost_price_snapshot), 0) as total_cost,
              COALESCE(SUM(oi.quantity), 0) as total_units
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       ${orderWhere}
       GROUP BY o.order_type`,
      orderParams
    );

    let orders_cogs = 0;
    let charity_cogs = 0;
    let charity_units = 0;
    for (const r of cogsRows) {
      if (r.order_type === 'charity') {
        charity_cogs += Number(r.total_cost || 0);
        charity_units += Number(r.total_units || 0);
      } else {
        orders_cogs += Number(r.total_cost || 0);
      }
    }

    const extraStallRow = await db.get<{ extra_cost: number; extra_units: number }>(
      `SELECT COALESCE(SUM(fi.extra_stall_qty * p.cost_price), 0) as extra_cost,
              COALESCE(SUM(fi.extra_stall_qty), 0) as extra_units
       FROM friday_inventory fi
       JOIN products p ON p.id = fi.product_id
       ${invWhere}`,
      invParams
    );
    const extra_stall_cogs = Number(extraStallRow?.extra_cost || 0);
    const extra_stall_units = Number(extraStallRow?.extra_units || 0);

    // 3. תנועות כספיות בתקופה (מכירות דוכן מזומן/ביט, הוצאות משתנות, והתאמת קופה)
    const txRows = await db.query<DbTransaction>(
      `SELECT t.* FROM transactions t ${txWhere} ORDER BY t.date DESC, t.id DESC`,
      txParams
    );

    let walkin_stall_cash = 0;
    let walkin_stall_bit = 0;
    let walkin_stall_other = 0;
    let variable_expenses = 0;
    let posted_fixed_expenses = 0;
    const expenseByCategory = new Map<string, number>();

    const reconciliation = {
      cash: { in: 0, out: 0, net: 0 },
      bit: { in: 0, out: 0, net: 0 },
      transfer: { in: 0, out: 0, net: 0 },
    };

    for (const t of txRows) {
      const amt = Number(t.amount || 0);
      const pm = t.payment_method;
      if (t.type === 'income') {
        reconciliation[pm].in = round2(reconciliation[pm].in + amt);
        if (t.category.includes('דוכן')) {
          if (pm === 'cash') walkin_stall_cash += amt;
          else if (pm === 'bit') walkin_stall_bit += amt;
          else walkin_stall_other += amt;
        }
      } else {
        reconciliation[pm].out = round2(reconciliation[pm].out + amt);
        const isPostedFixed = t.notes.includes('[הוצאה קבועה]') || t.notes.includes('מהוצאה קבועה');
        if (isPostedFixed) {
          posted_fixed_expenses += amt;
        } else {
          variable_expenses += amt;
          expenseByCategory.set(t.category, round2((expenseByCategory.get(t.category) || 0) + amt));
        }
      }
    }

    reconciliation.cash.net = round2(reconciliation.cash.in - reconciliation.cash.out);
    reconciliation.bit.net = round2(reconciliation.bit.in - reconciliation.bit.out);
    reconciliation.transfer.net = round2(reconciliation.transfer.in - reconciliation.transfer.out);

    const walkin_stall_revenue = round2(walkin_stall_cash + walkin_stall_bit + walkin_stall_other);

    // 4. הוצאות קבועות יחסיות (Prorated Fixed Expenses)
    const activeFilter = db.isPostgres ? 'is_active = TRUE' : 'is_active = 1';
    const fixedRows = await db.query<DbFixedExpense>(
      `SELECT * FROM fixed_expenses WHERE ${activeFilter} ORDER BY id ASC`
    );

    const proratedFixedItems = fixedRows.map((f) => {
      const factor = f.frequency === 'weekly' ? weeklyFactor : monthlyFactor;
      const prorated = round2(Number(f.amount) * factor);
      return {
        id: Number(f.id),
        name: f.name,
        frequency: f.frequency,
        base_amount: Number(f.amount),
        prorated_amount: prorated,
      };
    });
    const prorated_fixed_expenses = round2(
      proratedFixedItems.reduce((s, f) => s + f.prorated_amount, 0)
    );

    // 5. סיכום דוח רווח והפסד
    const total_revenue = round2(
      customer_orders_revenue + supplier_orders_revenue + walkin_stall_revenue
    );
    const total_cogs = round2(orders_cogs + extra_stall_cogs + charity_cogs);
    const gross_profit = round2(total_revenue - total_cogs);
    const gross_margin_pct = total_revenue > 0 ? round2((gross_profit / total_revenue) * 100) : 0;

    // אם כבר נרשמו הוצאות קבועות בפועל בתנועות, נשתמש בגבוה או נציג בנפרד; בדוח P&L מקזזים משתנות + קבועות יחסיות
    const net_profit = round2(gross_profit - variable_expenses - prorated_fixed_expenses);
    const net_margin_pct = total_revenue > 0 ? round2((net_profit / total_revenue) * 100) : 0;

    // 6. דוח חייבים וזכאים (יתרות פתוחות)
    const openBalanceUsers = await db.query<{
      id: number;
      name: string;
      phone: string;
      email: string;
      role: 'admin' | 'supplier' | 'customer';
      balance: number;
      notes: string;
    }>(
      `SELECT id, name, phone, email, role, balance, notes
       FROM users
       WHERE ABS(balance) > 0.009
       ORDER BY balance ASC`
    );

    const open_balances = openBalanceUsers.map((u) => ({
      id: Number(u.id),
      name: u.name,
      phone: u.phone || '',
      email: u.email,
      role: u.role,
      balance: round2(Number(u.balance)),
      notes: u.notes || '',
    }));

    const total_receivables = round2(
      open_balances.filter((u) => u.balance < 0).reduce((s, u) => s + Math.abs(u.balance), 0)
    );
    const total_credits = round2(
      open_balances.filter((u) => u.balance > 0).reduce((s, u) => s + u.balance, 0)
    );

    res.json({
      period: { mode, label: periodLabel },
      pnl: {
        customer_orders_revenue: round2(customer_orders_revenue),
        supplier_orders_revenue: round2(supplier_orders_revenue),
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
        expense_breakdown: Array.from(expenseByCategory.entries()).map(([category, amount]) => ({
          category,
          amount,
        })),
        prorated_fixed_expenses,
        prorated_fixed_items: proratedFixedItems,
        posted_fixed_expenses: round2(posted_fixed_expenses),
        net_profit,
        net_margin_pct,
      },
      reconciliation: {
        ...reconciliation,
        digital_combined: {
          in: round2(reconciliation.bit.in + reconciliation.transfer.in),
          out: round2(reconciliation.bit.out + reconciliation.transfer.out),
          net: round2(reconciliation.bit.net + reconciliation.transfer.net),
        },
        total_in: round2(reconciliation.cash.in + reconciliation.bit.in + reconciliation.transfer.in),
        total_out: round2(reconciliation.cash.out + reconciliation.bit.out + reconciliation.transfer.out),
        total_net: round2(reconciliation.cash.net + reconciliation.bit.net + reconciliation.transfer.net),
      },
      open_balances: {
        items: open_balances,
        total_receivables,
        total_credits,
      },
    });
  } catch (err) {
    console.error('PnL report error:', err);
    res.status(500).json({ error: 'שגיאה בהפקת דוח רווח והפסד' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const db = await getDb();
    const fridayDate = req.query.friday_date ? String(req.query.friday_date) : '';
    const fromDate = req.query.from_date ? String(req.query.from_date) : '';
    const toDate = req.query.to_date ? String(req.query.to_date) : '';
    const type = req.query.type ? String(req.query.type) : '';
    const paymentMethod = req.query.payment_method ? String(req.query.payment_method) : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (fridayDate) {
      conditions.push('t.friday_date = ?');
      params.push(fridayDate);
    }
    if (fromDate) {
      conditions.push('t.date >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      conditions.push('t.date <= ?');
      params.push(toDate);
    }
    if (type === 'income' || type === 'expense') {
      conditions.push('t.type = ?');
      params.push(type);
    }
    if (paymentMethod === 'cash' || paymentMethod === 'bit' || paymentMethod === 'transfer') {
      conditions.push('t.payment_method = ?');
      params.push(paymentMethod);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
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

// סיכום קופת דוכן שישי — הזנה מהירה של מזומן + ביט
router.post('/stall-closeout', async (req, res) => {
  try {
    const friday_date = String(req.body?.friday_date || getNextFridayDate()).slice(0, 10);
    const date = String(req.body?.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const cash_amount = Math.max(0, Number(req.body?.cash_amount || 0));
    const bit_amount = Math.max(0, Number(req.body?.bit_amount || 0));
    const notes = String(req.body?.notes || '').trim();

    if (cash_amount <= 0 && bit_amount <= 0) {
      res.status(400).json({ error: 'יש להזין סכום במזומן או בביט (גדול מ-0)' });
      return;
    }

    const db = await getDb();
    const createdIds: number[] = [];

    if (cash_amount > 0) {
      const r = await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
         VALUES (?, ?, 'income', 'מכירות דוכן שישי (מזומן)', 'cash', ?, NULL, ?)`,
        [date, friday_date, round2(cash_amount), notes || `סיכום קופת דוכן מזומן — שישי ${friday_date}`]
      );
      if (r.lastInsertId) createdIds.push(r.lastInsertId);
    }

    if (bit_amount > 0) {
      const r = await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
         VALUES (?, ?, 'income', 'מכירות דוכן שישי (ביט)', 'bit', ?, NULL, ?)`,
        [date, friday_date, round2(bit_amount), notes || `סיכום קופת דוכן ביט — שישי ${friday_date}`]
      );
      if (r.lastInsertId) createdIds.push(r.lastInsertId);
    }

    res.status(201).json({ ok: true, ids: createdIds });
  } catch (err) {
    console.error('Stall closeout error:', err);
    res.status(500).json({ error: 'שגיאה ברישום סיכום קופת הדוכן' });
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
      [date, friday_date, type, category, payment_method, round2(amount), user_id, notes]
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
      [name, round2(amount), frequency, payment_method, db.isPostgres ? true : 1]
    );
    res.status(201).json({ id: created.lastInsertId });
  } catch (err) {
    console.error('Create fixed expense error:', err);
    res.status(500).json({ error: 'שגיאה בהוספת הוצאה קבועה' });
  }
});

router.put('/fixed-expenses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    const amount = Number(req.body?.amount);
    const frequency = req.body?.frequency === 'monthly' ? 'monthly' : 'weekly';
    const pm = String(req.body?.payment_method || 'transfer');
    const payment_method = pm === 'cash' || pm === 'bit' ? pm : 'transfer';

    if (!name || Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'נתוני ההוצאה אינם תקינים' });
      return;
    }

    const db = await getDb();
    await db.run(
      `UPDATE fixed_expenses SET name = ?, amount = ?, frequency = ?, payment_method = ? WHERE id = ?`,
      [name, round2(amount), frequency, payment_method, id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Update fixed expense error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון ההוצאה הקבועה' });
  }
});

router.post('/fixed-expenses/apply', async (req, res) => {
  try {
    const frequencyFilter = String(req.body?.frequency || 'weekly'); // 'weekly' | 'monthly' | 'all'
    const friday_date = req.body?.friday_date ? String(req.body.friday_date).slice(0, 10) : getNextFridayDate();
    const date = String(req.body?.date || new Date().toISOString().slice(0, 10)).slice(0, 10);

    const db = await getDb();
    const activeFilter = db.isPostgres ? 'is_active = TRUE' : 'is_active = 1';
    const params: unknown[] = [];
    let freqClause = '';
    if (frequencyFilter === 'weekly' || frequencyFilter === 'monthly') {
      freqClause = 'AND frequency = ?';
      params.push(frequencyFilter);
    }

    const items = await db.query<DbFixedExpense>(
      `SELECT * FROM fixed_expenses WHERE ${activeFilter} ${freqClause} ORDER BY id ASC`,
      params
    );

    if (items.length === 0) {
      res.status(400).json({ error: 'אין הוצאות קבועות פעילות להחלה בתדירות שנבחרה' });
      return;
    }

    for (const f of items) {
      await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
         VALUES (?, ?, 'expense', ?, ?, ?, NULL, ?)`,
        [
          date,
          friday_date,
          f.name,
          f.payment_method,
          round2(Number(f.amount)),
          `[הוצאה קבועה] החלה לתקופה (${f.frequency === 'weekly' ? 'שבועי' : 'חודשי'})`,
        ]
      );
    }

    res.status(201).json({ ok: true, count: items.length });
  } catch (err) {
    console.error('Apply fixed expenses error:', err);
    res.status(500).json({ error: 'שגיאה בהחלת ההוצאות הקבועות' });
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
