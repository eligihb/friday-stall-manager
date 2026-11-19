import { Router } from 'express';
import { getDb } from '../db.ts';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../auth.ts';

const router = Router();

interface DbOrder {
  id: number;
  user_id: number | null;
  recipient_name: string;
  friday_date: string;
  order_type: 'customer' | 'supplier' | 'charity';
  delivery_fee: number;
  credit_discount: number;
  total_amount: number;
  paid_amount: number;
  status: 'awaiting_approval' | 'pending' | 'ready' | 'delivered';
  notes: string;
  created_at: string;
  user_name?: string;
}

interface DbOrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price_snapshot: number;
  cost_price_snapshot: number;
}

interface DbProduct {
  id: number;
  name: string;
  cost_price: number;
  supplier_price: number;
  preorder_price: number;
  customer_price: number;
  is_active: number | boolean;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = await getDb();
    const role = req.user!.role;
    const fridayDate = req.query.friday_date ? String(req.query.friday_date) : '';
    const orderType = req.query.order_type ? String(req.query.order_type) : '';
    const status = req.query.status ? String(req.query.status) : '';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (role !== 'admin') {
      conditions.push('o.user_id = ?');
      params.push(req.user!.id);
    } else if (req.query.user_id) {
      conditions.push('o.user_id = ?');
      params.push(Number(req.query.user_id));
    }
    if (fridayDate) {
      conditions.push('o.friday_date = ?');
      params.push(fridayDate);
    }
    if (orderType && role === 'admin') {
      conditions.push('o.order_type = ?');
      params.push(orderType);
    }
    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const orders = await db.query<DbOrder>(
      `SELECT o.*, u.name as user_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ${where}
       ORDER BY o.friday_date DESC, o.id DESC`,
      params
    );

