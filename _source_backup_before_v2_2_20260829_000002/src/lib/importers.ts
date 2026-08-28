import { execute, repo } from './db';
import { suggestCategory } from './categorize';
import { parseNumber, stableId } from './utils';

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"' && quoted && next === '"') { field += '"'; i++; continue; }
    if (c === '"') { quoted = !quoted; continue; }
    if (c === delimiter && !quoted) { row.push(field); field = ''; continue; }
    if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && next === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += c;
  }
  if (field.length || row.length) { row.push(field); if (row.some((v) => v.trim() !== '')) rows.push(row); }
  return rows;
}

export function detectDelimiter(text: string) {
  const first = text.split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t'].map((d) => ({ d, n: first.split(d).length }));
  return counts.sort((a, b) => b.n - a.n)[0].d;
}

export interface BankImportMapping {
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  account?: number;
}

function normalizeDate(value: string) {
  const v = value.trim();
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(v)?.[0];
  if (iso) return iso;
  const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(v);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export async function importBankRows(rows: string[][], mapping: BankImportMapping, filename: string) {
  const categories = await repo.categories();
  const rules = await repo.rules();
  let count = 0;
  for (const row of rows) {
    const description = row[mapping.description]?.trim();
    if (!description) continue;
    const amount = mapping.amount !== undefined
      ? parseNumber(row[mapping.amount])
      : parseNumber(mapping.credit !== undefined ? row[mapping.credit] : undefined)
        - Math.abs(parseNumber(mapping.debit !== undefined ? row[mapping.debit] : undefined));
    const date = normalizeDate(row[mapping.date] || '');
    const suggestion = suggestCategory(description, amount, categories, rules);
    const externalId = stableId(`${date}|${description}|${amount}|${JSON.stringify(row)}`, 'bankcsv');
    await execute(`INSERT OR IGNORE INTO inbox(raw_json,date,description,amount,account_hint,suggested_category_id,confidence,source,external_id,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'new')`, [
      JSON.stringify(row), date, description, amount, mapping.account !== undefined ? row[mapping.account] : null,
      suggestion.categoryId, suggestion.confidence, `Bank CSV · ${filename}`, externalId,
    ]);
    count++;
  }
  await execute('INSERT INTO import_batches(source,filename,row_count) VALUES($1,$2,$3)', ['bank_csv', filename, count]);
  return count;
}

export interface BrokerImportMapping { date: number; symbol: number; side: number; quantity: number; price: number; fees?: number; name?: number; }

export async function importBrokerRows(rows: string[][], mapping: BrokerImportMapping, filename: string, accountId?: number) {
  let count = 0;
  for (const row of rows) {
    const symbol = row[mapping.symbol]?.trim();
    if (!symbol) continue;
    const sideRaw = row[mapping.side]?.trim().toUpperCase();
    const side = sideRaw.includes('SELL') || sideRaw.includes('VERKOOP') ? 'SELL' : 'BUY';
    const existing = await import('./db').then(({ select }) => select<{ id: number }>('SELECT id FROM securities WHERE ticker=$1 OR market_symbol=$1 LIMIT 1', [symbol]));
    let securityId = existing[0]?.id;
    if (!securityId) {
      const result = await execute(`INSERT INTO securities(type,name,ticker,market_symbol,currency,broker_account_id) VALUES('ETF',$1,$2,$2,'EUR',$3)`, [row[mapping.name ?? mapping.symbol] || symbol, symbol, accountId ?? null]);
      securityId = Number(result.lastInsertId);
    }
    const externalId = stableId(JSON.stringify(row), 'brokercsv');
    await execute(`INSERT OR IGNORE INTO trades(security_id,account_id,date,side,quantity,price,fees,currency,source,external_id) VALUES($1,$2,$3,$4,$5,$6,$7,'EUR',$8,$9)`, [
      securityId, accountId ?? null, normalizeDate(row[mapping.date] || ''), side, Math.abs(parseNumber(row[mapping.quantity])), parseNumber(row[mapping.price]), mapping.fees !== undefined ? Math.abs(parseNumber(row[mapping.fees])) : 0, `Broker CSV · ${filename}`, externalId,
    ]);
    count++;
  }
  await execute('INSERT INTO import_batches(source,filename,row_count) VALUES($1,$2,$3)', ['broker_csv', filename, count]);
  return count;
}
