import { Router } from 'express';
import { getDb } from '../db.ts';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../auth.ts';

const router = Router();

interface DbProduct {
  id: number;
  name: string;
  cost_price: number;
  supplier_price: number;
  preorder_price: number;
  customer_price: number;
  image_url?: string | null;
  sort_order?: number;
  is_active: number | boolean;
}

interface DbPriceHistory {
  id: number;
  product_id: number;
  effective_date: string;
  cost_price: number;
  supplier_price: number;
  preorder_price: number;
  customer_price: number;
  created_at: string;
}

function normalizeProduct(p: DbProduct) {
  return {
    id: Number(p.id),
    name: p.name,
    cost_price: Number(p.cost_price),
    supplier_price: Number(p.supplier_price),
    preorder_price: Number(p.preorder_price),
    customer_price: Number(p.customer_price),
    image_url: p.image_url || null,
    sort_order: Number(p.sort_order ?? p.id),
    is_active: Boolean(p.is_active),
  };
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = await getDb();
    const role = req.user!.role;

    if (role === 'admin') {
      const rows = await db.query<DbProduct>('SELECT * FROM products ORDER BY sort_order ASC, id ASC');
      res.json({ products: rows.map(normalizeProduct) });
      return;
    }

    const activeFilter = db.isPostgres ? 'is_active = TRUE' : 'is_active = 1';
    const rows = await db.query<DbProduct>(`SELECT * FROM products WHERE ${activeFilter} ORDER BY sort_order ASC, id ASC`);

    if (role === 'supplier') {
      res.json({
        products: rows.map((p) => ({
          id: Number(p.id),
          name: p.name,
          supplier_price: Number(p.supplier_price),
          image_url: p.image_url || null,
          is_active: Boolean(p.is_active),
        })),
      });
      return;
    }

    res.json({
      products: rows.map((p) => ({
        id: Number(p.id),
        name: p.name,
        preorder_price: Number(p.preorder_price),
        customer_price: Number(p.customer_price),
        image_url: p.image_url || null,
        is_active: Boolean(p.is_active),
      })),
    });
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת מחירון המוצרים' });
  }
});

router.get('/:id/history', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const rows = await db.query<DbPriceHistory>(
      'SELECT * FROM product_price_history WHERE product_id = ? ORDER BY effective_date DESC, id DESC',
      [id]
    );
    res.json({
      history: rows.map((h) => ({
        id: Number(h.id),
        product_id: Number(h.product_id),
        effective_date: String(h.effective_date).slice(0, 10),
        cost_price: Number(h.cost_price),
        supplier_price: Number(h.supplier_price),
        preorder_price: Number(h.preorder_price),
        customer_price: Number(h.customer_price),
        created_at: h.created_at,
      })),
    });
  } catch (err) {
    console.error('Product history error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית המחירים' });
  }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const cost_price = Number(req.body?.cost_price);
    const supplier_price = Number(req.body?.supplier_price);
    const preorder_price = Number(req.body?.preorder_price);
    const customer_price = Number(req.body?.customer_price);
    const image_url = req.body?.image_url ? String(req.body.image_url).trim() : null;
    const is_active = req.body?.is_active !== undefined ? Boolean(req.body.is_active) : true;
    const effective_date = String(req.body?.effective_date || new Date().toISOString().slice(0, 10)).slice(0, 10);

    if (!name) {
      res.status(400).json({ error: 'יש להזין שם מוצר' });
      return;
    }
    if ([cost_price, supplier_price, preorder_price, customer_price].some((v) => Number.isNaN(v) || v < 0)) {
      res.status(400).json({ error: 'יש להזין מחירים תקינים (0 ומעלה)' });
      return;
    }

    const db = await getDb();
    const dup = await db.get<{ id: number }>('SELECT id FROM products WHERE name = ?', [name]);
    if (dup) {
      res.status(409).json({ error: 'מוצר בשם זה כבר קיים במחירון' });
      return;
    }

    const maxRow = await db.get<{ max_ord: number }>('SELECT COALESCE(MAX(sort_order), 0) as max_ord FROM products');
    const nextSortOrder = Number(maxRow?.max_ord ?? 0) + 1;

    const inserted = await db.run(
      `INSERT INTO products (name, cost_price, supplier_price, preorder_price, customer_price, image_url, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, cost_price, supplier_price, preorder_price, customer_price, image_url, nextSortOrder, db.isPostgres ? is_active : is_active ? 1 : 0]
    );

    if (inserted.lastInsertId) {
      await db.run(
        `INSERT INTO product_price_history (product_id, effective_date, cost_price, supplier_price, preorder_price, customer_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [inserted.lastInsertId, effective_date, cost_price, supplier_price, preorder_price, customer_price]
      );
    }

    const product = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [inserted.lastInsertId]);
    res.status(201).json({ product: product ? normalizeProduct(product) : null });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'שגיאה בהוספת מוצר חדש' });
  }
});

router.put('/reorder', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.ordered_ids)
      ? req.body.ordered_ids.map((v: unknown) => Number(v)).filter((n: number) => Number.isInteger(n) && n > 0)
      : [];
    if (orderedIds.length === 0) {
      res.status(400).json({ error: 'יש לספק רשימת מזהי מוצרים לסידור' });
      return;
    }
    const db = await getDb();
    for (let idx = 0; idx < orderedIds.length; idx++) {
      await db.run('UPDATE products SET sort_order = ? WHERE id = ?', [idx + 1, orderedIds[idx]]);
    }
    const rows = await db.query<DbProduct>('SELECT * FROM products ORDER BY sort_order ASC, id ASC');
    res.json({ ok: true, products: rows.map(normalizeProduct) });
  } catch (err) {
    console.error('Reorder products error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון סדר המוצרים' });
  }
});

