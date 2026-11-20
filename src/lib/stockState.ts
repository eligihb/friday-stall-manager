export interface ProductStockEntry {
  in_stock: boolean;
  qty?: number;
}

const STOCK_STORAGE_KEY = 'fsm_product_stock_state_v1';

export function loadStockMap(): Record<number, ProductStockEntry> {
  try {
    const raw = localStorage.getItem(STOCK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStockMap(map: Record<number, ProductStockEntry>): void {
  try {
    localStorage.setItem(STOCK_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

export function isProductInStock(productId: number, stockMap?: Record<number, ProductStockEntry>): boolean {
  const map = stockMap || loadStockMap();
  const entry = map[productId];
  if (!entry) return true;
  if (entry.in_stock === false) return false;
  if (entry.qty !== undefined && entry.qty <= 0) return false;
  return true;
}
