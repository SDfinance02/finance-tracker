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

export type InsuranceStatus = 'active' | 'pending' | 'expired' | 'cancelled';
export type InsurancePremiumFrequency = 'Monthly' | 'Quarterly' | 'Semiannual' | 'Annual' | 'One-off';

export interface InsurancePolicy {
  id: number;
  name: string;
  category: string;
  provider: string;
  policy_number?: string | null;
  insured_for: string;
  status: InsuranceStatus | string;
  premium_amount: number;
  premium_frequency: InsurancePremiumFrequency | string;
  start_date?: string | null;
  renewal_date?: string | null;
  end_date?: string | null;
  coverage_amount: number;
  deductible: number;
  beneficiary?: string | null;
  broker_name?: string | null;
  broker_contact?: string | null;
  auto_renewal: number;
  document_ref?: string | null;
  notes?: string | null;
  updated_at: string;
}

export interface InsuranceClaim {
  id: number;
  policy_id?: number | null;
  policy_name?: string | null;
  incident_date: string;
  claim_reference?: string | null;
  description: string;
  claimed_amount: number;
  reimbursed_amount: number;
  status: string;
  notes?: string | null;
  updated_at: string;
}

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

export type HouseholdAssetClass = 'cash' | 'investments' | 'real_estate' | 'pensions' | 'receivables' | 'other' | 'liability';

export interface HouseholdMemberSummary {
  profile_id: string;
  profile_name: string;
  profile_kind: 'personal' | 'partner' | 'demo' | string;
  db_filename: string;
  cash: number;
  investments: number;
  real_estate: number;
  pensions: number;
  debtors: number;
  liabilities: number;
  business_equity: number;
  business_future_equity: number;
  business_growth_pct: number;
  business_volatility_pct: number;
  business_fi_eligible_pct: number;
  net_worth: number;
  monthly_income: number;
  monthly_expenses: number;
  monthly_savings: number;
  synced_at: string;
}

export interface HouseholdMonthlyCashflow {
  profile_id: string;
  month: string;
  income: number;
  expenses: number;
  savings: number;
}

export interface HouseholdSharedAsset {
  id: number;
  asset_class: HouseholdAssetClass;
  name: string;
  current_value: number;
  debt_value: number;
  personal_pct: number;
  partner_pct: number;
  liquid: number;
  notes?: string | null;
  updated_at: string;
}

export interface HouseholdSnapshot {
  id: number;
  date: string;
  personal_nw: number;
  partner_nw: number;
  shared_nw: number;
  total_nw: number;
}

export type FutureScope = 'profile' | 'household';
export type FutureEventType =
  | 'one_off_income'
  | 'one_off_expense'
  | 'monthly_income_change'
  | 'monthly_expense_change'
  | 'investment_lump_sum'
  | 'home_purchase'
  | 'retirement';

export interface FutureScenario {
  id: number;
  name: string;
  description?: string | null;
  scope: FutureScope | string;
  is_baseline: number;
  horizon_years: number;
  annual_return_pct: number;
  cash_return_pct: number;
  inflation_pct: number;
  income_growth_pct: number;
  expense_growth_pct: number;
  property_growth_pct: number;
  pension_growth_pct: number;
  surplus_to_invest_pct: number;
  withdrawal_rate_pct: number;
  include_pensions_in_fi: number;
  baseline_income_override?: number | null;
  baseline_expense_override?: number | null;
  pension_monthly_contribution: number;
  auto_fund_deficits: number;
  business_growth_pct: number | null;
  include_business_in_fi: number;
  created_at: string;
  updated_at: string;
}

