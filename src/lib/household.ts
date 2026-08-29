import Database from '@tauri-apps/plugin-sql';
import { getActiveProfile, type Profile } from './profiles';
import { ensureProfileDatabase } from './db';
import { derivePositions, financeTotals, monthlyCashflow, monthlySeries } from './finance';
import { businessValuation, defaultBusinessConsolidationSettings } from './consolidation';
import { monthIso, todayIso } from './utils';
import type {
  Account, Debtor, HouseholdMemberSummary, HouseholdMonthlyCashflow, HouseholdSharedAsset,
  HouseholdSnapshot, Liability, Pension, Property, Security, Snapshot, Trade, Transaction,
  BusinessEntity, BusinessTransaction, BusinessAsset, BusinessInvoice, BusinessAdvancePayment, BusinessTaxSettings, BusinessConsolidationSettings, BusinessBalanceItem,
} from '../types';

let householdDbPromise: Promise<Database> | null = null;
let householdDbFilename = '';

function filenameFor(profile: Profile) {
  return profile.kind === 'demo' ? 'finance-household-demo.db' : 'finance-household.db';
}

async function exec(db: Database, sql: string, bind: unknown[] = []) {
  return db.execute(sql, bind);
}

async function select<T>(db: Database, sql: string, bind: unknown[] = []) {
  return db.select<T[]>(sql, bind);
}

export async function getHouseholdDb(): Promise<Database> {
  const profile = getActiveProfile();
  if (!profile) throw new Error('Unlock a profile before opening Household.');
  const filename = filenameFor(profile);
  if (!householdDbPromise || householdDbFilename !== filename) {
    householdDbFilename = filename;
    householdDbPromise = Database.load(`sqlite:${filename}`).then(async db => {
      await initializeHouseholdDb(db, profile.kind === 'demo');
      return db;
    });
  }
  return householdDbPromise;
}

