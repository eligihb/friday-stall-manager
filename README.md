# המטבח התימני — מערכת ניהול דוכן שישי ומאפייה סיטונאית

אפליקציית Full-Stack בעברית מלאה (`dir="rtl"`) לניהול מאפייה סיטונאית ודוכן שישי: מחירון מוצרים ב-4 מדרגות מחיר, ניהול הזמנות, היערכות אפייה ומלאי דוכן, תזרים כספי והוצאות קבועות, אימות משתמשים והרשאות RBAC (מנהל / ספק / לקוח).

## הרצה מהירה

```bash
npm install
npm run dev
```

- ממשק משתמש (Vite): `http://localhost:5173`
- שרת API (Express): `http://localhost:3001`

לבנייה והרצה כשרת מאוחד (Production):

```bash
npm run build
npm start
```

## חיבור למסד נתונים בענן (PostgreSQL / Supabase)

כברירת מחדל המערכת שומרת נתונים באופן מקומי בקובץ SQLite (`data/hamitbach.db`) וזורעת אוטומטית את כל 15 המוצרים וחשבונות ההדגמה.

לחיבור למסד ענן (Supabase / Neon / Railway):
1. הריצו את קובץ הסכמה [supabase/schema.sql](./supabase/schema.sql) במסד ה-PostgreSQL (כולל RLS ומחירון זרוע).
2. צרו קובץ `.env` על בסיס `.env.example` והגדירו `DATABASE_URL` ו-`JWT_SECRET`.

## חשבונות הדגמה (סיסמה לכולם: `123456`)
- **מנהל (`admin`)**: `admin@teimani.co.il`
- **ספק (`supplier`)**: `supplier@teimani.co.il`
- **לקוח (`customer`)**: `customer@teimani.co.il`
