// Mirror of the FastAPI response/request contracts. Monetary values arrive as
// strings (Pydantic Decimal) — keep them as strings and parse with Number() at
// the formatting boundary.

export type Money = string;

export interface Me {
  id: number;
  login: string;
  is_superuser: boolean;
}

export interface Admin {
  id: number;
  login: string;
  is_superuser: boolean;
}

export interface Client {
  id: number;
  name: string;
  phone_number: string;
  birth_date: string | null;
  balance: Money;
  cashback: Money;
}

export interface BalanceLog {
  id: number;
  change: Money;
  balance_after: Money;
  reason: string;
  order_id: number | null;
  note: string | null;
  admin_id: number;
  admin_login: string;
  created_at: string;
}

export interface CashbackLog {
  id: number;
  change: Money;
  cashback_after: Money;
  reason: string;
  order_id: number | null;
  note: string | null;
  admin_id: number;
  admin_login: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  quantity: number;
  price: Money;
  cargo: Money;
  cargo_price: Money;
  full_price: Money;
}

export interface PaymentType {
  id: number;
  name: string;
  is_debt: boolean;
  is_cashback: boolean;
  is_change: boolean;
}

export interface Currency {
  id: number;
  code: string;
  name: string;
  is_base: boolean;
}

export interface CurrencyRate {
  id: number;
  currency_id: number;
  currency_code: string;
  rate_date: string;
  rate: Money;
}

export type OrderStatus = "paid" | "delivery";

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  price: Money;
  cargo_price: Money;
}

export interface OrderPayment {
  id: number;
  payment_type_id: number;
  payment_type_name: string;
  is_debt: boolean;
  is_cashback: boolean;
  is_change: boolean;
  amount: Money;
  currency_id: number;
  currency_code: string;
  rate: Money;
  amount_base: Money;
}

export interface Order {
  id: number;
  client_id: number;
  client_name: string;
  cashback_percent: Money;
  cashback_earned: Money;
  subtotal: Money;
  total: Money;
  profit: Money;
  is_debt: boolean;
  status: OrderStatus;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  created_by: string;
  items: OrderItem[];
  payments: OrderPayment[];
}

export interface PaymentLineIn {
  payment_type_id: number;
  currency_id: number;
  amount: string;
  is_change?: boolean;
}

export interface OrderCreate {
  client_id: number;
  cashback_percent: string;
  items: { product_id: number; quantity: number }[];
  payments: PaymentLineIn[];
  status: OrderStatus;
  due_date?: string | null;
}

export interface ExpenseCategory {
  id: number;
  name: string;
}

export interface Expense {
  id: number;
  amount: Money;
  currency_id: number;
  currency_code: string;
  payment_type_id: number | null;
  payment_type_name: string | null;
  category_id: number | null;
  category_name: string | null;
  rate: Money;
  amount_base: Money;
  note: string | null;
  created_by: string;
  created_at: string;
}

export interface Summary {
  revenue: Money;
  cost: Money;
  profit: Money;
  order_count: number;
  items_sold: number;
  avg_order_value: Money;
  expenses: Money;
  net_profit: Money;
}

export interface TimeseriesPoint {
  day: string;
  revenue: Money;
  profit: Money;
}

export interface TopProduct {
  product_id: number;
  name: string;
  quantity: number;
  revenue: Money;
  profit: Money;
}

export interface TopClient {
  client_id: number;
  name: string;
  spent: Money;
  order_count: number;
}

export interface PaymentBreakdown {
  payment_type_id: number;
  name: string;
  is_debt: boolean;
  total: Money; // base so'm
  order_count: number;
}

export interface CurrencyBreakdown {
  currency_id: number;
  currency_code: string;
  payment_type_id: number;
  name: string; // payment method
  total: Money;
  total_base: Money;
  order_count: number;
}

export interface Debtor {
  client_id: number;
  name: string;
  phone_number: string;
  debt: Money;
}

export interface DeliveryRow {
  order_id: number;
  client_name: string;
  total: Money;
  due_date: string | null;
}

export interface DebtReport {
  outstanding_debt: Money;
  debt_issued: Money;
  payments_collected: Money;
  cashback_outstanding: Money;
  delivery_outstanding: Money;
  debtors: Debtor[];
  deliveries: DeliveryRow[];
}

export type SmsAudience = "all" | "debtors" | "birthdays" | "custom";
export type SmsScheduleKind = "once" | "cron";
export type SmsStatus = "scheduled" | "sending" | "done" | "failed" | "canceled";

export interface SmsBroadcast {
  id: number;
  message: string;
  audience: SmsAudience;
  custom_numbers: string | null;
  schedule_kind: SmsScheduleKind;
  cron: string | null;
  scheduled_at: string;
  starts_at: string | null;
  ends_at: string | null;
  max_runs: number | null;
  status: SmsStatus;
  last_run_at: string | null;
  run_count: number;
  recipients_count: number;
  sent_count: number;
  failed_count: number;
  created_by: string;
  created_at: string;
}

export interface SmsMessage {
  id: number;
  phone: string;
  status: "sent" | "failed";
  error: string | null;
  created_at: string;
}

export interface Health {
  ok: boolean;
  service: string;
  product_currency: string;
}
