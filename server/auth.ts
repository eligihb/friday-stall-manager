import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export type UserRole = 'admin' | 'supplier' | 'customer';

export interface AuthPayload {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

const JWT_SECRET = process.env.JWT_SECRET || 'hamitbach-hateimani-dev-secret-key-2026';
export const AUTH_COOKIE = 'ht_session';

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '14d' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const cookieToken = req.cookies?.[AUTH_COOKIE];
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ error: 'נדרשת התחברות למערכת' });
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'תוקף ההתחברות פג, אנא התחבר מחדש' });
    return;
  }

  req.user = payload;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'נדרשת התחברות למערכת' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'אין לך הרשאה לביצוע פעולה זו' });
      return;
    }
    next();
  };
}
