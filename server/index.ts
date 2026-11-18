import { createApp } from './app.ts';
import { getDb } from './db.ts';

const PORT = Number(process.env.PORT || 3001);

async function start() {
  const db = await getDb();
  const app = createApp();
  console.log(`[המטבח התימני] מסד הנתונים מוכן (${db.isPostgres ? 'PostgreSQL ענן' : 'SQLite מקומי'})`);
  app.listen(PORT, () => {
    console.log(`[המטבח התימני] השרת פועל בכתובת http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
