import { Router } from 'express';
import { getDb, getNextFridayDate } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';

const router = Router();
router.use(requireAuth, requireRole('admin'));

type PayMethod = 'cash' | 'paybox' | 'transfer';

interface DbTransaction {
  id: number;
  date: string;
  friday_date: string | null;
  type: 'income' | 'expense';
  category: string;
  payment_method: PayMethod;
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
  payment_method: PayMethod;
  is_active: number | boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizePaymentMethod(raw: unknown, fallback: PayMethod = 'cash'): PayMethod {
  const s = String(raw || '');
  if (s === 'cash') return 'cash';
  if (s === 'paybox' || s === 'bit') return 'paybox';
  if (s === 'transfer') return 'transfer';
  return fallback;
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
    let subsidized_cogs = 0;
    let subsidized_units = 0;

    for (const r of cogsRows) {
      if (r.order_type === 'charity') {
        subsidized_cogs += Number(r.total_cost || 0);
        subsidized_units += Number(r.total_units || 0);
      } else {
        sales_cogs += Number(r.total_cost || 0);
      }
    }

    res.json({
      sales_cogs: round2(sales_cogs),
      subsidized_cogs: round2(subsidized_cogs),
      subsidized_units,
      total_cogs: round2(sales_cogs + subsidized_cogs),
    });
  } catch (err) {
    console.error('Finance summary error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת סיכום העלויות' });
  }
});

// ==================== ניהול פחת סוף יום שישי ====================

router.get('/waste', async (req, res) => {
  try {
    const db = await getDb();
    const fridayDate = String(req.query.friday_date || getNextFridayDate()).slice(0, 10);

    const activeFilter = db.isPostgres ? 'is_active = TRUE' : 'is_active = 1';
    const products = await db.query<{ id: number; name: string; cost_price: number }>(
      `SELECT id, name, cost_price FROM products WHERE ${activeFilter} ORDER BY sort_order ASC, id ASC`
    );

    const wasteRows = await db.query<{
      product_id: number;
      quantity: number;
      unit_cost: number;
      notes: string;
    }>(
      `SELECT product_id, quantity, unit_cost, notes FROM waste_logs WHERE friday_date = ?`,
      [fridayDate]
    );

    const wasteMap = new Map(wasteRows.map((w) => [Number(w.product_id), w]));

    const items = products.map((p) => {
      const w = wasteMap.get(Number(p.id));
      const qty = w ? Number(w.quantity) : 0;
      const unitCost = w && Number(w.unit_cost) > 0 ? Number(w.unit_cost) : Number(p.cost_price);
      return {
        product_id: Number(p.id),
        product_name: p.name,
        cost_price: round2(unitCost),
        quantity: qty,
        line_cost: round2(qty * unitCost),
        notes: w?.notes || '',
      };
    });

    const total_waste_units = items.reduce((s, i) => s + i.quantity, 0);
    const total_waste_cost = round2(items.reduce((s, i) => s + i.line_cost, 0));

    res.json({
      friday_date: fridayDate,
      items,
      total_waste_units,
      total_waste_cost,
    });
  } catch (err) {
    console.error('Get waste logs error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני הפחת' });
  }
});

