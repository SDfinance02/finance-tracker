export type AccountType = 'current' | 'savings' | 'cash' | 'broker_cash' | 'credit' | 'other';
export type TransactionType = 'income' | 'expense' | 'transfer' | 'investment';
export type SecurityType = 'ETF' | 'Stock' | 'Crypto' | 'Bond' | 'Fund' | 'Gold' | 'Other';
export type TradeSide = 'BUY' | 'SELL';

export interface SettingRow { key: string; value: string; }
export interface Category { id: number; name: string; type: 'income' | 'expense'; color: string; icon?: string | null; is_system: number; }
export interface Account {
  id: number;
  name: string;
  institution: string;
  type: AccountType;
  currency: string;
  balance: number;
  include_networth: number;
  external_ref?: string | null;
  sync_source?: string | null;
  last_sync_at?: string | null;
  created_at: string;
}
export interface Transaction {
  id: number;
  account_id?: number | null;
  account_name?: string | null;
  date: string;
  description: string;
  merchant?: string | null;
  amount: number;
  type: TransactionType;
  category_id?: number | null;
  category_name?: string | null;
  counterparty?: string | null;
  notes?: string | null;
  source: string;
  external_id?: string | null;
  status: string;
  reviewed: number;
  transfer_group_id?: string | null;
  created_at: string;
}
export interface Budget { id: number; month: string; category_id: number; category_name?: string; target: number; actual?: number; }
export interface RecurringExpense { id: number; name: string; amount: number; frequency: string; category_id?: number | null; category_name?: string; next_date?: string | null; account_id?: number | null; active: number; notes?: string | null; }
export interface Security {
  id: number;
  type: SecurityType;
  name: string;
  ticker?: string | null;
  market_symbol?: string | null;
  isin?: string | null;
  currency: string;
  broker_account_id?: number | null;
  current_price: number;
  previous_close?: number | null;
  day_change_pct?: number | null;
  high_52w?: number | null;
  last_price_at?: string | null;
  target_weight?: number | null;
  notes?: string | null;
}
export interface Trade { id: number; security_id: number; security_name?: string; account_id?: number | null; date: string; side: TradeSide; quantity: number; price: number; fees: number; currency: string; notes?: string | null; source: string; }
export interface Dividend { id: number; security_id: number; security_name?: string; account_id?: number | null; date: string; gross_amount: number; tax_amount: number; currency: string; notes?: string | null; }
export interface InvestmentTarget { id: number; security_id: number; target_type: string; trigger_value: number; action: string; notes?: string | null; }
export interface Property { id: number; name: string; address?: string | null; type: string; ownership_pct: number; purchase_value: number; purchase_costs: number; upgrades: number; latest_valuation: number; outstanding_debt: number; rental_income_annual: number; notes?: string | null; updated_at: string; }
export interface Pension { id: number; name: string; provider?: string | null; type: string; total_contributed: number; current_value: number; annual_fee_pct: number; notes?: string | null; updated_at: string; }
export interface Liability { id: number; name: string; type: string; outstanding_balance: number; interest_pct: number; monthly_payment: number; notes?: string | null; }
export interface Debtor { id: number; name: string; amount: number; due_date?: string | null; status: string; notes?: string | null; }
export interface Snapshot { id: number; date: string; cash: number; investments: number; real_estate: number; pensions: number; debtors: number; liabilities: number; net_worth: number; }
export interface InboxItem { id: number; raw_json?: string | null; date: string; description: string; amount: number; account_hint?: string | null; suggested_category_id?: number | null; confidence: number; source: string; external_id?: string | null; status: string; }
export interface CategorizationRule { id: number; pattern: string; match_field: string; category_id: number; category_name?: string; transaction_type: TransactionType; priority: number; active: number; }
export interface Connection { id: number; kind: string; provider: string; name: string; status: string; details_json?: string | null; last_sync_at?: string | null; }
export interface MarketQuote { symbol: string; price: number; previousClose?: number | null; dayChangePct?: number | null; currency?: string | null; high52w?: number | null; timestamp: string; provider: string; error?: string | null; }

export interface Position {
  security: Security;
  quantity: number;
  costBasis: number;
  averageCost: number;
  marketValue: number;
  unrealized: number;
  unrealizedPct: number;
  realized: number;
}

export interface FinanceTotals {
  cash: number;
  investments: number;
  realEstate: number;
  pensions: number;
  debtors: number;
  liabilities: number;
  netWorth: number;
}
