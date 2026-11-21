export type CustomerPriceMode = 'auto' | 'preorder' | 'stall';

export const DEFAULT_ADMIN_NAME = 'אליאב מנהל';
export const DEFAULT_ADMIN_WHATSAPP = '0542452100';

export const DEFAULT_MENU_SHARE_TEMPLATE = `🫓 *{שם_עסק}*
🔥 מאפים תימניים טריים לשבת!
✨ המחירים הם בהזמנה מוקדמת.

{פריטים}

🛒 להזמנה מהירה אונליין:
{קישור}`;

export const DEFAULT_CUSTOMER_ORDER_TEMPLATE = `🫓 *{שם_עסק} — הזמנה חדשה לאישור (#{מספר})*
👤 שם: *{שם}*
📱 טלפון: {טלפון}
📅 {תאריך}
━━━━━━━━━━━━━━━━
{פריטים}
━━━━━━━━━━━━━━━━
💳 *סה״כ לתשלום: {סהכ}*
{הערות}
⏳ סטטוס: ממתין לאישור מנהל

✅ *אישור מיידי להזמנה:*
{קישור_אישור}
👁️ *צפייה ועריכה ביישומון:*
{קישור_צפייה}`;

export interface StorefrontConfig {
  customerPriceMode: CustomerPriceMode;
  hiddenProductIds: Record<number, boolean>;
  menuShareTemplate: string;
  customerOrderTemplate: string;
}

const CONFIG_KEY = 'fsm_storefront_config_v1';

export function loadStorefrontConfig(): StorefrontConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StorefrontConfig>;
      return {
        customerPriceMode: parsed.customerPriceMode || 'auto',
        hiddenProductIds: parsed.hiddenProductIds || {},
        menuShareTemplate: parsed.menuShareTemplate || DEFAULT_MENU_SHARE_TEMPLATE,
        customerOrderTemplate: parsed.customerOrderTemplate || DEFAULT_CUSTOMER_ORDER_TEMPLATE,
      };
    }
  } catch {
    // ignore
  }
  return {
    customerPriceMode: 'auto',
    hiddenProductIds: {},
    menuShareTemplate: DEFAULT_MENU_SHARE_TEMPLATE,
    customerOrderTemplate: DEFAULT_CUSTOMER_ORDER_TEMPLATE,
  };
}

export function saveStorefrontConfig(cfg: StorefrontConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    // ignore
  }
}

export function isProductVisibleToCustomers(
  productId: number,
  cfg?: StorefrontConfig
): boolean {
  const c = cfg || loadStorefrontConfig();
  return !c.hiddenProductIds[productId];
}

export function setProductCustomerVisibility(productId: number, visible: boolean): StorefrontConfig {
  const cfg = loadStorefrontConfig();
  const nextHidden = { ...cfg.hiddenProductIds };
  if (visible) delete nextHidden[productId];
  else nextHidden[productId] = true;
  const next: StorefrontConfig = { ...cfg, hiddenProductIds: nextHidden };
  saveStorefrontConfig(next);
  return next;
}

/**
 * חלון הזמנה מוקדמת אוטומטי: מיום ראשון (00:00) עד יום שישי בשעה 06:00 בבוקר.
 * ניתן לעקיפה מלאה דרך הגדרות המנהל (preorder / stall).
 */
export function isCustomerPreorderActive(
  fridayIso: string,
  mode?: CustomerPriceMode,
  now = new Date()
): boolean {
  const effectiveMode = mode || loadStorefrontConfig().customerPriceMode;
  if (effectiveMode === 'preorder') return true;
  if (effectiveMode === 'stall') return false;

  // במצב אוטומטי: פתוח מיום ראשון 00:00 עד שישי 06:00
  const cleanDate = fridayIso.slice(0, 10);
  const fridayCutoff = new Date(`${cleanDate}T06:00:00`);
  const day = now.getDay(); // 0=ראשון ... 5=שישי, 6=שבת
  if (day === 6) return false; // שבת — עדיין לא נפתח חלון ראשון-שישי
  return now.getTime() < fridayCutoff.getTime();
}