router.put('/waste', async (req, res) => {
  try {
    const db = await getDb();
    const fridayDate = String(req.body?.friday_date || getNextFridayDate()).slice(0, 10);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    const products = await db.query<{ id: number; cost_price: number }>(
      'SELECT id, cost_price FROM products'
    );
    const prodCostMap = new Map(products.map((p) => [Number(p.id), Number(p.cost_price)]));

    for (const row of rawItems) {
      const productId = Number(row.product_id);
      const quantity = Math.max(0, Math.floor(Number(row.quantity) || 0));
      const notes = String(row.notes || '').trim();
      if (!Number.isInteger(productId) || !prodCostMap.has(productId)) continue;

      if (quantity === 0) {
        await db.run('DELETE FROM waste_logs WHERE friday_date = ? AND product_id = ?', [
          fridayDate,
          productId,
        ]);
      } else {
        // מחיר עלות אפקטיבי לתאריך השישי מהיסטוריית המחירים (או המחיר הנוכחי)
        const hist = await db.get<{ cost_price: number }>(
          `SELECT cost_price FROM product_price_history
           WHERE product_id = ? AND effective_date <= ?
           ORDER BY effective_date DESC LIMIT 1`,
          [productId, fridayDate]
        );
        const unitCost = round2(hist ? Number(hist.cost_price) : prodCostMap.get(productId)!);

        const existing = await db.get<{ id: number }>(
          'SELECT id FROM waste_logs WHERE friday_date = ? AND product_id = ?',
          [fridayDate, productId]
        );
        if (existing) {
          await db.run(
            'UPDATE waste_logs SET quantity = ?, unit_cost = ?, notes = ? WHERE id = ?',
            [quantity, unitCost, notes, existing.id]
          );
        } else {
          await db.run(
            `INSERT INTO waste_logs (friday_date, product_id, quantity, unit_cost, notes)
             VALUES (?, ?, ?, ?, ?)`,
            [fridayDate, productId, quantity, unitCost, notes]
          );
        }
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Save waste logs error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת דוח הפחת' });
  }
});

// ==================== דוח רווח והפסד (P&L) מסחרי + סעיף הזמנות מסובסדות נפרד ====================

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
    let fromBound = fridayDate;
    let toBound = fridayDate;
    let orderWhere = '';
    let orderParams: unknown[] = [];
    let invWhere = '';
    let invParams: unknown[] = [];
    let wasteWhere = '';
    let wasteParams: unknown[] = [];
    let txWhere = '';
    let txParams: unknown[] = [];
    let subPayWhere = '';
    let subPayParams: unknown[] = [];
    let weeklyFactor = 1;
    let monthlyFactor = 1 / 4.3333;

    if (mode === 'friday') {
      periodLabel = fridayDate;
      fromBound = fridayDate;
      toBound = fridayDate;
      orderWhere = "WHERE o.friday_date = ? AND o.status != 'awaiting_approval'";
      orderParams = [fridayDate];
      invWhere = 'WHERE fi.friday_date = ?';
      invParams = [fridayDate];
      wasteWhere = 'WHERE wl.friday_date = ?';
      wasteParams = [fridayDate];
      txWhere = 'WHERE (t.friday_date = ? OR (t.friday_date IS NULL AND t.date = ?))';
      txParams = [fridayDate, fridayDate];
      subPayWhere = 'WHERE sp.date = ?';
      subPayParams = [fridayDate];
      weeklyFactor = 1;
      monthlyFactor = 1 / 4.3333;
    } else if (mode === 'month') {
      const bounds = getMonthBounds(month);
      periodLabel = month;
      fromBound = bounds.from;
      toBound = bounds.to;
      orderWhere = "WHERE o.friday_date >= ? AND o.friday_date <= ? AND o.status != 'awaiting_approval'";
      orderParams = [bounds.from, bounds.to];
      invWhere = 'WHERE fi.friday_date >= ? AND fi.friday_date <= ?';
      invParams = [bounds.from, bounds.to];
      wasteWhere = 'WHERE wl.friday_date >= ? AND wl.friday_date <= ?';
      wasteParams = [bounds.from, bounds.to];
      txWhere =
        'WHERE ((t.friday_date IS NOT NULL AND t.friday_date >= ? AND t.friday_date <= ?) OR (t.friday_date IS NULL AND t.date >= ? AND t.date <= ?))';
      txParams = [bounds.from, bounds.to, bounds.from, bounds.to];
      subPayWhere = 'WHERE sp.date >= ? AND sp.date <= ?';
      subPayParams = [bounds.from, bounds.to];
      weeklyFactor = bounds.fridays;
      monthlyFactor = 1;
    } else {
      const from = customFrom <= customTo ? customFrom : customTo;
      const to = customFrom <= customTo ? customTo : customFrom;
      periodLabel = `${from} — ${to}`;
      fromBound = from;
      toBound = to;
      orderWhere = "WHERE o.friday_date >= ? AND o.friday_date <= ? AND o.status != 'awaiting_approval'";
      orderParams = [from, to];
      invWhere = 'WHERE fi.friday_date >= ? AND fi.friday_date <= ?';
      invParams = [from, to];
      wasteWhere = 'WHERE wl.friday_date >= ? AND wl.friday_date <= ?';
      wasteParams = [from, to];
      txWhere =
        'WHERE ((t.friday_date IS NOT NULL AND t.friday_date >= ? AND t.friday_date <= ?) OR (t.friday_date IS NULL AND t.date >= ? AND t.date <= ?))';
      txParams = [from, to, from, to];
      subPayWhere = 'WHERE sp.date >= ? AND sp.date <= ?';
      subPayParams = [from, to];
      const diffMs = new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime();
      const days = Math.max(1, Math.round(diffMs / 86400000) + 1);
      weeklyFactor = days / 7;
      monthlyFactor = days / 30.4375;
    }

    // 1. הכנסות מסחריות מהזמנות (לקוחות + ספקים בלבד; הזמנות מסובסדות מוחרגות לחלוטין!)
    const orderRevRows = await db.query<{ order_type: string; total_rev: number }>(
      `SELECT o.order_type, COALESCE(SUM(o.total_amount), 0) as total_rev
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

    // 2. עלות המכר המסחרי (COGS — הזמנות לקוחות וספקים בלבד, ללא מסובסדות!)
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
    let period_subsidized_cost = 0;
    let period_subsidized_units = 0;
    for (const r of cogsRows) {
      if (r.order_type === 'charity') {
        period_subsidized_cost += Number(r.total_cost || 0);
        period_subsidized_units += Number(r.total_units || 0);
      } else {
        orders_cogs += Number(r.total_cost || 0);
      }
    }

    // 3. פחת סוף יום (Waste) + מלאי חופשי לדוכן שנמכר בפועל (ללא כפל חיוב על יחידות שדווחו כפחת)
    const wasteRows = await db.query<{
      friday_date: string;
      product_id: number;
      quantity: number;
      unit_cost: number;
    }>(
      `SELECT wl.friday_date, wl.product_id, wl.quantity, wl.unit_cost
       FROM waste_logs wl
       ${wasteWhere}`,
      wasteParams
    );

    let waste_cost = 0;
    let waste_units = 0;
    const wasteByDateProd = new Map<string, number>();
    for (const w of wasteRows) {
      const q = Number(w.quantity || 0);
      const c = Number(w.unit_cost || 0);
      waste_units += q;
      waste_cost += q * c;
      const key = `${String(w.friday_date).slice(0, 10)}_${Number(w.product_id)}`;
      wasteByDateProd.set(key, (wasteByDateProd.get(key) || 0) + q);
    }
    waste_cost = round2(waste_cost);

    const extraStallRows = await db.query<{
      friday_date: string;
      product_id: number;
      extra_stall_qty: number;
      cost_price: number;
    }>(
      `SELECT fi.friday_date, fi.product_id, fi.extra_stall_qty, p.cost_price
       FROM friday_inventory fi
       JOIN products p ON p.id = fi.product_id
       ${invWhere}`,
      invParams
    );

    let extra_stall_cogs = 0;
    let extra_stall_units = 0;
    for (const row of extraStallRows) {
      const key = `${String(row.friday_date).slice(0, 10)}_${Number(row.product_id)}`;
      const wastedQty = wasteByDateProd.get(key) || 0;
      const soldExtraQty = Math.max(0, Number(row.extra_stall_qty || 0) - wastedQty);
      extra_stall_units += soldExtraQty;
      extra_stall_cogs += soldExtraQty * Number(row.cost_price || 0);
    }
    extra_stall_cogs = round2(extra_stall_cogs);

    // 4. תנועות כספיות בתקופה (פדיון דוכן מזומן/פייבוקס/העברה, הוצאות תפעול, והתאמת קופה)
    const txRows = await db.query<DbTransaction>(
      `SELECT t.* FROM transactions t ${txWhere} ORDER BY t.date DESC, t.id DESC`,
      txParams
    );

    let walkin_stall_cash = 0;
    let walkin_stall_paybox = 0;
    let walkin_stall_transfer = 0;
    let variable_expenses = 0;
    let bakery_cash_purchases = 0;
    let posted_fixed_expenses = 0;
    const expenseByCategory = new Map<string, number>();

    const reconciliation = {
      cash: { in: 0, out: 0, net: 0 },
      paybox: { in: 0, out: 0, net: 0 },
      transfer: { in: 0, out: 0, net: 0 },
    };

    for (const t of txRows) {
      const amt = Number(t.amount || 0);
      const pm = normalizePaymentMethod(t.payment_method, 'cash');
      if (t.type === 'income') {
        reconciliation[pm].in = round2(reconciliation[pm].in + amt);
        if (t.category.includes('דוכן')) {
          if (pm === 'cash') walkin_stall_cash += amt;
          else if (pm === 'paybox') walkin_stall_paybox += amt;
          else walkin_stall_transfer += amt;
        }
      } else {
        reconciliation[pm].out = round2(reconciliation[pm].out + amt);
        const isPostedFixed = t.notes.includes('[הוצאה קבועה]') || t.notes.includes('מהוצאה קבועה');
        const isBakeryCashPurchase = t.category.includes('רכש מאפייה');
        if (isPostedFixed) {
          posted_fixed_expenses += amt;
        } else if (isBakeryCashPurchase) {
          // רכש מאפייה במזומן מנוכה מהתאמת המזומן בקופה, אך לא נספר כפול ב-P&L כי הוא כבר מחושב ב-COGS + פחת + מסובסדות
          bakery_cash_purchases += amt;
        } else {
          variable_expenses += amt;
          expenseByCategory.set(t.category, round2((expenseByCategory.get(t.category) || 0) + amt));
        }
      }
    }

    reconciliation.cash.net = round2(reconciliation.cash.in - reconciliation.cash.out);
    reconciliation.paybox.net = round2(reconciliation.paybox.in - reconciliation.paybox.out);
    reconciliation.transfer.net = round2(reconciliation.transfer.in - reconciliation.transfer.out);

    const walkin_stall_revenue = round2(
      walkin_stall_cash + walkin_stall_paybox + walkin_stall_transfer
    );

    // 5. הוצאות קבועות יחסיות
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

    // 6. סיכום דוח רווח והפסד מסחרי (ללא הזמנות מסובסדות!)
    const total_revenue = round2(
      customer_orders_revenue + supplier_orders_revenue + walkin_stall_revenue
    );
    const total_cogs = round2(orders_cogs + extra_stall_cogs);
    const gross_profit = round2(total_revenue - total_cogs - waste_cost);
    const gross_margin_pct = total_revenue > 0 ? round2((gross_profit / total_revenue) * 100) : 0;

    const net_profit = round2(gross_profit - variable_expenses - prorated_fixed_expenses);
    const net_margin_pct = total_revenue > 0 ? round2((net_profit / total_revenue) * 100) : 0;

    // 7. סעיף נפרד לחלוטין: "הוצאות הזמנות מסובסדות" (עלות חבילות בניכוי תקבולים חודשיים)
    const entities = await db.query<{ id: number; name: string }>(
      'SELECT id, name FROM subsidized_entities ORDER BY id ASC'
    );
    const entityByName = new Map(entities.map((e) => [e.name.trim(), Number(e.id)]));

    const periodSubOrders = await db.query<{
      subsidized_entity_id: number | null;
      recipient_name: string;
      total_cost: number;
    }>(
      `SELECT o.subsidized_entity_id, o.recipient_name,
              COALESCE(SUM(oi.quantity * oi.cost_price_snapshot), 0) as total_cost
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${orderWhere} AND o.order_type = 'charity'
       GROUP BY o.id, o.subsidized_entity_id, o.recipient_name`,
      orderParams
    );

    const periodSubPayments = await db.query<{ entity_id: number; amount: number }>(
      `SELECT sp.entity_id, sp.amount FROM subsidized_payments sp ${subPayWhere}`,
      subPayParams
    );

    const allSubOrders = await db.query<{
      subsidized_entity_id: number | null;
      recipient_name: string;
      total_cost: number;
    }>(
      `SELECT o.subsidized_entity_id, o.recipient_name,
              COALESCE(SUM(oi.quantity * oi.cost_price_snapshot), 0) as total_cost
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.order_type = 'charity' AND o.status != 'awaiting_approval'
       GROUP BY o.id, o.subsidized_entity_id, o.recipient_name`
    );

    const allSubPayments = await db.query<{ entity_id: number; amount: number }>(
      'SELECT entity_id, amount FROM subsidized_payments'
    );

    const entPeriodMap = new Map<number, { cost: number; paid: number }>();
    const entCumMap = new Map<number, { cost: number; paid: number }>();
    for (const e of entities) {
      entPeriodMap.set(Number(e.id), { cost: 0, paid: 0 });
      entCumMap.set(Number(e.id), { cost: 0, paid: 0 });
    }

    for (const o of periodSubOrders) {
      const eid =
        o.subsidized_entity_id !== null && o.subsidized_entity_id !== undefined
          ? Number(o.subsidized_entity_id)
          : entityByName.get(String(o.recipient_name || '').trim()) ?? null;
      if (eid && entPeriodMap.has(eid)) {
        entPeriodMap.get(eid)!.cost = round2(entPeriodMap.get(eid)!.cost + Number(o.total_cost || 0));
      }
    }

    let period_subsidized_receipts = 0;
    for (const p of periodSubPayments) {
      const amt = Number(p.amount || 0);
      period_subsidized_receipts = round2(period_subsidized_receipts + amt);
      const eid = Number(p.entity_id);
      if (entPeriodMap.has(eid)) {
        entPeriodMap.get(eid)!.paid = round2(entPeriodMap.get(eid)!.paid + amt);
      }
    }

    let cumulative_subsidized_cost = 0;
    for (const o of allSubOrders) {
      const cost = Number(o.total_cost || 0);
      cumulative_subsidized_cost = round2(cumulative_subsidized_cost + cost);
      const eid =
        o.subsidized_entity_id !== null && o.subsidized_entity_id !== undefined
          ? Number(o.subsidized_entity_id)
          : entityByName.get(String(o.recipient_name || '').trim()) ?? null;
      if (eid && entCumMap.has(eid)) {
        entCumMap.get(eid)!.cost = round2(entCumMap.get(eid)!.cost + cost);
      }
    }

    let cumulative_subsidized_receipts = 0;
    for (const p of allSubPayments) {
      const amt = Number(p.amount || 0);
      cumulative_subsidized_receipts = round2(cumulative_subsidized_receipts + amt);
      const eid = Number(p.entity_id);
      if (entCumMap.has(eid)) {
        entCumMap.get(eid)!.paid = round2(entCumMap.get(eid)!.paid + amt);
      }
    }

    const subsidizedEntitiesBreakdown = entities.map((e) => {
      const pm = entPeriodMap.get(Number(e.id)) || { cost: 0, paid: 0 };
      const cm = entCumMap.get(Number(e.id)) || { cost: 0, paid: 0 };
      return {
        id: Number(e.id),
        name: e.name,
        period_cost: round2(pm.cost),
        period_receipts: round2(pm.paid),
        period_net_gap: round2(pm.cost - pm.paid),
        cumulative_net_gap: round2(cm.cost - cm.paid),
      };
    });

    // 8. דוח חייבים וזכאים (יתרות פתוחות)
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

    void fromBound;
    void toBound;

    res.json({
      period: { mode, label: periodLabel },
      pnl: {
        customer_orders_revenue: round2(customer_orders_revenue),
        supplier_orders_revenue: round2(supplier_orders_revenue),
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
      subsidized: {
        period_cost: round2(period_subsidized_cost),
        period_units: period_subsidized_units,
        period_receipts: round2(period_subsidized_receipts),
        period_net_expense: round2(period_subsidized_cost - period_subsidized_receipts),
        cumulative_cost: round2(cumulative_subsidized_cost),
        cumulative_receipts: round2(cumulative_subsidized_receipts),
        cumulative_net_expense: round2(cumulative_subsidized_cost - cumulative_subsidized_receipts),
        entities: subsidizedEntitiesBreakdown,
      },
      reconciliation: {
        ...reconciliation,
        digital_combined: {
          in: round2(reconciliation.paybox.in + reconciliation.transfer.in),
          out: round2(reconciliation.paybox.out + reconciliation.transfer.out),
          net: round2(reconciliation.paybox.net + reconciliation.transfer.net),
        },
        total_in: round2(reconciliation.cash.in + reconciliation.paybox.in + reconciliation.transfer.in),
        total_out: round2(reconciliation.cash.out + reconciliation.paybox.out + reconciliation.transfer.out),
        total_net: round2(reconciliation.cash.net + reconciliation.paybox.net + reconciliation.transfer.net),
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
    if (paymentMethod === 'cash' || paymentMethod === 'paybox' || paymentMethod === 'transfer') {
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
        payment_method: normalizePaymentMethod(t.payment_method, 'cash'),
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

// סיכום קופת דוכן שישי — הזנה מהירה של מזומן + פייבוקס + העברה בנקאית
router.post('/stall-closeout', async (req, res) => {
  try {
    const friday_date = String(req.body?.friday_date || getNextFridayDate()).slice(0, 10);
    const date = String(req.body?.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const cash_amount = Math.max(0, Number(req.body?.cash_amount || 0));
    const paybox_amount = Math.max(0, Number(req.body?.paybox_amount ?? req.body?.bit_amount ?? 0));
    const transfer_amount = Math.max(0, Number(req.body?.transfer_amount || 0));
    const notes = String(req.body?.notes || '').trim();

    if (cash_amount <= 0 && paybox_amount <= 0 && transfer_amount <= 0) {
      res.status(400).json({ error: 'יש להזין סכום במזומן, בפייבוקס או בהעברה בנקאית (גדול מ-0)' });
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

    if (paybox_amount > 0) {
      const r = await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
         VALUES (?, ?, 'income', 'מכירות דוכן שישי (פייבוקס)', 'paybox', ?, NULL, ?)`,
        [date, friday_date, round2(paybox_amount), notes || `סיכום קופת דוכן פייבוקס — שישי ${friday_date}`]
      );
      if (r.lastInsertId) createdIds.push(r.lastInsertId);
    }

    if (transfer_amount > 0) {
      const r = await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
         VALUES (?, ?, 'income', 'מכירות דוכן שישי (העברה בנקאית)', 'transfer', ?, NULL, ?)`,
        [date, friday_date, round2(transfer_amount), notes || `סיכום קופת דוכן העברה בנקאית — שישי ${friday_date}`]
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
    const payment_method = normalizePaymentMethod(req.body?.payment_method, 'cash');
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
        payment_method: normalizePaymentMethod(f.payment_method, 'transfer'),
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
    const payment_method = normalizePaymentMethod(req.body?.payment_method, 'transfer');

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
    const payment_method = normalizePaymentMethod(req.body?.payment_method, 'transfer');

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
    const frequencyFilter = String(req.body?.frequency || 'weekly');
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
          normalizePaymentMethod(f.payment_method, 'transfer'),
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