export interface FutureEvent {
  id: number;
  scenario_id: number;
  name: string;
  event_type: FutureEventType | string;
  start_date: string;
  end_date?: string | null;
  amount: number;
  annual_growth_pct: number;
  details_json?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FutureStartingPoint {
  cash: number;
  investments: number;
  realEstate: number;
  pensions: number;
  receivables: number;
  liabilities: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  existingDebtMonthlyPayment: number;
  existingDebtInterestPct: number;
  businessEquity: number;
  businessGrowthPct: number;
  businessVolatilityPct: number;
  businessFiEligiblePct: number;
  sourceLabel: string;
}

export interface FutureProjectionPoint {
  date: string;
  monthIndex: number;
  cash: number;
  investments: number;
  realEstate: number;
  pensions: number;
  receivables: number;
  liabilities: number;
  businessEquity: number;
  investableAssets: number;
  netWorth: number;
  income: number;
  expenses: number;
  savings: number;
}

export interface FutureProjectionResult {
  points: FutureProjectionPoint[];
  fiDate: string | null;
  horizonNetWorth: number;
  horizonInvestable: number;
  minimumCash: number;
  cumulativeSavings: number;
  startingNetWorth: number;
}

export interface FutureRiskSettings {
  scenario_id: number;
  simulations: number;
  investment_volatility_pct: number;
  cash_volatility_pct: number;
  inflation_volatility_pct: number;
  property_volatility_pct: number;
  pension_volatility_pct: number;
  property_equity_correlation: number;
  pension_equity_correlation: number;
  early_shock_pct: number;
  early_shock_month: number;
  failure_floor: number;
  random_seed: number;
  updated_at?: string;
}

export interface MonteCarloPercentilePoint {
  date: string;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  investableP50: number;
}

export interface MonteCarloDistributionBucket {
  from: number;
  to: number;
  count: number;
}

export interface MonteCarloResult {
  scenarioId: number;
  simulations: number;
  successProbability: number;
  fiProbability: number;
  cashStressProbability: number;
  p10HorizonNetWorth: number;
  medianHorizonNetWorth: number;
  p90HorizonNetWorth: number;
  medianHorizonInvestable: number;
  medianFiDate: string | null;
  percentilePoints: MonteCarloPercentilePoint[];
  distribution: MonteCarloDistributionBucket[];
}

export interface DecisionLabRun {
  id: number;
  scenario_id: number;
  scenario_name: string;
  simulations: number;
  success_probability: number;
  fi_probability: number;
  cash_stress_probability: number;
  p10_horizon_nw: number;
  median_horizon_nw: number;
  p90_horizon_nw: number;
  median_fi_date?: string | null;
  settings_json: string;
  created_at: string;
}

export type BusinessTransactionKind = 'revenue' | 'expense' | 'salary' | 'asset' | 'tax' | 'dividend' | 'transfer' | 'other';
export type BusinessFlow = 'in' | 'out';

export interface BusinessEntity {
  id: number;
  name: string;
  company_type: string;
  enterprise_number?: string | null;
  vat_number?: string | null;
  incorporation_date?: string | null;
  fiscal_year: number;
  currency: string;
  opening_cash: number;
  small_company: number;
  use_reduced_rate: number;
  advance_payment_exempt: number;
  director_remuneration: number;
  benefits_in_kind: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusinessTransaction {
  id: number;
  entity_id: number;
  date: string;
  flow: BusinessFlow;
  kind: BusinessTransactionKind;
  category: string;
  description: string;
  counterparty?: string | null;
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  tax_deductible_pct: number;
  vat_deductible_pct: number;
  notes?: string | null;
  created_at: string;
}

export interface BusinessAsset {
  id: number;
  entity_id: number;
  name: string;
  category: string;
  purchase_date: string;
  purchase_value_ex_vat: number;
  residual_value: number;
  depreciation_years: number;
  current_book_value: number;
  tax_deductible_pct: number;
  notes?: string | null;
  updated_at: string;
}

export interface BusinessInvoice {
  id: number;
  entity_id: number;
  direction: 'receivable' | 'payable' | string;
  counterparty: string;
  invoice_number?: string | null;
  issue_date: string;
  due_date?: string | null;
  amount_incl_vat: number;
  outstanding_amount: number;
  status: string;
  notes?: string | null;
  updated_at: string;
}

export interface BusinessAdvancePayment {
  id: number;
  entity_id: number;
  tax_year: number;
  quarter: number;
  payment_date?: string | null;
  amount: number;
  notes?: string | null;
}

export interface BusinessTaxSettings {
  entity_id: number;
  tax_year: number;
  standard_cit_pct: number;
  reduced_cit_pct: number;
  reduced_threshold: number;
  minimum_remuneration: number;
  bik_limit_pct: number;
  advance_surcharge_pct: number;
  advance_base_multiplier: number;
  va1_credit_pct: number;
  va2_credit_pct: number;
  va3_credit_pct: number;
  va4_credit_pct: number;
  ordinary_dividend_wht_pct: number;
  vvprbis_wht_pct: number;
  liquidation_reserve_creation_tax_pct: number;
  liquidation_reserve_wht_pct: number;
  updated_at?: string;
}


export interface BusinessConsolidationSettings {
  entity_id: number;
  ownership_pct: number;
  valuation_mode: string;
  manual_equity_value: number;
  include_in_personal: number;
  include_in_household: number;
  include_in_future: number;
  include_in_fi: number;
  future_growth_pct: number;
  future_volatility_pct: number;
  updated_at?: string;
}

export interface BusinessBalanceItem {
  id: number;
  entity_id: number;
  name: string;
  asset_class: string;
  value: number;
  notes?: string | null;
  updated_at: string;
}

export interface BusinessValuationBreakdown {
  cash: number;
  receivables: number;
  fixedAssets: number;
  investments: number;
  realEstate: number;
  otherAssets: number;
  payables: number;
  taxLiability: number;
  otherLiabilities: number;
  grossAssets: number;
  liabilities: number;
  calculatedEquity: number;
  equity: number;
  ownerEquity: number;
}
