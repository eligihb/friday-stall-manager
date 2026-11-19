import { Router } from 'express';
import { getDb } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';

const router = Router();
router.use(requireAuth, requireRole('admin'));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizePaymentMethod(raw: unknown, fallback: 'cash' | 'paybox' | 'transfer' = 'cash'): 'cash' | 'paybox' | 'transfer' {
  const s = String(raw || '');
  if (s === 'cash') return 'cash';
  if (s === 'paybox' || s === 'bit') return 'paybox';
  if (s === 'transfer') return 'transfer';
  return fallback;
}

interface DbEntity {
  id: number;
  name: string;
  phone: string;
  notes: string;
  is_active: number | boolean;
}

interface DbSubPayment {
  id: number;
  entity_id: number;
  entity_name?: string;
  date: string;
  amount: number;
  payment_method: 'cash' | 'paybox' | 'transfer';
  notes: string;
  created_at: string;
}

// סקירה מלאה: גופים מסובסדים, עלויות מצטברות, תקבולים חודשיים ונטו פער סבסוד
router.get('/', async (_req, res) => {
  try {
    const db = await getDb();
    const entities = await db.query<DbEntity>(
      'SELECT * FROM subsidized_entities ORDER BY id ASC'
    );

    // עלויות חבילות מסובסדות מכל הזמנים (מקושר לפי subsidized_entity_id או לפי התאמת שם מדויקת)
    const orderRows = await db.query<{
      order_id: number;
      subsidized_entity_id: number | null;
      recipient_name: string;
      total_cost: number;
      total_units: number;
    }>(
      `SELECT o.id as order_id,
              o.subsidized_entity_id,
              o.recipient_name,
              COALESCE(SUM(oi.quantity * oi.cost_price_snapshot), 0) as total_cost,
              COALESCE(SUM(oi.quantity), 0) as total_units
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.order_type = 'charity' AND o.status != 'awaiting_approval'
       GROUP BY o.id, o.subsidized_entity_id, o.recipient_name`
    );

    const payments = await db.query<DbSubPayment>(
      `SELECT sp.*, se.name as entity_name
       FROM subsidized_payments sp
       JOIN subsidized_entities se ON se.id = sp.entity_id
       ORDER BY sp.date DESC, sp.id DESC`
    );

    const entityByName = new Map(entities.map((e) => [e.name.trim(), Number(e.id)]));
    const statsMap = new Map<
      number,
      { orders: number; units: number; cost: number; paid: number }
    >();
    for (const e of entities) {
      statsMap.set(Number(e.id), { orders: 0, units: 0, cost: 0, paid: 0 });
    }

    let unlinkedCost = 0;
    let unlinkedUnits = 0;

    for (const o of orderRows) {
      const eid =
        o.subsidized_entity_id !== null && o.subsidized_entity_id !== undefined
          ? Number(o.subsidized_entity_id)
          : entityByName.get(String(o.recipient_name || '').trim()) ?? null;
      const cost = Number(o.total_cost || 0);
      const units = Number(o.total_units || 0);
      if (eid && statsMap.has(eid)) {
        const s = statsMap.get(eid)!;
        s.orders += 1;
        s.units += units;
        s.cost = round2(s.cost + cost);
      } else {
        unlinkedCost = round2(unlinkedCost + cost);
        unlinkedUnits += units;
      }
    }

    for (const p of payments) {
      const eid = Number(p.entity_id);
      if (statsMap.has(eid)) {
        const s = statsMap.get(eid)!;
        s.paid = round2(s.paid + Number(p.amount || 0));
      }
    }

    const hydratedEntities = entities.map((e) => {
      const s = statsMap.get(Number(e.id)) || { orders: 0, units: 0, cost: 0, paid: 0 };
      return {
        id: Number(e.id),
        name: e.name,
        phone: e.phone || '',
        notes: e.notes || '',
        is_active: Boolean(e.is_active),
        total_orders: s.orders,
        total_units: s.units,
        total_cost: round2(s.cost),
        total_paid: round2(s.paid),
        net_subsidy_gap: round2(s.cost - s.paid),
      };
    });

    const totalCost = round2(
      hydratedEntities.reduce((sum, e) => sum + e.total_cost, 0) + unlinkedCost
    );
    const totalPaid = round2(hydratedEntities.reduce((sum, e) => sum + e.total_paid, 0));
    const totalUnits =
      hydratedEntities.reduce((sum, e) => sum + e.total_units, 0) + unlinkedUnits;

    res.json({
      entities: hydratedEntities,
      payments: payments.map((p) => ({
        id: Number(p.id),
        entity_id: Number(p.entity_id),
        entity_name: p.entity_name || '',
        date: String(p.date).slice(0, 10),
        amount: round2(Number(p.amount)),
        payment_method: normalizePaymentMethod(p.payment_method, 'cash'),
        notes: p.notes || '',
        created_at: p.created_at,
      })),
      totals: {
        total_cost: totalCost,
        total_paid: totalPaid,
        net_subsidy_expense: round2(totalCost - totalPaid),
        total_units: totalUnits,
      },
    });
  } catch (err) {
    console.error('Subsidized overview error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת נתוני ההזמנות המסובסדות' });
  }
});

