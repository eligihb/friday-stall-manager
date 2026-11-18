import type { AdminProduct } from '../types';

export interface ParsedOrderLine {
  product: AdminProduct;
  quantity: number;
  rawSegment: string;
}

export interface WhatsAppParseResult {
  items: ParsedOrderLine[];
  unmatched: string[];
}

// מילון כינויים, ריבוי ושגיאות כתיב נפוצות בעברית
const PRODUCT_ALIASES: Record<string, string[]> = {
  'פרנה שום': ['פרנה שום', 'פרנות שום', 'פרנת שום', 'פראנה שום', 'פרנה עם שום'],
  'פרנה גדולה': ['פרנה גדולה', 'פרנות גדולות', 'פראנה גדולה', 'פרנה גדול'],
  'פרנה': ['פרנה', 'פרנות', 'פראנה', 'פראנות'],
  'פיתה פלאפל 10 יח\'': [
    'פיתה פלאפל 10 יח\'',
    'פיתה פלאפל 10',
    'פיתות פלאפל 10',
    'פיתה פלאפל',
    'פיתות פלאפל',
    'חבילת פיתות פלאפל',
    'פלאפל',
  ],
  'פיתה זעתר': ['פיתה זעתר', 'פיתות זעתר', 'פיתת זעתר', 'זעתר'],
  'חילבה 500 ג\'': [
    'חילבה 500 ג\'',
    'חילבה 500 גרם',
    'חילבה 500',
    'חצי קילו חילבה',
    'חילבה חצי קילו',
    'חילבה גדולה',
    'חילבה גדול',
  ],
  'חילבה 250 ג\'': [
    'חילבה 250 ג\'',
    'חילבה 250 גרם',
    'חילבה 250',
    'רבע קילו חילבה',
    'חילבה קטנה',
    'חילבה קטן',
    'חילבה',
  ],
  'לחוח': ['לחוח', 'לחוחים', 'לחוך', 'לאחוח', 'לחוחה'],
  'סאלוף': ['סאלוף', 'סאלופים', 'סלוף', 'סלופים', 'סלופ', 'סאלופ'],
  'לאפה': ['לאפה', 'לאפות', 'לפה', 'לפות'],
  'כובנית': ['כובנית', 'כובניות', 'כובנות', 'כובנה קטנה', 'קובנית', 'קובניות', 'כובנה'],
  'קובנה': ['קובנה', 'קובנות', 'קובנאות', 'קובנה גדולה', 'קובנת'],
  'זלביה': ['זלביה', 'זלביות', 'זלאביה', 'זלאביות'],
  "ג'חנון": ["ג'חנון", "ג'חנונים", 'ג׳חנון', 'ג׳חנונים', 'גחנון', 'גחנונים'],
  'סחוג': ['סחוג', 'סחוגים', 'זחוג', 'סחוג ירוק', 'סחוג אדום'],
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
    .replace(/[״"׳'`]/g, "'")
    .replace(/[•▪◦*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNoise(segment: string): string {
  return segment
    .replace(/^(היי|הי|שלום|אהלן|בוקר טוב|צהריים טובים|ערב טוב|תודה|בבקשה|אפשר|רוצה|להזמין|הזמנה ל?שישי|לשישי|וגם|גם|ועוד|עוד|אני צריך|אני צריכה|אשמח ל?)\b/gi, '')
    .replace(/\b(בבקשה|תודה רבה|תודה|שבת שלום|יח'|יחידות|יח|חתיכות|מארזים|קופסאות|קופסה|מארז)\b/gi, '')
    .trim();
}

export function parseWhatsAppMessage(rawText: string, products: AdminProduct[]): WhatsAppParseResult {
  const cleaned = rawText
    .replace(/\r/g, '\n')
    .replace(/\s+ו(?=\d)/g, ', ') // "2 קובנה ו3 לחוח" -> "2 קובנה, 3 לחוח"
    .trim();

  if (!cleaned) return { items: [], unmatched: [] };

  // Build ordered alias candidates (longest aliases first to prevent "פרנה" matching before "פרנה שום")
  const candidates: Array<{ alias: string; normalizedAlias: string; product: AdminProduct }> = [];

  for (const prod of products) {
    const customAliases = PRODUCT_ALIASES[prod.name] || [];
    const allAliases = Array.from(new Set([prod.name, ...customAliases]));
    for (const alias of allAliases) {
      candidates.push({
        alias,
        normalizedAlias: normalizeHebrew(alias).toLowerCase(),
        product: prod,
      });
    }
  }

  candidates.sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length);

  // Split by newlines, commas, semicolons, plus signs
  const rawSegments = cleaned
    .split(/[\n,;+]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const aggregated = new Map<number, { product: AdminProduct; quantity: number; rawSegments: string[] }>();
  const unmatched: string[] = [];

  for (const rawSeg of rawSegments) {
    const seg = stripNoise(normalizeHebrew(rawSeg));
    if (!seg) continue;

    // Skip pure greetings without numbers or products
    const segLower = seg.toLowerCase();

    let matchedCandidate: (typeof candidates)[number] | null = null;
    for (const c of candidates) {
      if (segLower.includes(c.normalizedAlias)) {
        matchedCandidate = c;
        break;
      }
    }

    if (!matchedCandidate) {
      // Only report as unmatched if it actually looks like an item attempt (contains a digit or >= 3 chars not greeting)
      if (/\d/.test(seg) || seg.length >= 4) {
        unmatched.push(rawSeg);
      }
      continue;
    }

    // Remove matched alias from segment so embedded numbers like "500" in "חילבה 500" or "10" in "פיתה פלאפל 10" are NOT read as quantity!
    const remainder = segLower.replace(matchedCandidate.normalizedAlias, ' ').trim();

    let quantity = 1;
    const digitMatch = remainder.match(/(\d+)/);
    if (digitMatch) {
      quantity = Math.max(1, parseInt(digitMatch[1], 10));
    } else {
      // Check Hebrew number words in remainder
      for (const [word, val] of Object.entries(HEBREW_NUMBERS)) {
        if (new RegExp(`(^|\\s)${word}($|\\s)`).test(remainder)) {
          quantity = val;
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
  }

  return {
    items: Array.from(aggregated.values()).map((entry) => ({
      product: entry.product,
      quantity: entry.quantity,
      rawSegment: entry.rawSegments.join(' | '),
    })),
    unmatched,
  };
}
