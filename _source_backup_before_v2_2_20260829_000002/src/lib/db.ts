import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import type {
  Account, Budget, Category, CategorizationRule, Connection, Debtor, Dividend, InboxItem,
  InvestmentTarget, Liability, Pension, Property, RecurringExpense, Security, Snapshot, Trade,
  Transaction,
} from '../types';

let dbPromise: Promise<Database> | null = null;
const SCHEMA_VERSION = 2;

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // This runs before SQLite opens the file. On each new app version the Rust
      // backend creates one pre-upgrade copy of the existing database.
      try { await invoke('prepare_database_upgrade'); } catch (error) { console.warn('Pre-upgrade backup warning', error); }
      const db = await Database.load('sqlite:finance-v2.db');
      await initialize(db);
      return db;
    })();
  }
  return dbPromise;
}

async function exec(db: Database, sql: string, bind: unknown[] = []) {
  return db.execute(sql, bind);
}

async function initialize(db: Database) {
  await exec(db, `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    color TEXT NOT NULL DEFAULT '#6b7b93',
    icon TEXT,
    is_system INTEGER NOT NULL DEFAULT 0,
    UNIQUE(name, type)
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    balance REAL NOT NULL DEFAULT 0,
    include_networth INTEGER NOT NULL DEFAULT 1,
    external_ref TEXT,
    sync_source TEXT,
    last_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    merchant TEXT,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    category_id INTEGER,
    counterparty TEXT,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'posted',
    reviewed INTEGER NOT NULL DEFAULT 1,
    transfer_group_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS categorization_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,
    match_field TEXT NOT NULL DEFAULT 'description',
    category_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL DEFAULT 'expense',
    priority INTEGER NOT NULL DEFAULT 100,
    active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    filename TEXT,
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    row_count INTEGER NOT NULL DEFAULT 0
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS inbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    raw_json TEXT,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    account_hint TEXT,
    suggested_category_id INTEGER,
    confidence REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL,
    external_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'new',
    FOREIGN KEY(suggested_category_id) REFERENCES categories(id) ON DELETE SET NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    target REAL NOT NULL DEFAULT 0,
    UNIQUE(month, category_id),
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS recurring_expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'Monthly',
    category_id INTEGER,
    next_date TEXT,
    account_id INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    notes TEXT,
    FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS securities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    ticker TEXT,
    market_symbol TEXT,
    isin TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    broker_account_id INTEGER,
    current_price REAL NOT NULL DEFAULT 0,
    previous_close REAL,
    day_change_pct REAL,
    high_52w REAL,
    last_price_at TEXT,
    target_weight REAL,
    notes TEXT,
    FOREIGN KEY(broker_account_id) REFERENCES accounts(id) ON DELETE SET NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id INTEGER NOT NULL,
    account_id INTEGER,
    date TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('BUY','SELL')),
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    fees REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    external_id TEXT UNIQUE,
    FOREIGN KEY(security_id) REFERENCES securities(id) ON DELETE CASCADE,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS dividends (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id INTEGER NOT NULL,
    account_id INTEGER,
    date TEXT NOT NULL,
    gross_amount REAL NOT NULL,
    tax_amount REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    FOREIGN KEY(security_id) REFERENCES securities(id) ON DELETE CASCADE,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS investment_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,
    trigger_value REAL NOT NULL,
    action TEXT NOT NULL,
    notes TEXT,
    FOREIGN KEY(security_id) REFERENCES securities(id) ON DELETE CASCADE
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    security_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT,
    source TEXT NOT NULL,
    UNIQUE(security_id, date),
    FOREIGN KEY(security_id) REFERENCES securities(id) ON DELETE CASCADE
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS properties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    type TEXT NOT NULL DEFAULT 'House',
    ownership_pct REAL NOT NULL DEFAULT 100,
    purchase_value REAL NOT NULL DEFAULT 0,
    purchase_costs REAL NOT NULL DEFAULT 0,
    upgrades REAL NOT NULL DEFAULT 0,
    latest_valuation REAL NOT NULL DEFAULT 0,
    outstanding_debt REAL NOT NULL DEFAULT 0,
    rental_income_annual REAL NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS pensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    provider TEXT,
    type TEXT NOT NULL DEFAULT 'Private',
    total_contributed REAL NOT NULL DEFAULT 0,
    current_value REAL NOT NULL DEFAULT 0,
    annual_fee_pct REAL NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS liabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'Other',
    outstanding_balance REAL NOT NULL DEFAULT 0,
    interest_pct REAL NOT NULL DEFAULT 0,
    monthly_payment REAL NOT NULL DEFAULT 0,
    notes TEXT
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS debtors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL DEFAULT 0,
    due_date TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    notes TEXT
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    cash REAL NOT NULL DEFAULT 0,
    investments REAL NOT NULL DEFAULT 0,
    real_estate REAL NOT NULL DEFAULT 0,
    pensions REAL NOT NULL DEFAULT 0,
    debtors REAL NOT NULL DEFAULT 0,
    liabilities REAL NOT NULL DEFAULT 0,
    net_worth REAL NOT NULL DEFAULT 0
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS cash_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL DEFAULT 0,
    current_amount REAL NOT NULL DEFAULT 0,
    target_date TEXT,
    account_id INTEGER,
    notes TEXT,
    FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE SET NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS deployment_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    drawdown_pct REAL NOT NULL,
    deploy_amount REAL NOT NULL,
    notes TEXT
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'inactive',
    details_json TEXT,
    last_sync_at TEXT
  )`);

  await runMigrations(db);
  await seed(db);
}

