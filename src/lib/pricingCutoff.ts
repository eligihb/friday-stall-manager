export interface FridayPricingStatus {
  mode: 'preorder' | 'stall';
  isPreorder: boolean;
  cutoffIso: string;
  badgeText: string;
  shortBadge: string;
}

/**
 * כלל השעה 06:00 ביום שישי:
 * - לפני יום שישי הנבחר בשעה 06:00 בבוקר -> מחיר הזמנה מוקדמת (preorder_price)
 * - מיום שישי הנבחר בשעה 06:00 בבוקר ואילך -> מחיר דוכן רגיל (customer_price)
 */
export function getFridayPricingStatus(fridayIso: string, now = new Date()): FridayPricingStatus {
  const cleanDate = fridayIso.slice(0, 10);
  const cutoff = new Date(`${cleanDate}T06:00:00`);
  const isPreorder = now.getTime() < cutoff.getTime();

  if (isPreorder) {
    return {
      mode: 'preorder',
      isPreorder: true,
      cutoffIso: `${cleanDate}T06:00:00`,
      badgeText: 'מחירון הזמנה מוקדמת פעיל (עד יום שישי בשעה 06:00)',
      shortBadge: 'מחיר הזמנה מוקדמת',
    };
  }

  return {
    mode: 'stall',
    isPreorder: false,
    cutoffIso: `${cleanDate}T06:00:00`,
    badgeText: 'חלף מועד ההזמנה המוקדמת (06:00) — חל מחירון דוכן רגיל',
    shortBadge: 'מחיר דוכן רגיל',
  };
}
