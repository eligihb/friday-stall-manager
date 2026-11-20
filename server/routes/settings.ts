import { Router } from 'express';
import { getDb } from '../db.ts';
import { requireAuth, requireRole } from '../auth.ts';

const router = Router();

interface DbSettings {
  id: number;
  business_name: string;
  admin_whatsapp_phone: string;
  default_delivery_fee: number;
  whatsapp_footer: string;
}

router.get('/', requireAuth, async (_req, res) => {
  try {
    const db = await getDb();
    let row = await db.get<DbSettings>('SELECT * FROM business_settings WHERE id = 1');
    if (!row) {
      await db.run(
        `INSERT INTO business_settings (id, business_name, admin_whatsapp_phone, default_delivery_fee, whatsapp_footer)
         VALUES (1, 'דוכן שישי תימני', '0542452100', 0, 'שבת שלום ומבורכת! 🕯️')`
      );
      row = await db.get<DbSettings>('SELECT * FROM business_settings WHERE id = 1');
    }
    res.json({
      settings: {
        business_name: row?.business_name || 'דוכן שישי תימני',
        admin_whatsapp_phone: row?.admin_whatsapp_phone || '0542452100',
        default_delivery_fee: Number(row?.default_delivery_fee ?? 0),
        whatsapp_footer: row?.whatsapp_footer || 'שבת שלום ומבורכת! 🕯️',
      },
    });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת הגדרות העסק' });
  }
});

router.put('/', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const business_name = String(req.body?.business_name || '').trim() || 'דוכן שישי תימני';
    const admin_whatsapp_phone = String(req.body?.admin_whatsapp_phone || '').trim() || '0542452100';
    const default_delivery_fee = Math.max(0, Number(req.body?.default_delivery_fee || 0));
    const whatsapp_footer = String(req.body?.whatsapp_footer ?? '').trim();

    if (Number.isNaN(default_delivery_fee)) {
      res.status(400).json({ error: 'דמי משלוח ברירת מחדל אינם תקינים' });
      return;
    }

    const db = await getDb();
    const existing = await db.get<{ id: number }>('SELECT id FROM business_settings WHERE id = 1');
    if (existing) {
      await db.run(
        `UPDATE business_settings SET business_name = ?, admin_whatsapp_phone = ?, default_delivery_fee = ?, whatsapp_footer = ? WHERE id = 1`,
        [business_name, admin_whatsapp_phone, default_delivery_fee, whatsapp_footer]
      );
    } else {
      await db.run(
        `INSERT INTO business_settings (id, business_name, admin_whatsapp_phone, default_delivery_fee, whatsapp_footer) VALUES (1, ?, ?, ?, ?)`,
        [business_name, admin_whatsapp_phone, default_delivery_fee, whatsapp_footer]
      );
    }

    res.json({
      settings: {
        business_name,
        admin_whatsapp_phone,
        default_delivery_fee,
        whatsapp_footer,
      },
    });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'שגיאה בשמירת הגדרות העסק' });
  }
});

export default router;