async function runMigrations(db: Database) {
  await exec(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  const rows = await db.select<Array<{ version: number }>>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  let current = rows[0]?.version ?? 0;

  // Existing V2.0 databases had the full baseline schema but no migration table.
  if (current === 0) {
    await exec(db, `INSERT INTO schema_migrations(version,name) VALUES (1,'V2.0 baseline')`);
    current = 1;
  }

  if (current < 2) {
    await exec(db, `CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await exec(db, 'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)');
    await exec(db, 'CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(account_id,date)');
    await exec(db, 'CREATE INDEX IF NOT EXISTS idx_trades_security_date ON trades(security_id,date)');
    await exec(db, 'CREATE INDEX IF NOT EXISTS idx_price_history_security_date ON price_history(security_id,date)');
    await exec(db, `INSERT OR REPLACE INTO app_metadata(key,value,updated_at) VALUES ('schema_version',$1,CURRENT_TIMESTAMP)`, [String(SCHEMA_VERSION)]);
    await exec(db, `INSERT INTO schema_migrations(version,name) VALUES (2,'V2.1 foundation: migration framework and indexes')`);
    current = 2;
  }

  await exec(db, `INSERT OR REPLACE INTO settings(key,value) VALUES ('schema_version',$1)`, [String(current)]);
}

async function seed(db: Database) {
  const defaults: Array<[string, 'income' | 'expense', string]> = [
    ['Salary', 'income', '#2f855a'], ['Bonus', 'income', '#3f9d72'], ['Interest', 'income', '#5a9f68'],
    ['Dividends', 'income', '#27866d'], ['Rental income', 'income', '#3a8f8a'], ['Other income', 'income', '#6b8f71'],
    ['Groceries', 'expense', '#4f7cac'], ['Dining', 'expense', '#8c6bb1'], ['Housing', 'expense', '#66788a'],
    ['Utilities', 'expense', '#5a7da8'], ['Telecom', 'expense', '#6175a6'], ['Transport', 'expense', '#4d7d8d'],
    ['Fuel', 'expense', '#6f7782'], ['Insurance', 'expense', '#6a7397'], ['Health', 'expense', '#6e8e78'],
    ['Travel', 'expense', '#587ea5'], ['Shopping', 'expense', '#8a6f91'], ['Subscriptions', 'expense', '#736b9a'],
    ['Taxes', 'expense', '#7d6d65'], ['Education', 'expense', '#5f7d95'], ['Gifts', 'expense', '#8d7485'],
    ['Other', 'expense', '#7b8794'],
  ];
  for (const [name, type, color] of defaults) {
    await exec(db, 'INSERT OR IGNORE INTO categories (name,type,color,is_system) VALUES ($1,$2,$3,1)', [name, type, color]);
  }
  await exec(db, `INSERT OR IGNORE INTO settings (key,value) VALUES ('base_currency','EUR')`);
  await exec(db, `INSERT OR IGNORE INTO settings (key,value) VALUES ('theme','light')`);
}

export async function select<T>(sql: string, bind: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, bind);
}

export async function execute(sql: string, bind: unknown[] = []) {
  const db = await getDb();
  return db.execute(sql, bind);
}

export const repo = {
  async categories(type?: string): Promise<Category[]> {
    return select<Category>(`SELECT * FROM categories ${type ? 'WHERE type=$1' : ''} ORDER BY type DESC, name`, type ? [type] : []);
  },
  async accounts(): Promise<Account[]> { return select<Account>('SELECT * FROM accounts ORDER BY institution, name'); },
  async transactions(limit = 500): Promise<Transaction[]> {
    return select<Transaction>(`SELECT t.*, a.name account_name, c.name category_name FROM transactions t
      LEFT JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id
      ORDER BY date DESC, t.id DESC LIMIT $1`, [limit]);
  },
  async budgets(month: string): Promise<Budget[]> {
    return select<Budget>(`SELECT b.*, c.name category_name,
      COALESCE((SELECT ABS(SUM(t.amount)) FROM transactions t WHERE t.category_id=b.category_id AND t.type='expense' AND substr(t.date,1,7)=b.month),0) actual
      FROM budgets b JOIN categories c ON c.id=b.category_id WHERE b.month=$1 ORDER BY c.name`, [month]);
  },
  async recurring(): Promise<RecurringExpense[]> {
    return select<RecurringExpense>(`SELECT r.*, c.name category_name FROM recurring_expenses r LEFT JOIN categories c ON c.id=r.category_id ORDER BY active DESC, next_date, name`);
  },
  async securities(): Promise<Security[]> { return select<Security>('SELECT * FROM securities ORDER BY type, name'); },
  async trades(): Promise<Trade[]> {
    return select<Trade>(`SELECT t.*, s.name security_name FROM trades t JOIN securities s ON s.id=t.security_id ORDER BY date DESC, t.id DESC`);
  },
  async dividends(): Promise<Dividend[]> {
    return select<Dividend>(`SELECT d.*, s.name security_name FROM dividends d JOIN securities s ON s.id=d.security_id ORDER BY date DESC, d.id DESC`);
  },
  async targets(): Promise<InvestmentTarget[]> { return select<InvestmentTarget>('SELECT * FROM investment_targets ORDER BY id DESC'); },
  async properties(): Promise<Property[]> { return select<Property>('SELECT * FROM properties ORDER BY name'); },
  async pensions(): Promise<Pension[]> { return select<Pension>('SELECT * FROM pensions ORDER BY name'); },
  async liabilities(): Promise<Liability[]> { return select<Liability>('SELECT * FROM liabilities ORDER BY name'); },
  async debtors(): Promise<Debtor[]> { return select<Debtor>('SELECT * FROM debtors ORDER BY status, due_date, name'); },
  async snapshots(): Promise<Snapshot[]> { return select<Snapshot>('SELECT * FROM snapshots ORDER BY date'); },
  async inbox(status = 'new'): Promise<InboxItem[]> { return select<InboxItem>('SELECT * FROM inbox WHERE status=$1 ORDER BY date DESC,id DESC', [status]); },
  async rules(): Promise<CategorizationRule[]> {
    return select<CategorizationRule>(`SELECT r.*, c.name category_name FROM categorization_rules r JOIN categories c ON c.id=r.category_id ORDER BY priority DESC, id DESC`);
  },
  async connections(): Promise<Connection[]> { return select<Connection>('SELECT * FROM connections ORDER BY kind, name'); },
  async setting(key: string, fallback = ''): Promise<string> {
    const rows = await select<{ value: string }>('SELECT value FROM settings WHERE key=$1', [key]);
    return rows[0]?.value ?? fallback;
  },
  async schemaVersion(): Promise<number> {
    const rows = await select<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
    return rows[0]?.version ?? 0;
  },
  async setSetting(key: string, value: string) {
    await execute('INSERT INTO settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
  },
};

export async function exportAllData() {
  const tables = [
    'settings','categories','accounts','transactions','categorization_rules','import_batches','inbox','budgets',
    'recurring_expenses','securities','trades','dividends','investment_targets','price_history','properties','pensions',
    'liabilities','debtors','snapshots','cash_goals','deployment_rules','connections','schema_migrations','app_metadata',
  ];
  const output: Record<string, unknown[]> = {};
  for (const table of tables) output[table] = await select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  return output;
}
