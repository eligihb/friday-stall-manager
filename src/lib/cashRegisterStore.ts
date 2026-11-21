export const ISRAELI_DENOMINATIONS = [
  { value: 200, label: '200 ₪', kind: 'bill' as const, colorCls: 'from-sky-600 to-blue-800 border-sky-300 text-white' },
  { value: 100, label: '100 ₪', kind: 'bill' as const, colorCls: 'from-amber-500 to-orange-700 border-amber-300 text-white' },
  { value: 50, label: '50 ₪', kind: 'bill' as const, colorCls: 'from-emerald-600 to-green-800 border-emerald-300 text-white' },
  { value: 20, label: '20 ₪', kind: 'bill' as const, colorCls: 'from-rose-600 to-red-800 border-rose-300 text-white' },
  { value: 10, label: '10 ₪', kind: 'coin' as const, colorCls: 'from-amber-400 via-slate-200 to-amber-500 border-amber-500 text-slate-900' },
  { value: 5, label: '5 ₪', kind: 'coin' as const, colorCls: 'from-slate-300 to-slate-500 border-slate-400 text-slate-900' },
  { value: 2, label: '2 ₪', kind: 'coin' as const, colorCls: 'from-slate-200 to-slate-400 border-slate-400 text-slate-900' },
  { value: 1, label: '1 ₪', kind: 'coin' as const, colorCls: 'from-sky-100 to-slate-300 border-slate-400 text-slate-900' },
  { value: 0.5, label: '0.5 ₪', kind: 'coin' as const, colorCls: 'from-amber-300 to-yellow-600 border-amber-500 text-slate-950' },
];

export interface FridayCashRegisterEntry {
  fridayDate: string;
  openingCounts: Record<string, number>;
  closingCounts: Record<string, number>;
  openingManualTotal: number | null;
  closingManualTotal: number | null;
  openingTotal: number;
  closingTotal: number;
  netCashRevenue: number;
  updatedAt: string;
}

export type WasteDisposition = 'next_week' | 'partial' | 'lost';

export interface ProductWasteConfig {
  productId: number;
  quantity: number;
  disposition: WasteDisposition;
  salvagePct: number; // 0..100 (% saved/sold)
  manualSalvageValue: number | null; // optional manual saved ILS
  notes?: string;
}

const CASH_REGISTER_KEY = 'fsm_cash_register_v1';
const WASTE_CONFIG_KEY = 'fsm_waste_config_v1';

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function computeCountsTotal(counts: Record<string, number>): number {
  let sum = 0;
  for (const d of ISRAELI_DENOMINATIONS) {
    const c = Math.max(0, Number(counts[String(d.value)]) || 0);
    sum += c * d.value;
  }
  return round2(sum);
}

export function loadAllCashRegisters(): Record<string, FridayCashRegisterEntry> {
  try {
    const raw = localStorage.getItem(CASH_REGISTER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadFridayCashRegister(fridayDate: string): FridayCashRegisterEntry {
  const all = loadAllCashRegisters();
  if (all[fridayDate]) return all[fridayDate];
  return {
    fridayDate,
    openingCounts: {},
    closingCounts: {},
    openingManualTotal: null,
    closingManualTotal: null,
    openingTotal: 0,
    closingTotal: 0,
    netCashRevenue: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function saveFridayCashRegister(entry: FridayCashRegisterEntry): FridayCashRegisterEntry {
  const openingFromCounts = computeCountsTotal(entry.openingCounts);
  const closingFromCounts = computeCountsTotal(entry.closingCounts);
  const openingTotal =
    entry.openingManualTotal !== null && entry.openingManualTotal >= 0
      ? round2(entry.openingManualTotal)
      : openingFromCounts;
  const closingTotal =
    entry.closingManualTotal !== null && entry.closingManualTotal >= 0
      ? round2(entry.closingManualTotal)
      : closingFromCounts;
  const netCashRevenue = Math.max(0, round2(closingTotal - openingTotal));

  const normalized: FridayCashRegisterEntry = {
    ...entry,
    openingTotal,
    closingTotal,
    netCashRevenue,
    updatedAt: new Date().toISOString(),
  };
  try {
    const all = loadAllCashRegisters();
    all[entry.fridayDate] = normalized;
    localStorage.setItem(CASH_REGISTER_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
  return normalized;
}

export function loadFridayWasteConfigs(fridayDate: string): Record<number, ProductWasteConfig> {
  try {
    const raw = localStorage.getItem(WASTE_CONFIG_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw);
    return (all && all[fridayDate]) || {};
  } catch {
    return {};
  }
}

export function saveFridayWasteConfigs(
  fridayDate: string,
  configs: Record<number, ProductWasteConfig>
): void {
  try {
    const raw = localStorage.getItem(WASTE_CONFIG_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[fridayDate] = configs;
    localStorage.setItem(WASTE_CONFIG_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function calculateProductWasteLoss(
  baseUnitCost: number,
  cfg: ProductWasteConfig
): {
  grossCost: number;
  salvagedValue: number;
  netLostCost: number;
  effectiveUnitLossCost: number;
} {
  const qty = Math.max(0, Math.floor(Number(cfg.quantity) || 0));
  const grossCost = round2(qty * baseUnitCost);
  if (qty === 0) {
    return { grossCost: 0, salvagedValue: 0, netLostCost: 0, effectiveUnitLossCost: 0 };
  }
  if (cfg.disposition === 'next_week') {
    return {
      grossCost,
      salvagedValue: grossCost,
      netLostCost: 0,
      effectiveUnitLossCost: 0,
    };
  }
  if (cfg.disposition === 'lost') {
    return {
      grossCost,
      salvagedValue: 0,
      netLostCost: grossCost,
      effectiveUnitLossCost: baseUnitCost,
    };
  }
  // partial
  const salvagedValue =
    cfg.manualSalvageValue !== null && cfg.manualSalvageValue >= 0
      ? Math.min(grossCost, round2(cfg.manualSalvageValue))
      : round2(grossCost * (Math.min(100, Math.max(0, Number(cfg.salvagePct) || 0)) / 100));
  const netLostCost = Math.max(0, round2(grossCost - salvagedValue));
  const effectiveUnitLossCost = qty > 0 ? round2(netLostCost / qty) : 0;
  return { grossCost, salvagedValue, netLostCost, effectiveUnitLossCost };
}