    const orderIds = orders.map((o) => Number(o.id));
    let itemsByOrder = new Map<number, DbOrderItem[]>();

    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(', ');
      const items = await db.query<DbOrderItem>(
        `SELECT oi.*, p.name as product_name
         FROM order_items oi
         JOIN products p ON p.id = oi.product_id
         WHERE oi.order_id IN (${placeholders})
         ORDER BY oi.id ASC`,
        orderIds
      );
      for (const item of items) {
        const oid = Number(item.order_id);
        const list = itemsByOrder.get(oid) || [];
        list.push({
          ...item,
          id: Number(item.id),
          order_id: oid,
          product_id: Number(item.product_id),
          quantity: Number(item.quantity),
          unit_price_snapshot: Number(item.unit_price_snapshot),
          cost_price_snapshot: role === 'admin' ? Number(item.cost_price_snapshot) : 0,
        });
        itemsByOrder.set(oid, list);
      }
    }

    const hydrated = orders.map((o) => {
      const items = itemsByOrder.get(Number(o.id)) || [];
      const costTotal = role === 'admin'
        ? round2(items.reduce((acc, it) => acc + it.quantity * it.cost_price_snapshot, 0))
        : undefined;
      return {
        id: Number(o.id),
        user_id: o.user_id !== null ? Number(o.user_id) : null,
        user_name: o.user_name || null,
        recipient_name: o.recipient_name,
        friday_date: String(o.friday_date).slice(0, 10),
        order_type: o.order_type,
        delivery_fee: Number(o.delivery_fee),
        credit_discount: Number(o.credit_discount),
        total_amount: Number(o.total_amount),
        paid_amount: Number(o.paid_amount),
        status: o.status,
        notes: o.notes || '',
        created_at: o.created_at,
        items,
        ...(role === 'admin' ? { estimated_cost: costTotal } : {}),
      };
    });

    res.json({ orders: hydrated });
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת ההזמנות' });
  }
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = await getDb();
    const role = req.user!.role;

    const friday_date = String(req.body?.friday_date || '').slice(0, 10);
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const notes = String(req.body?.notes || '').trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(friday_date)) {
      res.status(400).json({ error: 'יש לבחור תאריך יום שישי תקין' });
      return;
    }

    const validItems = rawItems
      .map((it: { product_id: unknown; quantity: unknown }) => ({
        product_id: Number(it.product_id),
        quantity: Math.floor(Number(it.quantity)),
      }))
      .filter((it: { product_id: number; quantity: number }) => Number.isInteger(it.product_id) && it.quantity > 0);

    if (validItems.length === 0) {
      res.status(400).json({ error: 'יש לבחור לפחות מוצר אחד בכמות של 1 ומעלה' });
      return;
    }

    // Load products from DB for authoritative pricing
    const productIds = [...new Set(validItems.map((i: { product_id: number }) => i.product_id))];
    const placeholders = productIds.map(() => '?').join(', ');
    const dbProducts = await db.query<DbProduct>(
      `SELECT * FROM products WHERE id IN (${placeholders})`,
      productIds
    );
    const productMap = new Map(dbProducts.map((p) => [Number(p.id), p]));

    for (const it of validItems) {
      const prod = productMap.get(it.product_id);
      if (!prod) {
        res.status(400).json({ error: `מוצר #${it.product_id} לא נמצא` });
        return;
      }
      if (role !== 'admin' && !Boolean(prod.is_active)) {
        res.status(400).json({ error: `המוצר "${prod.name}" אינו פעיל כרגע` });
        return;
      }
    }

    let user_id: number | null = null;
    let recipient_name = '';
    let order_type: 'customer' | 'supplier' | 'charity' = 'customer';
    let delivery_fee = 0;
    let credit_discount = 0;
    let paid_amount = 0;
    let payment_method: 'cash' | 'bit' | 'transfer' = 'cash';
    let priceTier: 'supplier_price' | 'preorder_price' | 'customer_price' | 'charity' = 'customer_price';

    if (role === 'supplier') {
      user_id = req.user!.id;
      const u = await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [user_id]);
      recipient_name = u?.name || req.user!.name;
      order_type = 'supplier';
      priceTier = 'supplier_price';
    } else if (role === 'customer') {
      user_id = req.user!.id;
      const u = await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [user_id]);
      recipient_name = u?.name || req.user!.name;
      order_type = 'customer';
      priceTier = 'preorder_price';
    } else {
      // Admin order creation
      const reqType = String(req.body?.order_type || 'customer');
      order_type = reqType === 'supplier' || reqType === 'charity' ? reqType : 'customer';
      user_id = req.body?.user_id ? Number(req.body.user_id) : null;
      recipient_name = String(req.body?.recipient_name || '').trim();

      if (user_id && !recipient_name) {
        const u = await db.get<{ name: string }>('SELECT name FROM users WHERE id = ?', [user_id]);
        recipient_name = u?.name || '';
      }
      if (!recipient_name) {
        res.status(400).json({ error: 'יש להזין שם מקבל ההזמנה' });
        return;
      }

      delivery_fee = Math.max(0, Number(req.body?.delivery_fee || 0));
      credit_discount = Math.max(0, Number(req.body?.credit_discount || 0));
      paid_amount = Math.max(0, Number(req.body?.paid_amount || 0));
      const pm = String(req.body?.payment_method || 'cash');
      payment_method = pm === 'bit' || pm === 'transfer' ? pm : 'cash';

      if (order_type === 'charity') {
        priceTier = 'charity';
        delivery_fee = 0;
        credit_discount = 0;
        paid_amount = 0;
      } else if (order_type === 'supplier') {
        priceTier = 'supplier_price';
      } else {
        const reqTier = String(req.body?.price_tier || 'preorder_price');
        priceTier = reqTier === 'customer_price' ? 'customer_price' : 'preorder_price';
      }
    }

    let itemsSubtotal = 0;
    const preparedItems = validItems.map((it: { product_id: number; quantity: number }) => {
      const prod = productMap.get(it.product_id)!;
      const unitPrice = priceTier === 'charity' ? 0 : Number(prod[priceTier]);
      itemsSubtotal += unitPrice * it.quantity;
      return {
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price_snapshot: unitPrice,
        cost_price_snapshot: Number(prod.cost_price),
      };
    });

    const total_amount =
      order_type === 'charity' ? 0 : Math.max(0, round2(itemsSubtotal + delivery_fee - credit_discount));

    const inserted = await db.run(
      `INSERT INTO orders (user_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, total_amount, paid_amount, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [user_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, total_amount, paid_amount, notes]
    );

    const orderId = inserted.lastInsertId!;
    for (const item of preparedItems) {
      await db.run(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, item.unit_price_snapshot, item.cost_price_snapshot]
      );
    }

    // Update linked user open balance (negative = debt owed by user)
    if (user_id && order_type !== 'charity') {
      const unpaidDelta = round2(total_amount - paid_amount);
      if (unpaidDelta !== 0) {
        await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [unpaidDelta, user_id]);
      }
    }

    // Record income transaction if paid upfront
    if (paid_amount > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      await db.run(
        `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
         VALUES (?, ?, 'income', ?, ?, ?, ?, ?)`,
        [
          todayStr,
          friday_date,
          order_type === 'supplier' ? 'תשלום הזמנת ספק' : 'תשלום הזמנת לקוח',
          payment_method,
          paid_amount,
          user_id,
          `הזמנה #${orderId} — ${recipient_name}`,
        ]
      );
    }

    res.status(201).json({ id: orderId, total_amount });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת ההזמנה' });
  }
});

