import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { getActiveProfile, type Profile } from './profiles';
import type {
  Account, Budget, Category, CategorizationRule, Connection, Debtor, Dividend, InboxItem,
  InvestmentTarget, Liability, Pension, Property, RecurringExpense, Security, Snapshot, Trade,
  Transaction, InsurancePolicy, InsuranceClaim,
} from '../types';

let dbPromise: Promise<Database> | null = null;
const SCHEMA_VERSION = 5;

export async function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = (async () => {
      // This runs before SQLite opens the file. On each new app version the Rust
      // backend creates one pre-upgrade copy of the existing database.
      const profile = getActiveProfile();
      if (!profile) throw new Error('Choose and unlock a profile before opening the finance database.');
      try { await invoke('prepare_database_upgrade', { dbFilename: profile.dbFilename }); } catch (error) { console.warn('Pre-upgrade backup warning', error); }
      const db = await Database.load(`sqlite:${profile.dbFilename}`);
      await initialize(db, profile);
      return db;
    })().catch(error => {
      // A failed profile/database open must not poison subsequent unlock attempts.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

async function exec(db: Database, sql: string, bind: unknown[] = []) {
  return db.execute(sql, bind);
}

async function initialize(db: Database, profile: Profile) {
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
  await exec(db, `CREATE TABLE IF NOT EXISTS profile_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  await exec(db, `INSERT OR REPLACE INTO profile_info(key,value) VALUES ('profile_id',$1)`, [profile.id]);
  await exec(db, `INSERT OR REPLACE INTO profile_info(key,value) VALUES ('profile_name',$1)`, [profile.name]);
  await exec(db, `INSERT OR REPLACE INTO profile_info(key,value) VALUES ('profile_kind',$1)`, [profile.kind]);
  if (profile.kind === 'demo') { await seedDemo(db); await seedProtectionDemo(db); }
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

  if (current < 3) {
    await exec(db, `CREATE TABLE IF NOT EXISTS profile_info (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    await exec(db, `INSERT INTO schema_migrations(version,name) VALUES (3,'V2.2 profile vault and separated ledgers')`);
    current = 3;
  }

  if (current < 4) {
    await exec(db, `CREATE TABLE IF NOT EXISTS household_share_preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    await exec(db, `INSERT OR IGNORE INTO household_share_preferences(key,value) VALUES ('share_aggregates','1')`);
    await exec(db, `INSERT INTO schema_migrations(version,name) VALUES (4,'V2.3 household consolidation and aggregate sharing')`);
    current = 4;
  }

  if (current < 5) {
    await exec(db, `CREATE TABLE IF NOT EXISTS insurance_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      provider TEXT NOT NULL DEFAULT '',
      policy_number TEXT,
      insured_for TEXT NOT NULL DEFAULT 'Personal',
      status TEXT NOT NULL DEFAULT 'active',
      premium_amount REAL NOT NULL DEFAULT 0,
      premium_frequency TEXT NOT NULL DEFAULT 'Annual',
      start_date TEXT,
      renewal_date TEXT,
      end_date TEXT,
      coverage_amount REAL NOT NULL DEFAULT 0,
      deductible REAL NOT NULL DEFAULT 0,
      beneficiary TEXT,
      broker_name TEXT,
      broker_contact TEXT,
      auto_renewal INTEGER NOT NULL DEFAULT 1,
      document_ref TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await exec(db, `CREATE TABLE IF NOT EXISTS insurance_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER,
      incident_date TEXT NOT NULL,
      claim_reference TEXT,
      description TEXT NOT NULL,
      claimed_amount REAL NOT NULL DEFAULT 0,
      reimbursed_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(policy_id) REFERENCES insurance_policies(id) ON DELETE SET NULL
    )`);
    await exec(db, 'CREATE INDEX IF NOT EXISTS idx_insurance_policies_renewal ON insurance_policies(renewal_date)');
    await exec(db, 'CREATE INDEX IF NOT EXISTS idx_insurance_claims_policy ON insurance_claims(policy_id, incident_date)');
    await exec(db, `INSERT INTO schema_migrations(version,name) VALUES (5,'V2.4 protection: insurance policies and claims')`);
    current = 5;
  }

  await exec(db, `INSERT OR REPLACE INTO settings(key,value) VALUES ('schema_version',$1)`, [String(current)]);
  await exec(db, `INSERT OR REPLACE INTO app_metadata(key,value,updated_at) VALUES ('schema_version',$1,CURRENT_TIMESTAMP)`, [String(current)]);
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


async function seedDemo(db: Database) {
  const seeded = await db.select<Array<{ value: string }>>(`SELECT value FROM settings WHERE key='demo_seed_version'`);
  if (seeded[0]?.value === '1') return;

  // The demo ledger is deliberately fictional and self-contained.
  await exec(db, `INSERT INTO accounts(name,institution,type,currency,balance,include_networth) VALUES
    ('Everyday account','Northbank','current','EUR',8420,1),
    ('Emergency savings','Northbank','savings','EUR',32500,1),
    ('Broker cash','Atlas Broker','broker_cash','EUR',6100,1)`);
  const accountRows = await db.select<Array<{id:number,name:string}>>('SELECT id,name FROM accounts');
  const everyday = accountRows.find(x=>x.name==='Everyday account')?.id ?? null;
  const broker = accountRows.find(x=>x.name==='Broker cash')?.id ?? null;
  const cats = await db.select<Array<{id:number,name:string,type:string}>>('SELECT id,name,type FROM categories');
  const cat = (name:string,type:string) => cats.find(x=>x.name===name&&x.type===type)?.id ?? null;

  const month = new Date().toISOString().slice(0,7);
  const tx = [
    [`${month}-01`,'Salary · Demo Medical Group',4850,'income',cat('Salary','income')],
    [`${month}-03`,'Mortgage payment',-1650,'expense',cat('Housing','expense')],
    [`${month}-05`,'Delhaize',-118.40,'expense',cat('Groceries','expense')],
    [`${month}-07`,'Restaurant',-92.50,'expense',cat('Dining','expense')],
    [`${month}-09`,'Energy provider',-164.20,'expense',cat('Utilities','expense')],
    [`${month}-12`,'Fuel station',-76.30,'expense',cat('Fuel','expense')],
    [`${month}-15`,'ETF contribution',-1500,'investment',null],
    [`${month}-18`,'Mobile & internet',-88,'expense',cat('Telecom','expense')],
    [`${month}-21`,'Insurance premium',-124,'expense',cat('Insurance','expense')],
    [`${month}-24`,'Weekend trip',-285,'expense',cat('Travel','expense')],
  ] as const;
  for (const [date,description,amount,type,category] of tx) {
    await exec(db, `INSERT INTO transactions(account_id,date,description,merchant,amount,type,category_id,source,reviewed)
      VALUES($1,$2,$3,$3,$4,$5,$6,'demo',1)`, [everyday,date,description,amount,type,category]);
  }

  await exec(db, `INSERT INTO securities(type,name,ticker,market_symbol,isin,currency,broker_account_id,current_price,previous_close,day_change_pct,high_52w,target_weight,last_price_at) VALUES
    ('ETF','iShares Core MSCI World UCITS ETF','IWDA','IWDA.AS','IE00B4L5Y983','EUR',$1,112.40,111.95,0.40,115.30,65,CURRENT_TIMESTAMP),
    ('ETF','SPDR MSCI ACWI IMI UCITS ETF','IMIE','IMIE.L','IE00B3YLTY66','EUR',$1,33.28,33.12,0.48,34.10,20,CURRENT_TIMESTAMP),
    ('Gold','Physical Gold ETC','SGLN','SGLN.L',NULL,'EUR',$1,48.75,48.60,0.31,50.20,10,CURRENT_TIMESTAMP),
    ('Stock','Example Health Technologies','EHT','EHT',NULL,'EUR',$1,74.20,73.60,0.82,81.40,5,CURRENT_TIMESTAMP)`, [broker]);
  const sec = await db.select<Array<{id:number,ticker:string}>>('SELECT id,ticker FROM securities');
  const sid = (ticker:string) => sec.find(x=>x.ticker===ticker)?.id;
  const trades = [
    [sid('IWDA'),'2023-02-15','BUY',650,78.10,7.5],[sid('IWDA'),'2024-01-22','BUY',500,86.70,7.5],[sid('IWDA'),'2025-05-09','BUY',380,99.20,7.5],
    [sid('IMIE'),'2024-03-12','BUY',900,27.20,7.5],[sid('IMIE'),'2025-10-03','BUY',450,30.85,7.5],
    [sid('SGLN'),'2024-09-10','BUY',520,38.40,7.5],[sid('EHT'),'2025-01-18','BUY',180,62.10,7.5],
  ];
  for (const [securityId,date,side,quantity,price,fees] of trades) if (securityId) {
    await exec(db, `INSERT INTO trades(security_id,account_id,date,side,quantity,price,fees,currency,source) VALUES($1,$2,$3,$4,$5,$6,$7,'EUR','demo')`, [securityId,broker,date,side,quantity,price,fees]);
  }
  if (sid('IWDA')) await exec(db, `INSERT INTO dividends(security_id,account_id,date,gross_amount,tax_amount,currency,notes) VALUES($1,$2,$3,820,0,'EUR','Demo distribution-equivalent cashflow')`, [sid('IWDA'),broker,`${month}-10`]);

  await exec(db, `INSERT INTO properties(name,address,type,ownership_pct,purchase_value,purchase_costs,upgrades,latest_valuation,outstanding_debt,rental_income_annual,notes)
    VALUES('Family home','Demo Avenue 12, Ghent','House',50,540000,42000,28000,675000,268000,0,'Fictional demo property')`);
  await exec(db, `INSERT INTO pensions(name,provider,type,total_contributed,current_value,annual_fee_pct,notes) VALUES
    ('Pension savings','Demo Life','Private',24500,31800,0.75,'Fictional demo plan'),
    ('Employer pension','Demo Medical Group','Employer',18000,23600,0.55,'Fictional demo plan')`);
  await exec(db, `INSERT INTO liabilities(name,type,outstanding_balance,interest_pct,monthly_payment,notes) VALUES
    ('Car loan','Consumer loan',12400,3.2,410,'Fictional demo liability')`);
  await exec(db, `INSERT INTO cash_goals(name,target_amount,current_amount,target_date,account_id,notes) VALUES
    ('Emergency fund',30000,30000,NULL,$1,'Six-month buffer'),
    ('Future home upgrade',60000,8500,'2029-06-01',$1,'Demo goal')`, [everyday]);

  // A smooth but plausible two-year historical trajectory for presentation.
  const start = new Date(); start.setMonth(start.getMonth()-23); start.setDate(1);
  for (let i=0;i<24;i++) {
    const d = new Date(start); d.setMonth(start.getMonth()+i);
    const date = d.toISOString().slice(0,10);
    const cash = 28000 + i*780;
    const investments = 162000 + i*5200 + Math.sin(i/2)*6500;
    const realEstate = 181000 + i*2200;
    const pensions = 42000 + i*620;
    const debtors = 0;
    const liabilities = 17800 - i*235;
    const net = cash+investments+realEstate+pensions+debtors-liabilities;
    await exec(db, `INSERT OR REPLACE INTO snapshots(date,cash,investments,real_estate,pensions,debtors,liabilities,net_worth) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [date,cash,investments,realEstate,pensions,debtors,liabilities,net]);
  }
  await exec(db, `INSERT OR REPLACE INTO settings(key,value) VALUES ('base_currency','EUR')`);
  await exec(db, `INSERT OR REPLACE INTO settings(key,value) VALUES ('demo_seed_version','1')`);
}


async function seedProtectionDemo(db: Database) {
  const seeded = await db.select<Array<{ value: string }>>(`SELECT value FROM settings WHERE key='protection_demo_seed_version'`);
  if (seeded[0]?.value === '1') return;
  await exec(db, `INSERT INTO insurance_policies(name,category,provider,policy_number,insured_for,status,premium_amount,premium_frequency,start_date,renewal_date,coverage_amount,deductible,beneficiary,broker_name,broker_contact,auto_renewal,document_ref,notes) VALUES
    ('Family home protection','Home','Northstar Insurance','DEMO-HOME-2048','Household','active',742,'Annual','2024-02-01','2027-02-01',675000,650,NULL,'Harbor Insurance Partners','demo@broker.example',1,'home-policy-demo.pdf','Fictional demo policy'),
    ('Family liability','Family liability','Civic Mutual','DEMO-FAM-1188','Household','active',118,'Annual','2023-09-10','2026-09-10',2500000,0,NULL,'Harbor Insurance Partners','demo@broker.example',1,'family-liability-demo.pdf','Fictional demo policy'),
    ('Hospitalisation plan','Hospitalisation','MedProtect','DEMO-HOSP-7741','Personal','active',46,'Monthly','2022-01-01','2027-01-01',0,125,NULL,'Direct','support@medprotect.example',1,'hospital-demo.pdf','Fictional demo policy'),
    ('Income protection','Income protection','SecureLife','DEMO-IP-9012','Personal','active',1260,'Annual','2025-04-01','2027-04-01',90000,0,'Partner','Harbor Insurance Partners','demo@broker.example',1,'income-protection-demo.pdf','Fictional demo policy'),
    ('Travel cover','Travel','Voyage Shield','DEMO-TRAVEL-6630','Household','active',168,'Annual','2026-05-01','2027-05-01',0,100,NULL,'Direct','help@voyageshield.example',1,'travel-demo.pdf','Fictional demo policy')`);
  const policy = await db.select<Array<{id:number,name:string}>>(`SELECT id,name FROM insurance_policies WHERE name='Travel cover' LIMIT 1`);
  if (policy[0]) await exec(db, `INSERT INTO insurance_claims(policy_id,incident_date,claim_reference,description,claimed_amount,reimbursed_amount,status,notes) VALUES($1,'2026-06-18','DEMO-CLM-042','Delayed baggage expenses',318,318,'paid','Fictional demo claim')`, [policy[0].id]);
  await exec(db, `INSERT OR REPLACE INTO settings(key,value) VALUES ('protection_demo_seed_version','1')`);
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
  async insurancePolicies(): Promise<InsurancePolicy[]> { return select<InsurancePolicy>(`SELECT * FROM insurance_policies ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, COALESCE(renewal_date,'9999-12-31'), name`); },
  async insuranceClaims(): Promise<InsuranceClaim[]> { return select<InsuranceClaim>(`SELECT c.*, p.name policy_name FROM insurance_claims c LEFT JOIN insurance_policies p ON p.id=c.policy_id ORDER BY incident_date DESC, c.id DESC`); },
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
    'liabilities','debtors','snapshots','cash_goals','deployment_rules','connections','insurance_policies','insurance_claims','schema_migrations','app_metadata','profile_info',
  ];
  const output: Record<string, unknown[]> = {};
  for (const table of tables) output[table] = await select<Record<string, unknown>>(`SELECT * FROM ${table}`);
  return output;
}