// הוספת גוף מסובסד חדש
router.post('/entities', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const notes = String(req.body?.notes || '').trim();
    if (!name) {
      res.status(400).json({ error: 'יש להזין שם לגוף המסובסד' });
      return;
    }

    const db = await getDb();
    const created = await db.run(
      `INSERT INTO subsidized_entities (name, phone, notes, is_active) VALUES (?, ?, ?, ?)`,
      [name, phone, notes, db.isPostgres ? true : 1]
    );
    res.status(201).json({ id: created.lastInsertId });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE') || msg.includes('duplicate')) {
      res.status(409).json({ error: 'כבר קיים גוף מסובסד בשם זה' });
      return;
    }
    console.error('Create subsidized entity error:', err);
    res.status(500).json({ error: 'שגיאה בהוספת הגוף המסובסד' });
  }
});

// עריכת שם / פרטי גוף מסובסד
router.put('/entities/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const notes = String(req.body?.notes || '').trim();
    if (!name) {
      res.status(400).json({ error: 'יש להזין שם תקין' });
      return;
    }

    const db = await getDb();
    const existing = await db.get<DbEntity>('SELECT * FROM subsidized_entities WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'הגוף המסובסד לא נמצא' });
      return;
    }

    await db.run(
      `UPDATE subsidized_entities SET name = ?, phone = ?, notes = ? WHERE id = ?`,
      [name, phone, notes, id]
    );
    // סנכרון שם מקבל ההזמנה בהזמנות המקושרות
    await db.run(
      `UPDATE orders SET recipient_name = ? WHERE subsidized_entity_id = ?`,
      [name, id]
    );
    res.json({ ok: true });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('UNIQUE') || msg.includes('duplicate')) {
      res.status(409).json({ error: 'כבר קיים גוף מסובסד בשם זה' });
      return;
    }
    console.error('Update subsidized entity error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון פרטי הגוף המסובסד' });
  }
});

// מחיקת גוף מסובסד
router.delete('/entities/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    await db.run('UPDATE orders SET subsidized_entity_id = NULL WHERE subsidized_entity_id = ?', [id]);
    await db.run('DELETE FROM subsidized_entities WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete subsidized entity error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת הגוף המסובסד' });
  }
});

// קליטת תשלום חודשי מגוף מסובסד (מקזז את פער הסבסוד — לא נכנס להכנסות המסחריות!)
router.post('/payments', async (req, res) => {
  try {
    const entity_id = Number(req.body?.entity_id);
    const amount = Number(req.body?.amount);
    const date = String(req.body?.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
    const payment_method = normalizePaymentMethod(req.body?.payment_method, 'cash');
    const notes = String(req.body?.notes || '').trim();

    if (!Number.isInteger(entity_id) || entity_id <= 0 || Number.isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: 'יש לבחור גוף מסובסד ולהזין סכום תשלום חיובי' });
      return;
    }

    const db = await getDb();
    const entity = await db.get<DbEntity>('SELECT * FROM subsidized_entities WHERE id = ?', [entity_id]);
    if (!entity) {
      res.status(404).json({ error: 'הגוף המסובסד לא נמצא' });
      return;
    }

    const created = await db.run(
      `INSERT INTO subsidized_payments (entity_id, date, amount, payment_method, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [entity_id, date, round2(amount), payment_method, notes || `תשלום חודשי — ${entity.name}`]
    );

    res.status(201).json({ id: created.lastInsertId });
  } catch (err) {
    console.error('Create subsidized payment error:', err);
    res.status(500).json({ error: 'שגיאה בקליטת התשלום החודשי' });
  }
});

router.delete('/payments/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    await db.run('DELETE FROM subsidized_payments WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete subsidized payment error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת רשומת התשלום' });
  }
});

export default router;
