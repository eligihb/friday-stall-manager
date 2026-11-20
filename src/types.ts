export type UserRole = 'admin' | 'supplier' | 'customer';

export interface User {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  balance: number;
  notes: string;
  discount_percent?: number;
  custom_prices?: Record<number, number>;
  created_at?: string;
}

export type WasteType = 'none' | 'full' | 'partial';

export interface Product {
  id: number;
  name: string;
  cost_price?: number;
  supplier_price?: number;
  preorder_price?: number;
  customer_price?: number;
  image_url?: string | null;
  sort_order?: number;
  waste_type?: WasteType;
  is_active: boolean;
}

export interface AdminProduct {
  id: number;
  name: string;
  cost_price: number;
  supplier_price: number;
  preorder_price: number;
  customer_price: number;
  image_url?: string | null;
  sort_order?: number;
  waste_type?: WasteType;
  is_active: boolean;
  flavors?: string[];
}

export interface ProductPriceHistoryEntry {
  id: number;
  product_id: number;
  effective_date: string;
  cost_price: number;
  supplier_price: number;
  preorder_price: number;
  customer_price: number;
  created_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price_snapshot: number;
  cost_price_snapshot?: number;
}

export type OrderType = 'customer' | 'supplier' | 'charity';
export type OrderStatus = 'awaiting_approval' | 'pending' | 'received' | 'ready' | 'delivered';

export interface Order {
  id: number;
  user_id: number | null;
  user_name?: string | null;
  subsidized_entity_id?: number | null;
  recipient_name: string;
  friday_date: string;
  order_type: OrderType;
  delivery_fee: number;
  credit_discount: number;
  discount_percent?: number;
  include_vat?: boolean;
  vat_amount?: number;
  total_amount: number;
  paid_amount: number;
  status: OrderStatus;
  notes: string;
  created_at: string;
  items: OrderItem[];
  estimated_cost?: number;
}

export type PaymentMethod = 'cash' | 'paybox' | 'transfer';

export interface Transaction {
  id: number;
  date: string;
  friday_date: string | null;
  type: 'income' | 'expense';
  category: string;
  payment_method: PaymentMethod;
  amount: number;
  user_id: number | null;
  user_name?: string | null;
  notes: string;
}

export interface FixedExpense {
  id: number;
  name: string;
  amount: number;
  frequency: 'weekly' | 'monthly';
  payment_method: PaymentMethod;
  is_active: boolean;
}

export interface FridayInventoryItem {
  product_id: number;
  product_name: string;
  cost_price: number;
  customer_price: number;
  supplier_qty: number;
  customer_qty: number;
  charity_qty: number;
  ordered_total: number;
  extra_stall_qty: number;
  total_to_bake: number;
}

export interface SubsidizedEntity {
  id: number;
  name: string;
  phone: string;
  notes: string;
  is_active: boolean;
  total_orders: number;
  total_units: number;
  total_cost: number;
  total_paid: number;
  net_subsidy_gap: number;
}

export interface SubsidizedPayment {
  id: number;
  entity_id: number;
  entity_name: string;
  date: string;
  amount: number;
  payment_method: PaymentMethod;
  notes: string;
  created_at?: string;
}

export interface SubsidizedOverviewResponse {
  entities: SubsidizedEntity[];
  payments: SubsidizedPayment[];
  totals: {
    total_cost: number;
    total_paid: number;
    net_subsidy_expense: number;
    total_units: number;
  };
}

export interface WasteLogItem {
  product_id: number;
  product_name: string;
  waste_type: WasteType;
  waste_percent: number;
  cost_price: number;
  quantity: number;
  line_cost: number;
  notes: string;
}

export interface WasteLogResponse {
  friday_date: string;
  items: WasteLogItem[];
  total_waste_units: number;
  total_waste_cost: number;
}

export interface BusinessSettings {
  business_name: string;
  admin_whatsapp_phone: string;
  default_delivery_fee: number;
  whatsapp_footer: string;
}

export interface PaymentBucket {
  in: number;
  out: number;
  net: number;
}

export interface PnlReportResponse {
  period: { mode: 'friday' | 'month' | 'custom'; label: string };
  pnl: {
    customer_orders_revenue: number;
    supplier_orders_revenue: number;
    walkin_stall_cash: number;
    walkin_stall_paybox: number;
    walkin_stall_transfer: number;
    walkin_stall_revenue: number;
    total_revenue: number;
    orders_cogs: number;
    extra_stall_cogs: number;
    extra_stall_units: number;
    total_cogs: number;
    waste_cost: number;
    waste_units: number;
    gross_profit: number;
    gross_margin_pct: number;
    variable_expenses: number;
    bakery_cash_purchases: number;
    expense_breakdown: Array<{ category: string; amount: number }>;
    prorated_fixed_expenses: number;
    prorated_fixed_items: Array<{
      id: number;
      name: string;
      frequency: 'weekly' | 'monthly';
      base_amount: number;
      prorated_amount: number;
    }>;
    posted_fixed_expenses: number;
    net_profit: number;
    net_margin_pct: number;
  };
  subsidized: {
    period_cost: number;
    period_units: number;
    period_receipts: number;
    period_net_expense: number;
    cumulative_cost: number;
    cumulative_receipts: number;
    cumulative_net_expense: number;
    entities: Array<{
      id: number;
      name: string;
      period_cost: number;
      period_receipts: number;
      period_net_gap: number;
      cumulative_net_gap: number;
    }>;
  };
  reconciliation: {
    cash: PaymentBucket;
    paybox: PaymentBucket;
    transfer: PaymentBucket;
    digital_combined: PaymentBucket;
    total_in: number;
    total_out: number;
    total_net: number;
  };
  open_balances: {
    items: User[];
    total_receivables: number;
    total_credits: number;
  };
}