router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'מזהה מוצר לא תקין' });
      return;
    }

    const db = await getDb();
    const existing = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'המוצר לא נמצא' });
      return;
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : existing.name;
    const cost_price = req.body?.cost_price !== undefined ? Number(req.body.cost_price) : Number(existing.cost_price);
    const supplier_price =
      req.body?.supplier_price !== undefined ? Number(req.body.supplier_price) : Number(existing.supplier_price);
    const preorder_price =
      req.body?.preorder_price !== undefined ? Number(req.body.preorder_price) : Number(existing.preorder_price);
    const customer_price =
      req.body?.customer_price !== undefined ? Number(req.body.customer_price) : Number(existing.customer_price);
    const image_url =
      req.body?.image_url !== undefined
        ? String(req.body.image_url || '').trim() || null
        : existing.image_url || null;
    const is_active =
      req.body?.is_active !== undefined ? Boolean(req.body.is_active) : Boolean(existing.is_active);
    const today = new Date().toISOString().slice(0, 10);
    const effective_date = String(req.body?.effective_date || today).slice(0, 10);

    if (!name || [cost_price, supplier_price, preorder_price, customer_price].some((v) => Number.isNaN(v) || v < 0)) {
      res.status(400).json({ error: 'נתוני המוצר אינם תקינים' });
      return;
    }

    const pricesChanged =
      cost_price !== Number(existing.cost_price) ||
      supplier_price !== Number(existing.supplier_price) ||
      preorder_price !== Number(existing.preorder_price) ||
      customer_price !== Number(existing.customer_price);

    if (pricesChanged) {
      const existingHist = await db.get<{ id: number }>(
        'SELECT id FROM product_price_history WHERE product_id = ? AND effective_date = ?',
        [id, effective_date]
      );
      if (existingHist) {
        await db.run(
          `UPDATE product_price_history
           SET cost_price = ?, supplier_price = ?, preorder_price = ?, customer_price = ?
           WHERE id = ?`,
          [cost_price, supplier_price, preorder_price, customer_price, existingHist.id]
        );
      } else {
        await db.run(
          `INSERT INTO product_price_history (product_id, effective_date, cost_price, supplier_price, preorder_price, customer_price)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [id, effective_date, cost_price, supplier_price, preorder_price, customer_price]
        );
      }
    }

    // אם תאריך התחולה הוא היום או בעבר — מעדכנים מיד גם את המחיר הפעיל בטבלת המוצרים
    const applyNow = effective_date <= today || !pricesChanged;
    if (applyNow) {
      await db.run(
        `UPDATE products
         SET name = ?, cost_price = ?, supplier_price = ?, preorder_price = ?, customer_price = ?, image_url = ?, is_active = ?
         WHERE id = ?`,
        [
          name,
          cost_price,
          supplier_price,
          preorder_price,
          customer_price,
          image_url,
          db.isPostgres ? is_active : is_active ? 1 : 0,
          id,
        ]
      );
    } else {
      await db.run(
        `UPDATE products SET name = ?, image_url = ?, is_active = ? WHERE id = ?`,
        [name, image_url, db.isPostgres ? is_active : is_active ? 1 : 0, id]
      );
    }

    const updated = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [id]);
    res.json({
      product: updated ? normalizeProduct(updated) : null,
      scheduled: !applyNow,
      effective_date,
    });
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: 'שגיאה בעדכון המוצר' });
  }
});

router.patch('/:id/toggle', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    const existing = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'המוצר לא נמצא' });
      return;
    }

    const nextActive = !Boolean(existing.is_active);
    await db.run('UPDATE products SET is_active = ? WHERE id = ?', [
      db.isPostgres ? nextActive : nextActive ? 1 : 0,
      id,
    ]);
    const updated = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [id]);
    res.json({ product: updated ? normalizeProduct(updated) : null });
  } catch (err) {
    console.error('Toggle product error:', err);
    res.status(500).json({ error: 'שגיאה בשינוי סטטוס המוצר' });
  }
});

router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'מזהה מוצר לא תקין' });
      return;
    }

    const db = await getDb();
    const existing = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) {
      res.status(404).json({ error: 'המוצר לא נמצא' });
      return;
    }

    const usedInOrders = await db.get<{ cnt: number | string }>(
      'SELECT COUNT(*) as cnt FROM order_items WHERE product_id = ?',
      [id]
    );
    const orderRefs = Number(usedInOrders?.cnt ?? 0);
    if (orderRefs > 0) {
      res.status(409).json({
        error: `לא ניתן למחוק את "${existing.name}" לצמיתות כי הוא מופיע ב-${orderRefs} שורות הזמנה היסטוריות. ניתן להשבית אותו כדי להסיר מהתפריט.`,
        in_orders: true,
      });
      return;
    }

    await db.run('DELETE FROM waste_logs WHERE product_id = ?', [id]);
    await db.run('DELETE FROM friday_inventory WHERE product_id = ?', [id]);
    await db.run('DELETE FROM product_price_history WHERE product_id = ?', [id]);
    await db.run('DELETE FROM products WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'שגיאה במחיקת המוצר' });
  }
});

export default router;
