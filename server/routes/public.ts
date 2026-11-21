import { Router } from 'express';
import { getDb, getNextFridayDate } from '../db.ts';

const router = Router();

interface DbProduct {
  id: number;
  name: string;
  cost_price: number;
  preorder_price: number;
  customer_price: number;
  image_url?: string | null;
  is_active: number | boolean;
}

interface DbSettings {
  business_name: string;
  admin_whatsapp_phone: string;
  default_delivery_fee: number;
  whatsapp_footer: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isPreorderActiveForFriday(fridayDate: string, now = new Date()): boolean {
  const cutoff = new Date(`${fridayDate.slice(0, 10)}T05:00:00`);
  return now.getTime() < cutoff.getTime();
}

// תפריט ציבורי ללא התחברות — חושף אך ורק מחירי הזמנה מוקדמת ומחירי דוכן למוצרים פעילים
router.get('/storefront', async (_req, res) => {
  try {
    const db = await getDb();
    const activeFilter = db.isPostgres ? 'is_active = TRUE' : 'is_active = 1';
    const products = await db.query<DbProduct>(
      `SELECT id, name, preorder_price, customer_price, image_url, is_active FROM products WHERE ${activeFilter} ORDER BY sort_order ASC, id ASC`
    );
    const settings = await db.get<DbSettings>('SELECT * FROM business_settings WHERE id = 1');

    res.json({
      business_name: settings?.business_name || 'דוכן שישי תימני',
      admin_whatsapp_phone: settings?.admin_whatsapp_phone || '0542452100',
      whatsapp_footer: settings?.whatsapp_footer || 'שבת שלום ומבורכת! 🕯️',
      products: products.map((p) => ({
        id: Number(p.id),
        name: p.name,
        preorder_price: Number(p.preorder_price),
        customer_price: Number(p.customer_price),
        image_url: p.image_url || null,
        is_active: true,
      })),
    });
  } catch (err) {
    console.error('Public storefront error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת תפריט ההזמנות' });
  }
});

// קליטת הזמנת לקוח ציבורית ללא הרשמה -> נשמרת בסטטוס awaiting_approval (לא נספרת ברכש מהמאפייה עד אישור מנהל)
router.post('/orders', async (req, res) => {
  try {
    const db = await getDb();
    const friday_date = String(req.body?.friday_date || getNextFridayDate()).slice(0, 10);
    const recipient_name = String(req.body?.recipient_name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const notesRaw = String(req.body?.notes || '').trim();
    const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(friday_date)) {
      res.status(400).json({ error: 'יש לבחור תאריך יום שישי תקין' });
      return;
    }
    if (!recipient_name || !phone) {
      res.status(400).json({ error: 'יש להזין שם מלא ומספר טלפון' });
      return;
    }

    const validItems = rawItems
      .map((it: { product_id: unknown; quantity: unknown }) => ({
        product_id: Number(it.product_id),
        quantity: Math.floor(Number(it.quantity)),
      }))
      .filter((it: { product_id: number; quantity: number }) => Number.isInteger(it.product_id) && it.quantity > 0);

    if (validItems.length === 0) {
      res.status(400).json({ error: 'יש לבחור לפחות מוצר אחד להזמנה' });
      return;
    }

    const ids = [...new Set(validItems.map((i: { product_id: number }) => i.product_id))];
    const placeholders = ids.map(() => '?').join(', ');
    const dbProducts = await db.query<DbProduct>(
      `SELECT * FROM products WHERE id IN (${placeholders})`,
      ids
    );
    const prodMap = new Map(dbProducts.map((p) => [Number(p.id), p]));

    const isPreorder = isPreorderActiveForFriday(friday_date);
    let total_amount = 0;
    const prepared: Array<{
      product_id: number;
      product_name: string;
      quantity: number;
      unit_price_snapshot: number;
      cost_price_snapshot: number;
    }> = [];

    for (const it of validItems) {
      const prod = prodMap.get(it.product_id);
      if (!prod || !Boolean(prod.is_active)) {
        res.status(400).json({ error: 'אחד המוצרים שנבחרו אינו זמין כרגע' });
        return;
      }
      const unitPrice = isPreorder ? Number(prod.preorder_price) : Number(prod.customer_price);
      total_amount += unitPrice * it.quantity;
      prepared.push({
        product_id: it.product_id,
        product_name: prod.name,
        quantity: it.quantity,
        unit_price_snapshot: unitPrice,
        cost_price_snapshot: Number(prod.cost_price),
      });
    }

    total_amount = round2(total_amount);
    const combinedNotes = [`טלפון: ${phone}`, notesRaw].filter(Boolean).join(' | ');

    // מניעת כפילויות לפי מספר טלפון קיים
    const phoneDigits = phone.replace(/\D/g, '');
    const phoneTail = phoneDigits.length >= 9 ? phoneDigits.slice(-9) : phoneDigits;
    let matchedUserId: number | null = null;
    if (phoneTail.length >= 7) {
      const existingUsers = await db.query<{ id: number; phone: string }>(
        "SELECT id, phone FROM users WHERE role != 'admin'"
      );
      const found = existingUsers.find((u) => {
        const d = String(u.phone || '').replace(/\D/g, '');
        return (d.length >= 9 ? d.slice(-9) : d) === phoneTail;
      });
      if (found) {
        matchedUserId = Number(found.id);
      } else {
        const createdUser = await db.run(
          `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
           VALUES (?, ?, ?, '', 'customer', 0, 'נרשם אוטומטית מתפריט הלקוחות')`,
          [recipient_name, phone, `cust_${Date.now()}@teimani.local`]
        );
        matchedUserId = createdUser.lastInsertId ?? null;
      }
    }

    const inserted = await db.run(
      `INSERT INTO orders (user_id, recipient_name, friday_date, order_type, delivery_fee, credit_discount, total_amount, paid_amount, status, notes)
       VALUES (?, ?, ?, 'customer', 0, 0, ?, 0, 'awaiting_approval', ?)`,
      [matchedUserId, recipient_name, friday_date, total_amount, combinedNotes]
    );
    const orderId = inserted.lastInsertId!;

    for (const item of prepared) {
      await db.run(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price_snapshot, cost_price_snapshot)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.product_id, item.quantity, item.unit_price_snapshot, item.cost_price_snapshot]
      );
    }

    const settings = await db.get<DbSettings>('SELECT * FROM business_settings WHERE id = 1');

    res.status(201).json({
      id: orderId,
      customer_id: matchedUserId,
      user_id: matchedUserId,
      friday_date,
      recipient_name,
      phone,
      pricing_mode: isPreorder ? 'preorder' : 'stall',
      total_amount,
      status: 'awaiting_approval',
      items: prepared.map((p) => ({
        product_id: p.product_id,
        product_name: p.product_name,
        quantity: p.quantity,
        unit_price: p.unit_price_snapshot,
      })),
      business_name: settings?.business_name || 'דוכן שישי תימני',
      admin_whatsapp_phone: settings?.admin_whatsapp_phone || '0542452100',
      whatsapp_footer: settings?.whatsapp_footer || 'שבת שלום ומבורכת! 🕯️',
    });
  } catch (err) {
    console.error('Public create order error:', err);
    res.status(500).json({ error: 'שגיאה בשליחת ההזמנה' });
  }
});

export default router;