async function initializeHouseholdDb(db: Database, demo: boolean) {
  await exec(db, `CREATE TABLE IF NOT EXISTS household_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS household_members (
    profile_id TEXT PRIMARY KEY,
    profile_name TEXT NOT NULL,
    profile_kind TEXT NOT NULL,
    db_filename TEXT NOT NULL,
    last_synced_at TEXT
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS household_member_summary (
    profile_id TEXT PRIMARY KEY,
    profile_name TEXT NOT NULL,
    profile_kind TEXT NOT NULL,
    db_filename TEXT NOT NULL,
    cash REAL NOT NULL DEFAULT 0,
    investments REAL NOT NULL DEFAULT 0,
    real_estate REAL NOT NULL DEFAULT 0,
    pensions REAL NOT NULL DEFAULT 0,
    debtors REAL NOT NULL DEFAULT 0,
    liabilities REAL NOT NULL DEFAULT 0,
    business_equity REAL NOT NULL DEFAULT 0,
    business_future_equity REAL NOT NULL DEFAULT 0,
    business_growth_pct REAL NOT NULL DEFAULT 0,
    business_volatility_pct REAL NOT NULL DEFAULT 0,
    business_fi_eligible_pct REAL NOT NULL DEFAULT 0,
    net_worth REAL NOT NULL DEFAULT 0,
    monthly_income REAL NOT NULL DEFAULT 0,
    monthly_expenses REAL NOT NULL DEFAULT 0,
    monthly_savings REAL NOT NULL DEFAULT 0,
    synced_at TEXT NOT NULL
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS household_member_cashflow (
    profile_id TEXT NOT NULL,
    month TEXT NOT NULL,
    income REAL NOT NULL DEFAULT 0,
    expenses REAL NOT NULL DEFAULT 0,
    savings REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(profile_id, month)
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS household_member_snapshots (
    profile_id TEXT NOT NULL,
    date TEXT NOT NULL,
    cash REAL NOT NULL DEFAULT 0,
    investments REAL NOT NULL DEFAULT 0,
    real_estate REAL NOT NULL DEFAULT 0,
    pensions REAL NOT NULL DEFAULT 0,
    debtors REAL NOT NULL DEFAULT 0,
    liabilities REAL NOT NULL DEFAULT 0,
    business_equity REAL NOT NULL DEFAULT 0,
    net_worth REAL NOT NULL DEFAULT 0,
    PRIMARY KEY(profile_id, date)
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS household_shared_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_class TEXT NOT NULL,
    name TEXT NOT NULL,
    current_value REAL NOT NULL DEFAULT 0,
    debt_value REAL NOT NULL DEFAULT 0,
    personal_pct REAL NOT NULL DEFAULT 50,
    partner_pct REAL NOT NULL DEFAULT 50,
    liquid INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS household_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    personal_nw REAL NOT NULL DEFAULT 0,
    partner_nw REAL NOT NULL DEFAULT 0,
    shared_nw REAL NOT NULL DEFAULT 0,
    total_nw REAL NOT NULL DEFAULT 0
  )`);
  await exec(db, `CREATE TABLE IF NOT EXISTS household_schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await exec(db, `INSERT OR IGNORE INTO household_schema_migrations(version,name) VALUES(1,'V2.3 household foundation')`);
  await exec(db, `ALTER TABLE household_member_summary ADD COLUMN business_equity REAL NOT NULL DEFAULT 0`).catch(()=>{});
  await exec(db, `ALTER TABLE household_member_summary ADD COLUMN business_future_equity REAL NOT NULL DEFAULT 0`).catch(()=>{});
  await exec(db, `ALTER TABLE household_member_summary ADD COLUMN business_growth_pct REAL NOT NULL DEFAULT 0`).catch(()=>{});
  await exec(db, `ALTER TABLE household_member_summary ADD COLUMN business_volatility_pct REAL NOT NULL DEFAULT 0`).catch(()=>{});
  await exec(db, `ALTER TABLE household_member_summary ADD COLUMN business_fi_eligible_pct REAL NOT NULL DEFAULT 0`).catch(()=>{});
  await exec(db, `INSERT OR IGNORE INTO household_schema_migrations(version,name) VALUES(2,'V2.8 business equity consolidation and projection metadata')`);
  if (demo) await seedDemoHousehold(db);
}

interface ProfileAggregate {
  summary: HouseholdMemberSummary;
  cashflow: HouseholdMonthlyCashflow[];
  snapshots: Snapshot[];
}

async function aggregateProfile(db: Database, profile: Profile): Promise<ProfileAggregate> {
  const accounts = await select<Account>(db, 'SELECT * FROM accounts ORDER BY institution,name');
  const securities = await select<Security>(db, 'SELECT * FROM securities ORDER BY type,name');
  const trades = await select<Trade>(db, 'SELECT * FROM trades ORDER BY date,id');
  const properties = await select<Property>(db, 'SELECT * FROM properties ORDER BY name');
  const pensions = await select<Pension>(db, 'SELECT * FROM pensions ORDER BY name');
  const liabilities = await select<Liability>(db, 'SELECT * FROM liabilities ORDER BY name');
  const debtors = await select<Debtor>(db, 'SELECT * FROM debtors ORDER BY status,due_date,name');
  const transactions = await select<Transaction>(db, 'SELECT * FROM transactions ORDER BY date,id');
  const snapshots = await select<Snapshot>(db, 'SELECT * FROM snapshots ORDER BY date');
  const positions = derivePositions(securities, trades);
  const totals = financeTotals(accounts, positions, properties, pensions, debtors, liabilities);
  let businessEquity = 0;
  let businessFutureEquity = 0, businessFutureWeight = 0, weightedGrowth = 0, weightedVolatility = 0, fiEligible = 0;
  try {
    const entities = await select<BusinessEntity>(db, 'SELECT * FROM business_entities ORDER BY id');
    for (const entity of entities) {
      const txs = await select<BusinessTransaction>(db, 'SELECT * FROM business_transactions WHERE entity_id=$1', [entity.id]);
      const bAssets = await select<BusinessAsset>(db, 'SELECT * FROM business_assets WHERE entity_id=$1', [entity.id]);
      const invoices = await select<BusinessInvoice>(db, 'SELECT * FROM business_invoices WHERE entity_id=$1', [entity.id]);
      const payments = await select<BusinessAdvancePayment>(db, 'SELECT * FROM business_advance_payments WHERE entity_id=$1 AND tax_year=$2', [entity.id, entity.fiscal_year]);
      const taxes = await select<BusinessTaxSettings>(db, 'SELECT * FROM business_tax_settings WHERE entity_id=$1 AND tax_year=$2', [entity.id, entity.fiscal_year]);
      const cons = await select<BusinessConsolidationSettings>(db, 'SELECT * FROM business_consolidation_settings WHERE entity_id=$1', [entity.id]);
      const items = await select<BusinessBalanceItem>(db, 'SELECT * FROM business_balance_items WHERE entity_id=$1', [entity.id]);
      const settings = cons[0] ?? defaultBusinessConsolidationSettings(entity.id);
      const taxSettings = taxes[0];
      if (!taxSettings) continue;
      const ownerEquity = businessValuation(entity,txs,bAssets,invoices,payments,taxSettings,settings,items).ownerEquity;
      if (settings.include_in_household) businessEquity += ownerEquity;
      if (settings.include_in_future) {
        businessFutureEquity += ownerEquity;
        const w = Math.abs(ownerEquity);
        businessFutureWeight += w;
        weightedGrowth += w * Number(settings.future_growth_pct || 0);
        weightedVolatility += w * Number(settings.future_volatility_pct || 0);
        if (settings.include_in_fi) fiEligible += Math.max(0, ownerEquity);
      }
    }
  } catch (error) { console.warn('Business consolidation unavailable for household aggregate', error); }
  const current = monthlyCashflow(transactions, monthIso());
  const syncedAt = new Date().toISOString();
  const summary: HouseholdMemberSummary = {
    profile_id: profile.id,
    profile_name: profile.name,
    profile_kind: profile.kind,
    db_filename: profile.dbFilename,
    cash: totals.cash,
    investments: totals.investments,
    real_estate: totals.realEstate,
    pensions: totals.pensions,
    debtors: totals.debtors,
    liabilities: totals.liabilities,
    business_equity: businessEquity,
    business_future_equity: businessFutureEquity,
    business_growth_pct: businessFutureWeight ? weightedGrowth / businessFutureWeight : 0,
    business_volatility_pct: businessFutureWeight ? weightedVolatility / businessFutureWeight : 0,
    business_fi_eligible_pct: Math.max(0,businessFutureEquity) ? Math.max(0,Math.min(100,fiEligible/Math.max(0,businessFutureEquity)*100)) : 0,
    net_worth: totals.netWorth + businessEquity,
    monthly_income: current.income,
    monthly_expenses: current.expenses,
    monthly_savings: current.savings,
    synced_at: syncedAt,
  };
  const cashflow = monthlySeries(transactions).map(row => ({
    profile_id: profile.id,
    month: row.month,
    income: row.income,
    expenses: row.expenses,
    savings: row.savings,
  }));
  return { summary, cashflow, snapshots };
}

async function cacheAggregate(hdb: Database, aggregate: ProfileAggregate) {
  const s = aggregate.summary;
  await exec(hdb, `INSERT INTO household_members(profile_id,profile_name,profile_kind,db_filename,last_synced_at)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(profile_id) DO UPDATE SET profile_name=excluded.profile_name,profile_kind=excluded.profile_kind,db_filename=excluded.db_filename,last_synced_at=excluded.last_synced_at`,
    [s.profile_id,s.profile_name,s.profile_kind,s.db_filename,s.synced_at]);
  await exec(hdb, `INSERT INTO household_member_summary(profile_id,profile_name,profile_kind,db_filename,cash,investments,real_estate,pensions,debtors,liabilities,business_equity,business_future_equity,business_growth_pct,business_volatility_pct,business_fi_eligible_pct,net_worth,monthly_income,monthly_expenses,monthly_savings,synced_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT(profile_id) DO UPDATE SET profile_name=excluded.profile_name,profile_kind=excluded.profile_kind,db_filename=excluded.db_filename,cash=excluded.cash,investments=excluded.investments,real_estate=excluded.real_estate,pensions=excluded.pensions,debtors=excluded.debtors,liabilities=excluded.liabilities,business_equity=excluded.business_equity,business_future_equity=excluded.business_future_equity,business_growth_pct=excluded.business_growth_pct,business_volatility_pct=excluded.business_volatility_pct,business_fi_eligible_pct=excluded.business_fi_eligible_pct,net_worth=excluded.net_worth,monthly_income=excluded.monthly_income,monthly_expenses=excluded.monthly_expenses,monthly_savings=excluded.monthly_savings,synced_at=excluded.synced_at`,
    [s.profile_id,s.profile_name,s.profile_kind,s.db_filename,s.cash,s.investments,s.real_estate,s.pensions,s.debtors,s.liabilities,s.business_equity,s.business_future_equity,s.business_growth_pct,s.business_volatility_pct,s.business_fi_eligible_pct,s.net_worth,s.monthly_income,s.monthly_expenses,s.monthly_savings,s.synced_at]);
  await exec(hdb, 'DELETE FROM household_member_cashflow WHERE profile_id=$1', [s.profile_id]);
  for (const row of aggregate.cashflow) {
    await exec(hdb, `INSERT INTO household_member_cashflow(profile_id,month,income,expenses,savings) VALUES($1,$2,$3,$4,$5)`, [row.profile_id,row.month,row.income,row.expenses,row.savings]);
  }
  await exec(hdb, 'DELETE FROM household_member_snapshots WHERE profile_id=$1', [s.profile_id]);
  for (const row of aggregate.snapshots) {
    await exec(hdb, `INSERT INTO household_member_snapshots(profile_id,date,cash,investments,real_estate,pensions,debtors,liabilities,net_worth)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [s.profile_id,row.date,row.cash,row.investments,row.real_estate,row.pensions,row.debtors,row.liabilities,row.net_worth]);
  }
}

