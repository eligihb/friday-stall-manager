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
  is_active: number | boolean;
}

function normalizeProduct(p: DbProduct) {
  return {
    id: Number(p.id),
    name: p.name,
    cost_price: Number(p.cost_price),
    supplier_price: Number(p.supplier_price),
    preorder_price: Number(p.preorder_price),
    customer_price: Number(p.customer_price),
    is_active: Boolean(p.is_active),
  };
}

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = await getDb();
    const role = req.user!.role;

    if (role === 'admin') {
      const rows = await db.query<DbProduct>('SELECT * FROM products ORDER BY id ASC');
      res.json({ products: rows.map(normalizeProduct) });
      return;
    }

    const activeFilter = db.isPostgres ? 'is_active = TRUE' : 'is_active = 1';
    const rows = await db.query<DbProduct>(`SELECT * FROM products WHERE ${activeFilter} ORDER BY id ASC`);

    if (role === 'supplier') {
      res.json({
        products: rows.map((p) => ({
          id: Number(p.id),
          name: p.name,
          supplier_price: Number(p.supplier_price),
          is_active: Boolean(p.is_active),
        })),
      });
      return;
    }

    // customer role
    res.json({
      products: rows.map((p) => ({
        id: Number(p.id),
        name: p.name,
        preorder_price: Number(p.preorder_price),
        customer_price: Number(p.customer_price),
        is_active: Boolean(p.is_active),
      })),
    });
  } catch (err) {
    console.error('List products error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת מחירון המוצרים' });
  }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const cost_price = Number(req.body?.cost_price);
    const supplier_price = Number(req.body?.supplier_price);
    const preorder_price = Number(req.body?.preorder_price);
    const customer_price = Number(req.body?.customer_price);
    const is_active = req.body?.is_active !== undefined ? Boolean(req.body.is_active) : true;

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

    const inserted = await db.run(
      `INSERT INTO products (name, cost_price, supplier_price, preorder_price, customer_price, is_active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, cost_price, supplier_price, preorder_price, customer_price, db.isPostgres ? is_active : is_active ? 1 : 0]
    );

    const product = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [inserted.lastInsertId]);
    res.status(201).json({ product: product ? normalizeProduct(product) : null });
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: 'שגיאה בהוספת מוצר חדש' });
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
    const is_active =
      req.body?.is_active !== undefined ? Boolean(req.body.is_active) : Boolean(existing.is_active);

    if (!name || [cost_price, supplier_price, preorder_price, customer_price].some((v) => Number.isNaN(v) || v < 0)) {
      res.status(400).json({ error: 'נתוני המוצר אינם תקינים' });
      return;
    }

    await db.run(
      `UPDATE products
       SET name = ?, cost_price = ?, supplier_price = ?, preorder_price = ?, customer_price = ?, is_active = ?
       WHERE id = ?`,
      [name, cost_price, supplier_price, preorder_price, customer_price, db.isPostgres ? is_active : is_active ? 1 : 0, id]
    );

    const updated = await db.get<DbProduct>('SELECT * FROM products WHERE id = ?', [id]);
    res.json({ product: updated ? normalizeProduct(updated) : null });
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

export default router;
