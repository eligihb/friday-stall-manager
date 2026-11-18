import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.ts';
import { AUTH_COOKIE, requireAuth, signToken, type AuthenticatedRequest, type UserRole } from '../auth.ts';

const router = Router();

interface DbUser {
  id: number;
  name: string;
  phone: string;
  email: string;
  password_hash: string;
  role: UserRole;
  balance: number;
  notes: string;
  created_at: string;
}

function sanitizeUser(u: DbUser) {
  return {
    id: Number(u.id),
    name: u.name,
    phone: u.phone || '',
    email: u.email,
    role: u.role,
    balance: Number(u.balance ?? 0),
    notes: u.notes || '',
    created_at: u.created_at,
  };
}

function setAuthCookie(res: import('express').Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'יש להזין אימייל וסיסמה' });
      return;
    }

    const db = await getDb();
    const user = await db.get<DbUser>('SELECT * FROM users WHERE LOWER(email) = ?', [email]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      res.status(401).json({ error: 'פרטי ההתחברות שגויים' });
      return;
    }

    const token = signToken({
      id: Number(user.id),
      email: user.email,
      name: user.name,
      role: user.role,
    });
    setAuthCookie(res, token);
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'שגיאה בתהליך ההתחברות' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const requestedRole = String(req.body?.role || 'customer');

    if (!name || !email || password.length < 6) {
      res.status(400).json({ error: 'יש למלא שם מלא, אימייל וסיסמה בת 6 תווים לפחות' });
      return;
    }

    // Public signup permits supplier or customer; admin role is assigned by an existing admin
    const role: UserRole = requestedRole === 'supplier' ? 'supplier' : 'customer';

    const db = await getDb();
    const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    if (existing) {
      res.status(409).json({ error: 'כתובת האימייל כבר קיימת במערכת' });
      return;
    }

    const hash = bcrypt.hashSync(password, 10);
    const created = await db.run(
      `INSERT INTO users (name, phone, email, password_hash, role, balance, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, phone, email, hash, role, 0, '']
    );

    const newUser = await db.get<DbUser>('SELECT * FROM users WHERE id = ?', [created.lastInsertId]);
    if (!newUser) {
      res.status(500).json({ error: 'שגיאה ביצירת החשבון' });
      return;
    }

    const token = signToken({
      id: Number(newUser.id),
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
    });
    setAuthCookie(res, token);
    res.status(201).json({ user: sanitizeUser(newUser) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'שגיאה ביצירת החשבון' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const db = await getDb();
    const user = await db.get<DbUser>('SELECT * FROM users WHERE id = ?', [req.user!.id]);
    if (!user) {
      res.clearCookie(AUTH_COOKIE, { path: '/' });
      res.status(401).json({ error: 'המשתמש לא נמצא' });
      return;
    }
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'שגיאה בטעינת פרטי המשתמש' });
  }
});

export default router;
