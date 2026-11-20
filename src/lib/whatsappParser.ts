import type { AdminProduct, User } from '../types';

export interface ParsedOrderLine {
  product: AdminProduct;
  quantity: number;
  rawSegment: string;
}

export interface WhatsAppParseResult {
  items: ParsedOrderLine[];
  unmatched: string[];
  matchedUser?: User | null;
}

// מילון כינויים ומיפויים מדויקים (כינויים ארוכים וספציפיים נבדקים תמיד לפני קצרים!)
const PRODUCT_ALIASES: Record<string, string[]> = {
  // מארזי שלישייה (12 ₪)
  'מארז פיתה זעתר': [
    'מארז פיתה זעתר',
    'מארזי פיתה זעתר',
    'מארז פיתות זעתר',
    'פיתה זעתר',
    'פיתות זעתר',
    'פיתת זעתר',
    'זעתר',
  ],
  'מארז פיתה שומשום': [
    'מארז פיתה שומשום',
    'מארזי פיתה שומשום',
    'מארז פיתות שומשום',
    'פיתה שומשום',
    'פיתות שומשום',
    'פיתת שומשום',
    'שומשום',
  ],
  'מארז לחם שום': [
    'מארז לחם שום',
    'מארזי לחם שום',
    'לחם שום',
    'לחמי שום',
  ],
  'מארז זלביה': [
    'מארז זלביה',
    'מארזי זלביה',
    'מארז זלביות',
    'זלביה',
    'זלביות',
    'זלאביה',
    'זלאביות',
  ],

  // פרנות — ספציפיים לפני פרנה קטנה/רגילה
  'פרנה שום': ['פרנה שום', 'פרנות שום', 'פרנת שום', 'פראנה שום', 'פרנה עם שום'],
  'פרנה גדולה': ['פרנה גדולה', 'פרנות גדולות', 'פראנה גדולה', 'פרנה גדול'],
  'פרנה קטנה': ['פרנה קטנה', 'פרנות קטנות', 'פרנה', 'פרנות', 'פראנה', 'פראנות', 'פרנה רגילה'],
  'פרנה': ['פרנה', 'פרנות', 'פראנה', 'פראנות', 'פרנה קטנה', 'פרנה רגילה'],

  // פיתות פלאפל (רק כשצוין פלאפל במפורש!)
  "פיתה פלאפל 10 יח'": [
    "פיתה פלאפל 10 יח'",
    'פיתה פלאפל 10',
    'פיתות פלאפל 10',
    'פיתה פלאפל',
    'פיתות פלאפל',
    'חבילת פיתות פלאפל',
    'פלאפל',
  ],

  // סלוף / סאלוף — כולל מיפוי מדויק של "פיתות" / "פיתה" בודדות לסאלוף
  'סלוף': ['סלוף', 'סלופים', 'סאלוף', 'סאלופים', 'סלופ', 'סאלופ', 'פיתות', 'פיתה'],
  'סאלוף': ['סאלוף', 'סאלופים', 'סלוף', 'סלופים', 'סלופ', 'סאלופ', 'פיתות', 'פיתה'],

  // חילבה / חלבה (כולל אות חיבור "ו")
  'חילבה גדולה': [
    'חילבה גדולה',
    'חילבה גדול',
    'חלבה גדולה',
    'חלבה גדול',
    'וחילבה גדולה',
    'וחילבה גדול',
    'וחלבה גדולה',
    'וחלבה גדול',
    "חילבה 500 ג'",
    'חילבה 500 גרם',
    'חילבה 500',
    'חצי קילו חילבה',
    'חילבה חצי קילו',
  ],
  "חילבה 500 ג'": [
    "חילבה 500 ג'",
    'חילבה 500 גרם',
    'חילבה 500',
    'חצי קילו חילבה',
    'חילבה חצי קילו',
    'חילבה גדולה',
    'חילבה גדול',
    'חלבה גדולה',
    'חלבה גדול',
    'וחילבה גדולה',
    'וחילבה גדול',
    'וחלבה גדולה',
    'וחלבה גדול',
  ],
  'חילבה קטנה': [
    'חילבה קטנה',
    'חילבה קטן',
    'חלבה קטנה',
    'חלבה קטן',
    'וחילבה קטנה',
    'וחלבה קטנה',
    'חילבה',
    'חלבה',
    'וחילבה',
    'וחלבה',
    "חילבה 250 ג'",
    'חילבה 250 גרם',
    'חילבה 250',
    'רבע קילו חילבה',
  ],
  "חילבה 250 ג'": [
    "חילבה 250 ג'",
    'חילבה 250 גרם',
    'חילבה 250',
    'רבע קילו חילבה',
    'חילבה קטנה',
    'חילבה קטן',
    'חלבה קטנה',
    'חלבה קטן',
    'וחילבה קטנה',
    'וחלבה קטנה',
    'חילבה',
    'חלבה',
    'וחילבה',
    'וחלבה',
  ],

  'לחוח': ['לחוח', 'לחוחים', 'לחוך', 'לאחוח', 'לחוחה'],
  'לאפה': ['לאפה', 'לאפות', 'לפה', 'לפות'],
  'כובנית': ['כובנית', 'כובניות', 'כובנות', 'כובנה קטנה', 'קובנית', 'קובניות', 'כובנה'],
  'קובנה': ['קובנה', 'קובנות', 'קובנאות', 'קובנה גדולה', 'קובנת'],
  "ג'חנון": ["ג'חנון", "ג'חנונים", 'ג׳חנון', 'ג׳חנונים', 'גחנון', 'גחנונים'],
  'סחוג': ['סחוג', 'סחוגים', 'זחוג', 'סחוג ירוק', 'סחוג אדום'],
};

