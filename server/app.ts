import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { getDb } from './db.ts';
import authRoutes from './routes/auth.ts';
import productsRoutes from './routes/products.ts';
import ordersRoutes from './routes/orders.ts';
import usersRoutes from './routes/users.ts';
import financeRoutes from './routes/finance.ts';
import inventoryRoutes from './routes/inventory.ts';
import settingsRoutes from './routes/settings.ts';
import publicRoutes from './routes/public.ts';
import subsidizedRoutes from './routes/subsidized.ts';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      const db = await getDb();
      res.json({ ok: true, engine: db.isPostgres ? 'postgresql' : 'sqlite' });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.use('/api/public', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/subsidized', subsidizedRoutes);

  // Serve built frontend in production (supports both /friday-stall-manager/ base and /)
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distDir)) {
    app.use('/friday-stall-manager', express.static(distDir));
    app.use(express.static(distDir));
    app.get('/', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
    app.get('/friday-stall-manager/*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  return app;
}