router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const existing = await db.get<DbOrder>('SELECT * FROM orders WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'ההזמנה לא נמצאה' });
      return;
    }

    const friday_date = req.body?.friday_date
      ? String(req.body.friday_date).slice(0, 10)
      : String(existing.friday_date).slice(0, 10);
    const recipient_name =
      req.body?.recipient_name !== undefined
        ? String(req.body.recipient_name).trim()
        : existing.recipient_name;
    const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : existing.notes;
    const status =
      req.body?.status && ['awaiting_approval', 'pending', 'ready', 'delivered'].includes(req.body.status)
        ? req.body.status
        : existing.status;

    const delivery_fee =
      existing.order_type === 'charity'
        ? 0
        : req.body?.delivery_fee !== undefined
        ? Math.max(0, Number(req.body.delivery_fee) || 0)
        : Number(existing.delivery_fee);
    const credit_discount =
      existing.order_type === 'charity'
        ? 0
        : req.body?.credit_discount !== undefined
        ? Math.max(0, Number(req.body.credit_discount) || 0)
        : Number(existing.credit_discount);

    let newTotal = Number(existing.total_amount);

    if (Array.isArray(req.body?.items)) {
      const validItems = req.body.items
        .map((it: { product_id: unknown; quantity: unknown }) => ({
          product_id: Number(it.product_id),
          quantity: Math.floor(Number(it.quantity)),
        }))
        .filter((it: { product_id: number; quantity: number }) => Number.isInteger(it.product_id) && it.quantity > 0);

      if (validItems.length === 0) {
        res.status(400).json({ error: 'יש להשאיר לפחות מוצר אחד בהזמנה' });
        return;
      }

      const productIds = [...new Set(validItems.map((i: { product_id: number }) => i.product_id))];
      const placeholders = productIds.map(() => '?').join(', ');
      const dbProducts = await db.query<DbProduct>(
        `SELECT * FROM products WHERE id IN (${placeholders})`,
        productIds
      );
      const productMap = new Map(dbProducts.map((p) => [Number(p.id), p]));

      const priceTier =
        existing.order_type === 'charity'
          ? 'charity'
          : existing.order_type === 'supplier'
          ? 'supplier_price'
          : req.body?.price_tier === 'customer_price'
          ? 'customer_price'
          : 'preorder_price';

      let subtotal = 0;
      const prepared = validItems.map((it: { product_id: number; quantity: number }) => {
        const prod = productMap.get(it.product_id);
        if (!prod) throw new Error(`מוצר #${it.product_id} לא נמצא`);
        const unitPrice = priceTier === 'charity' ? 0 : Number(prod[priceTier]);
        subtotal += unitPrice * it.quantity;
        return {
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price_snapshot: unitPrice,
          cost_price_snapshot: Number(prod.cost_price),
        };
      });

      newTotal =
        existing.order_type === 'charity' ? 0 : Math.max(0, round2(subtotal + delivery_fee - credit_discount));

      await db.run('DELETE FROM order_items WHERE order_id = ?', [id]);
      for (const item of prepared) {
        await db.run(
          `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot)
           VALUES (?, ?, ?, ?, ?)`,
          [id, item.product_id, item.quantity, item.unit_price_snapshot, item.cost_price_snapshot]
        );
      }
    } else if (existing.order_type !== 'charity') {
      // Recompute total from existing items if only delivery_fee / credit_discount changed
      const curItems = await db.query<{ quantity: number; unit_price_snapshot: number }>(
        'SELECT quantity, unit_price_snapshot FROM order_items WHERE order_id = ?',
        [id]
      );
      const subtotal = curItems.reduce(
        (s, it) => s + Number(it.quantity) * Number(it.unit_price_snapshot),
        0
      );
      newTotal = Math.max(0, round2(subtotal + delivery_fee - credit_discount));
    }

    const oldTotal = Number(existing.total_amount);
    const totalDiff = round2(newTotal - oldTotal);

    await db.run(
      `UPDATE orders
       SET recipient_name = ?, friday_date = ?, delivery_fee = ?, credit_discount = ?, total_amount = ?, status = ?, notes = ?
       WHERE id = ?`,
      [recipient_name, friday_date, delivery_fee, credit_discount, newTotal, status, notes, id]
    );

    // Adjust linked user balance if total changed
    if (existing.user_id && existing.order_type !== 'charity' && totalDiff !== 0) {
      await db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [totalDiff, existing.user_id]);
    }

    res.json({ ok: true, total_amount: newTotal });
  } catch (err) {
    console.error('Full update order error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון פרטי ההזמנה' });
  }
});