export async function syncActiveProfile(profile: Profile) {
  const hdb = await getHouseholdDb();
  if (profile.kind === 'demo') {
    await seedDemoHousehold(hdb);
    return;
  }
  const activeDb = await ensureProfileDatabase(profile);
  const aggregate = await aggregateProfile(activeDb, profile);
  await cacheAggregate(hdb, aggregate);
}

export async function syncAuthorizedProfile(profile: Profile) {
  const hdb = await getHouseholdDb();
  const db = await ensureProfileDatabase(profile);
  const tables = await select<{name:string}>(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`);
  if (!tables.length) throw new Error(`${profile.name} has no initialized finance database yet. Open that profile once before sharing household totals.`);
  const aggregate = await aggregateProfile(db, profile);
  await cacheAggregate(hdb, aggregate);
}

export async function householdMembers(): Promise<HouseholdMemberSummary[]> {
  const db = await getHouseholdDb();
  return select<HouseholdMemberSummary>(db, 'SELECT * FROM household_member_summary ORDER BY CASE profile_kind WHEN \'personal\' THEN 0 WHEN \'partner\' THEN 1 ELSE 2 END, profile_name');
}

export async function householdCashflow(): Promise<HouseholdMonthlyCashflow[]> {
  const db = await getHouseholdDb();
  return select<HouseholdMonthlyCashflow>(db, 'SELECT * FROM household_member_cashflow ORDER BY month,profile_id');
}

export async function sharedAssets(): Promise<HouseholdSharedAsset[]> {
  const db = await getHouseholdDb();
  return select<HouseholdSharedAsset>(db, 'SELECT * FROM household_shared_assets ORDER BY asset_class,name');
}

export async function householdSnapshots(): Promise<HouseholdSnapshot[]> {
  const db = await getHouseholdDb();
  return select<HouseholdSnapshot>(db, 'SELECT * FROM household_snapshots ORDER BY date');
}

export async function addSharedAsset(asset: Omit<HouseholdSharedAsset,'id'|'updated_at'>) {
  const db = await getHouseholdDb();
  await exec(db, `INSERT INTO household_shared_assets(asset_class,name,current_value,debt_value,personal_pct,partner_pct,liquid,notes,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`, [asset.asset_class,asset.name,asset.current_value,asset.debt_value,asset.personal_pct,asset.partner_pct,asset.liquid,asset.notes ?? null]);
}

export async function updateSharedAsset(id: number, asset: Omit<HouseholdSharedAsset,'id'|'updated_at'>) {
  const db = await getHouseholdDb();
  await exec(db, `UPDATE household_shared_assets SET asset_class=$1,name=$2,current_value=$3,debt_value=$4,personal_pct=$5,partner_pct=$6,liquid=$7,notes=$8,updated_at=CURRENT_TIMESTAMP WHERE id=$9`,
    [asset.asset_class,asset.name,asset.current_value,asset.debt_value,asset.personal_pct,asset.partner_pct,asset.liquid,asset.notes ?? null,id]);
}

export async function deleteSharedAsset(id: number) {
  const db = await getHouseholdDb();
  await exec(db, 'DELETE FROM household_shared_assets WHERE id=$1', [id]);
}

export function sharedAssetNet(asset: HouseholdSharedAsset) {
  if (asset.asset_class === 'liability') return -Math.abs(Number(asset.debt_value || asset.current_value) || 0);
  return (Number(asset.current_value) || 0) - (Number(asset.debt_value) || 0);
}

export async function saveHouseholdSnapshot() {
  const db = await getHouseholdDb();
  const members = await householdMembers();
  const shared = await sharedAssets();
  const personal = members.find(m => m.profile_kind === 'personal')?.net_worth ?? 0;
  const partner = members.find(m => m.profile_kind === 'partner')?.net_worth ?? 0;
  const demo = members.find(m => m.profile_id === 'demo')?.net_worth ?? 0;
  const demoPartner = members.find(m => m.profile_id === 'demo-partner')?.net_worth ?? 0;
  const sharedNw = shared.reduce((sum,a)=>sum+sharedAssetNet(a),0);
  const personalNw = personal || demo;
  const partnerNw = partner || demoPartner;
  const total = personalNw + partnerNw + sharedNw;
  await exec(db, `INSERT INTO household_snapshots(date,personal_nw,partner_nw,shared_nw,total_nw)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(date) DO UPDATE SET personal_nw=excluded.personal_nw,partner_nw=excluded.partner_nw,shared_nw=excluded.shared_nw,total_nw=excluded.total_nw`,
    [todayIso(),personalNw,partnerNw,sharedNw,total]);
}

export async function clearMemberCache(profileId: string) {
  const db = await getHouseholdDb();
  await exec(db, 'DELETE FROM household_member_summary WHERE profile_id=$1', [profileId]);
  await exec(db, 'DELETE FROM household_member_cashflow WHERE profile_id=$1', [profileId]);
  await exec(db, 'DELETE FROM household_member_snapshots WHERE profile_id=$1', [profileId]);
  await exec(db, 'DELETE FROM household_members WHERE profile_id=$1', [profileId]);
}

async function seedDemoHousehold(db: Database) {
  const seeded = await select<{value:string}>(db, `SELECT value FROM household_settings WHERE key='demo_seed_version'`);
  if (seeded[0]?.value === '3') return;
  await exec(db, 'DELETE FROM household_member_summary');
  await exec(db, 'DELETE FROM household_member_cashflow');
  await exec(db, 'DELETE FROM household_member_snapshots');
  await exec(db, 'DELETE FROM household_shared_assets');
  await exec(db, 'DELETE FROM household_snapshots');

  const now = new Date().toISOString();
  const demoMembers: HouseholdMemberSummary[] = [
    {profile_id:'demo',profile_name:'Alex',profile_kind:'personal',db_filename:'finance-demo.db',cash:47020,investments:214600,real_estate:0,pensions:39400,debtors:0,liabilities:12500,business_equity:118000,business_future_equity:118000,business_growth_pct:5,business_volatility_pct:22,business_fi_eligible_pct:0,net_worth:406520,monthly_income:6120,monthly_expenses:3130,monthly_savings:2990,synced_at:now},
    {profile_id:'demo-partner',profile_name:'Jamie',profile_kind:'partner',db_filename:'demo-partner',cash:31800,investments:87600,real_estate:0,pensions:28750,debtors:0,liabilities:6200,business_equity:0,business_future_equity:0,business_growth_pct:0,business_volatility_pct:0,business_fi_eligible_pct:0,net_worth:141950,monthly_income:4880,monthly_expenses:2640,monthly_savings:2240,synced_at:now},
  ];
  for (const s of demoMembers) {
    await exec(db, `INSERT INTO household_member_summary(profile_id,profile_name,profile_kind,db_filename,cash,investments,real_estate,pensions,debtors,liabilities,business_equity,business_future_equity,business_growth_pct,business_volatility_pct,business_fi_eligible_pct,net_worth,monthly_income,monthly_expenses,monthly_savings,synced_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, [s.profile_id,s.profile_name,s.profile_kind,s.db_filename,s.cash,s.investments,s.real_estate,s.pensions,s.debtors,s.liabilities,s.business_equity,s.business_future_equity,s.business_growth_pct,s.business_volatility_pct,s.business_fi_eligible_pct,s.net_worth,s.monthly_income,s.monthly_expenses,s.monthly_savings,s.synced_at]);
  }
  await exec(db, `INSERT INTO household_shared_assets(asset_class,name,current_value,debt_value,personal_pct,partner_pct,liquid,notes) VALUES
    ('real_estate','Family home',680000,286000,50,50,0,'Fictional shared home'),
    ('cash','Joint household reserve',26500,0,50,50,1,'Fictional joint reserve')`);

  const months: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i=17;i>=0;i--) {
    const x = new Date(d.getFullYear(), d.getMonth()-i, 1);
    months.push(`${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}`);
  }
  for (let i=0;i<months.length;i++) {
    const m=months[i];
    const aIncome=5900+(i%4)*110, aExpense=2950+(i%5)*85;
    const bIncome=4700+(i%3)*90, bExpense=2460+(i%4)*70;
    await exec(db, `INSERT INTO household_member_cashflow(profile_id,month,income,expenses,savings) VALUES('demo',$1,$2,$3,$4)`, [m,aIncome,aExpense,aIncome-aExpense]);
    await exec(db, `INSERT INTO household_member_cashflow(profile_id,month,income,expenses,savings) VALUES('demo-partner',$1,$2,$3,$4)`, [m,bIncome,bExpense,bIncome-bExpense]);
    const personal=225000+i*3700;
    const partner=111000+i*1900;
    const shared=360000+i*3300;
    await exec(db, `INSERT INTO household_snapshots(date,personal_nw,partner_nw,shared_nw,total_nw) VALUES($1,$2,$3,$4,$5)`, [`${m}-28`,personal,partner,shared,personal+partner+shared]);
  }
  await exec(db, `INSERT OR REPLACE INTO household_settings(key,value) VALUES('demo_seed_version','3')`);
}