// מוצרים ישנים שהוחלפו במארזי השלישייה — לא ניתן להם לגנוב את כינויי המארזים אם המארז קיים
const LEGACY_REPLACED_BY_TRIO: Record<string, string> = {
  זלביה: 'מארז זלביה',
  'פיתה זעתר': 'מארז פיתה זעתר',
};

const HEBREW_NUMBERS: Record<string, number> = {
  אחד: 1,
  אחת: 1,
  זוג: 2,
  שניים: 2,
  שתיים: 2,
  שני: 2,
  שתי: 2,
  שלוש: 3,
  שלושה: 3,
  ארבע: 4,
  ארבעה: 4,
  חמש: 5,
  חמישה: 5,
  שש: 6,
  שישה: 6,
  שבע: 7,
  שבעה: 7,
  שמונה: 8,
  תשע: 9,
  תשעה: 9,
  עשר: 10,
  עשרה: 10,
};

function normalizeHebrew(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/[״"׳'`]/g, "'")
    .replace(/[•▪◦*!?.:_~()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripGreetingsAndFillers(segment: string): string {
  let s = segment;
  const fillerPatterns = [
    /(^|\s)(היי|הי|שלום|אהלן)\s+אליאב(?=\s|$)/gi,
    /(^|\s)אליאב\s+(היי|הי|שלום|בוקר טוב|ערב טוב|אהלן|תודה)(?=\s|$)/gi,
    /(^|\s)(אני אשמח להזמין|אשמח להזמין|רציתי להזמין|רוצה להזמין|אפשר להזמין|תודה רבה|תודה מראש|בוקר טוב|צהריים טובים|ערב טוב|שבת שלום|שבוע טוב|חג שמח|מה נשמע|מה קורה|מה שלומך)(?=\s|$)/gi,
    /(^|\s)(אליאב|היי|הי|שלום|אהלן|תודה|בבקשה|אפשר|רוצה|להזמין|הזמנה ל?שישי|לשישי|וגם|גם|ועוד|עוד|אני צריך|אני צריכה|אני אשמח|אשמח ל?|תכין לי|תשמור לי)(?=\s|$)/gi,
    /(^|\s)(יח'|יחידות|יח|חתיכות|מארזים|קופסאות|קופסה|מארז)(?=\s|$)/gi,
  ];
  for (let pass = 0; pass < 3; pass++) {
    for (const pat of fillerPatterns) {
      s = s.replace(pat, ' ');
    }
    s = s.replace(/\s+/g, ' ').trim();
  }
  return s;
}

export function getPhoneLast4(phone?: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : digits;
}

/**
 * התאמת לקוח או ספק לפי תחילת שם (עדיפות ראשונה), שם חלקי או 4 ספרות אחרונות של הטלפון
 */
export function filterUsersByNameOrPhone(query: string, users: User[]): User[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  const qDigits = q.replace(/\D/g, '');

  const scored: Array<{ user: User; score: number }> = [];
  for (const u of users) {
    const nameLower = u.name.trim().toLowerCase();
    const phoneDigits = String(u.phone || '').replace(/\D/g, '');
    let score = 0;

    if (nameLower.startsWith(q)) {
      score = 4;
    } else if (nameLower.split(/\s+/).some((word) => word.startsWith(q))) {
      score = 3;
    } else if (qDigits.length >= 2 && phoneDigits && phoneDigits.endsWith(qDigits)) {
      score = 3;
    } else if (nameLower.includes(q)) {
      score = 2;
    } else if (qDigits.length >= 2 && phoneDigits && phoneDigits.includes(qDigits)) {
      score = 1;
    } else if (u.email.toLowerCase().includes(q)) {
      score = 1;
    }

    if (score > 0) scored.push({ user: u, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.user);
}

export function detectUserInMessage(rawText: string, users: User[]): User | null {
  if (!users.length || !rawText.trim()) return null;

  // 1. חיפוש לפי 4 ספרות אחרונות של מספר טלפון שמופיעות בהודעה (4+ ספרות רצופות שאינן כמות מוצר)
  const phoneTokens = rawText.match(/\b\d{4,10}\b/g) || [];
  for (const token of phoneTokens) {
    const last4 = token.slice(-4);
    const matched = users.find((u) => {
      const pDigits = String(u.phone || '').replace(/\D/g, '');
      return pDigits.length >= 4 && pDigits.endsWith(last4);
    });
    if (matched) return matched;
  }

  // 2. חיפוש לפי שם לקוח/ספק המופיע בהודעה (מהשם הארוך לקצר)
  const lower = rawText.toLowerCase();
  const sortedByName = [...users].sort((a, b) => b.name.length - a.name.length);
  for (const u of sortedByName) {
    if (u.name.trim().length >= 3 && lower.includes(u.name.trim().toLowerCase())) {
      return u;
    }
  }

  return null;
}

export function parseWhatsAppMessage(
  rawText: string,
  products: AdminProduct[],
  users: User[] = []
): WhatsAppParseResult {
  const cleaned = rawText
    .replace(/\r/g, '\n')
    .replace(/\s+ו(?=\d)/g, ', ')
    .trim();

  if (!cleaned) return { items: [], unmatched: [], matchedUser: null };

  const matchedUser = detectUserInMessage(rawText, users);
  const productNames = new Set(products.map((p) => p.name));

  // בניית מועמדי כינויים (מהארוך לקצר כך ש"פיתה זעתר" ו"פיתה פלאפל" יותאמו לפני "פיתה" -> סאלוף, ו"פרנה גדולה" לפני "פרנה")
  const candidates: Array<{ alias: string; normalizedAlias: string; product: AdminProduct; priority: number }> = [];

  for (const prod of products) {
    const replacedBy = LEGACY_REPLACED_BY_TRIO[prod.name];
    // אם המוצר הוא הגרסה הישנה של מארז שלישייה והמארז קיים, דלג עליו כדי שהכינויים יתמפו למארז ה-12 ₪
    if (replacedBy && productNames.has(replacedBy)) {
      continue;
    }

    const customAliases = PRODUCT_ALIASES[prod.name] || [];
    const allAliases = Array.from(new Set([prod.name, ...customAliases]));
    for (const alias of allAliases) {
      candidates.push({
        alias,
        normalizedAlias: normalizeHebrew(alias).toLowerCase(),
        product: prod,
        priority: prod.name.startsWith('מארז ') ? 2 : 1,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.normalizedAlias.length - a.normalizedAlias.length || b.priority - a.priority
  );

  const rawSegments = cleaned
    .split(/[\n,;+.!/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const aggregated = new Map<number, { product: AdminProduct; quantity: number; rawSegments: string[] }>();
  const unmatched: string[] = [];

  for (const rawSeg of rawSegments) {
    const seg = stripGreetingsAndFillers(normalizeHebrew(rawSeg));
    if (!seg) continue;

    // אם המקטע כולו הוא רק מספר טלפון/4 ספרות של הלקוח שזוהה — אל תדווח כשגיאה
    if (matchedUser) {
      const last4 = getPhoneLast4(matchedUser.phone);
      if (last4 && seg.replace(/\D/g, '').endsWith(last4) && !/[א-ת]/.test(seg)) {
        continue;
      }
      if (seg.toLowerCase() === matchedUser.name.toLowerCase()) {
        continue;
      }
    }

    let working = seg.toLowerCase();
    let matchedAnyInSeg = false;

    // פיצול וחילוץ של מספר פריטים צמודים באותה שורה (למשל "2 סלוף 3 לחוח" או "סלוף וחלבה גדול")
    for (let iter = 0; iter < 8; iter++) {
      let matchedCandidate: (typeof candidates)[number] | null = null;
      let matchIdx = -1;
      for (const c of candidates) {
        const idx = working.indexOf(c.normalizedAlias);
        if (idx >= 0) {
          matchedCandidate = c;
          matchIdx = idx;
          break;
        }
      }
      if (!matchedCandidate) break;
      matchedAnyInSeg = true;

      const beforeText = working.slice(0, matchIdx).trim();
      const afterText = working.slice(matchIdx + matchedCandidate.normalizedAlias.length).trim();

      let quantity = 1;
      let consumedBefore = beforeText;
      let consumedAfter = afterText;

      const beforeNum = beforeText.match(/(\d+)\s*$/);
      const afterNum = afterText.match(/^(\d+)\b/);

      if (beforeNum) {
        quantity = Math.max(1, parseInt(beforeNum[1], 10));
        consumedBefore = beforeText.slice(0, beforeNum.index).trim();
      } else if (afterNum && !candidates.some((c) => afterText.slice(afterNum[0].length).trim().startsWith(c.normalizedAlias))) {
        quantity = Math.max(1, parseInt(afterNum[1], 10));
        consumedAfter = afterText.slice(afterNum[0].length).trim();
      } else {
        for (const [word, val] of Object.entries(HEBREW_NUMBERS)) {
          if (new RegExp(`(^|\\s)${word}$`).test(beforeText)) {
            quantity = val;
            consumedBefore = beforeText.replace(new RegExp(`(^|\\s)${word}$`), '').trim();
            break;
          }
          if (new RegExp(`^${word}($|\\s)`).test(afterText)) {
            quantity = val;
            consumedAfter = afterText.replace(new RegExp(`^${word}($|\\s)`), '').trim();
            break;
          }
        }
      }

      const existing = aggregated.get(matchedCandidate.product.id);
      if (existing) {
        existing.quantity += quantity;
        existing.rawSegments.push(rawSeg);
      } else {
        aggregated.set(matchedCandidate.product.id, {
          product: matchedCandidate.product,
          quantity,
          rawSegments: [rawSeg],
        });
      }

      working = `${consumedBefore} ${consumedAfter}`.replace(/\s+/g, ' ').trim();
      if (!working) break;
    }

    if (!matchedAnyInSeg) {
      if (/\d/.test(seg) || seg.length >= 4) {
        unmatched.push(rawSeg);
      }
    } else if (working) {
      const leftover = stripGreetingsAndFillers(working).replace(/^[ו\s]+/, '').trim();
      if (leftover.length >= 3 && /[א-ת]/.test(leftover)) {
        unmatched.push(leftover);
      }
    }
  }

  return {
    items: Array.from(aggregated.values()).map((entry) => ({
      product: entry.product,
      quantity: entry.quantity,
      rawSegment: entry.rawSegments.join(' | '),
    })),
    unmatched,
    matchedUser,
  };
}