router.patch('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const existing = await db.get<DbOrder>('SELECT * FROM orders WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'ההזמנה לא נמצאה' });
      return;
    }

    const status =
      req.body?.status && ['awaiting_approval', 'pending', 'ready', 'delivered'].includes(req.body.status)
        ? req.body.status
        : existing.status;
    const notes = req.body?.notes !== undefined ? String(req.body.notes) : existing.notes;
    const newPaid =
      req.body?.paid_amount !== undefined ? Math.max(0, Number(req.body.paid_amount)) : Number(existing.paid_amount);
    const paymentMethodRaw = String(req.body?.payment_method || 'cash');
    const paymentMethod =
      paymentMethodRaw === 'bit' || paymentMethodRaw === 'transfer' ? paymentMethodRaw : 'cash';

    const paidDiff = round2(newPaid - Number(existing.paid_amount));

    await db.run('UPDATE orders SET status = ?, paid_amount = ?, notes = ? WHERE id = ?', [
      status,
      newPaid,
      notes,
      id,
    ]);

    if (paidDiff !== 0) {
      if (existing.user_id) {
        await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [paidDiff, existing.user_id]);
      }
      if (paidDiff > 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        await db.run(
          `INSERT INTO transactions (date, friday_date, type, category, payment_method, amount, user_id, notes)
           VALUES (?, ?, 'income', ?, ?, ?, ?, ?)`,
          [
            todayStr,
            String(existing.friday_date).slice(0, 10),
            existing.order_type === 'supplier' ? 'תשלום הזמנת ספק' : 'תשלום הזמנת לקוח',
            paymentMethod,
            paidDiff,
            existing.user_id,
            `עדכון תשלום להזמנה #${id} — ${existing.recipient_name}`,
          ]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Update order error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון ההזמנה' });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const existing = await db.get<DbOrder>('SELECT * FROM orders WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'ההזמנה לא נמצאה' });
      return;
    }

    if (existing.user_id && existing.order_type !== 'charity') {
      const unpaid = round2(Number(existing.total_amount) - Number(existing.paid_amount));
      if (unpaid !== 0) {
        await db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [unpaid, existing.user_id]);
      }
    }

    await db.run('DELETE FROM orders WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete order error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת ההזמנה' });
  }
});

export default router;
