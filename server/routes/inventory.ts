import { Router } from 'express';
import { getDb, getNextFridayDate } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';

const router = Router();
router.use(requireAuth, requireRole('admin'));

interface ProductRow {
  id: number;
  name: string;
  cost_price: number;
  customer_price: number;
  is_active: number | boolean;
}

interface OrderAggRow {
  product_id: number;
  order_type: 'customer' | 'supplier' | 'charity';
  qty: number;
}

interface ExtraRow {
  product_id: number;
  extra_stall_qty: number;
}

router.get('/', async (req, res) => {
  try {
    const fridayDate = String(req.query.friday_date || getNextFridayDate()).slice(0, 10);
    const db = await getDb();

    const products = await db.query<ProductRow>('SELECT id, name, cost_price, customer_price, is_active FROM products ORDER BY id ASC');
    const orderAgg = await db.query<OrderAggRow>(
      `SELECT oi.product_id, o.order_type, SUM(oi.quantity) as qty
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.friday_date = ? AND o.status != 'awaiting_approval'
       GROUP BY oi.product_id, o.order_type`,
      [fridayDate]
    );
    const extras = await db.query<ExtraRow>(
      `SELECT product_id, extra_stall_qty FROM friday_inventory WHERE friday_date = ?`,
      [fridayDate]
    );

    const extraMap = new Map(extras.map((e) => [Number(e.product_id), Number(e.extra_stall_qty)]));
    const aggMap = new Map<number, { supplier: number; customer: number; charity: number }>();

    for (const row of orderAgg) {
      const pid = Number(row.product_id);
      const cur = aggMap.get(pid) || { supplier: 0, customer: 0, charity: 0 };
      cur[row.order_type] += Number(row.qty);
      aggMap.set(pid, cur);
    }

    const items = products
      .filter((p) => Boolean(p.is_active) || aggMap.has(Number(p.id)) || (extraMap.get(Number(p.id)) ?? 0) > 0)
      .map((p) => {
        const pid = Number(p.id);
        const a = aggMap.get(pid) || { supplier: 0, customer: 0, charity: 0 };
        const extra = extraMap.get(pid) ?? 0;
        const ordered_total = a.supplier + a.customer + a.charity;
        const total_to_bake = ordered_total + extra;
        return {
          product_id: pid,
          product_name: p.name,
          cost_price: Number(p.cost_price),
          customer_price: Number(p.customer_price),
          supplier_qty: a.supplier,
          customer_qty: a.customer,
          charity_qty: a.charity,
          ordered_total,
          extra_stall_qty: extra,
          total_to_bake,
        };
      });

    res.json({ friday_date: fridayDate, items });
  } catch (err) {
    console.error('Get inventory error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת תכנון מלאי שישי' });
  }
});

router.put('/', async (req, res) => {
  try {
    const friday_date = String(req.body?.friday_date || '').slice(0, 10);
    const product_id = Number(req.body?.product_id);
    const extra_stall_qty = Math.max(0, Math.floor(Number(req.body?.extra_stall_qty || 0)));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(friday_date) || !Number.isInteger(product_id)) {
      res.status(400).json({ error: 'נתוני מלאי לא תקינים' });
      return;
    }

    const db = await getDb();
    const existing = await db.get<{ id: number }>(
      'SELECT id FROM friday_inventory WHERE friday_date = ? AND product_id = ?',
      [friday_date, product_id]
    );

    if (existing) {
      await db.run('UPDATE friday_inventory SET extra_stall_qty = ? WHERE id = ?', [extra_stall_qty, existing.id]);
    } else {
      await db.run(
        'INSERT INTO friday_inventory (friday_date, product_id, extra_stall_qty) VALUES (?, ?, ?)',
        [friday_date, product_id, extra_stall_qty]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Upsert inventory error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת כמות אקסטרה לדוכן' });
  }
});

export default router;
