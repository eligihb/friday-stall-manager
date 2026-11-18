export type UserRole = 'admin' | 'supplier' | 'customer';

export interface User {
  id: number;
  name: string;
  phone: string;
  email: string;
  role: UserRole;
  balance: number;
  notes: string;
  created_at?: string;
}

export interface Product {
  id: number;
  name: string;
  cost_price?: number;
  supplier_price?: number;
  preorder_price?: number;
  customer_price?: number;
  is_active: boolean;
}

export interface AdminProduct {
  id: number;
  name: string;
  cost_price: number;
  supplier_price: number;
  preorder_price: number;
  customer_price: number;
  is_active: boolean;
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
export type OrderStatus = 'pending' | 'ready' | 'delivered';

export interface Order {
  id: number;
  user_id: number | null;
  user_name?: string | null;
  recipient_name: string;
  friday_date: string;
  order_type: OrderType;
  delivery_fee: number;
  credit_discount: number;
  total_amount: number;
  paid_amount: number;
  status: OrderStatus;
  notes: string;
  created_at: string;
  items: OrderItem[];
  estimated_cost?: number;
}

export type PaymentMethod = 'cash' | 'bit' | 'transfer';

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
