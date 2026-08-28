import { invoke } from '@tauri-apps/api/core';
import { execute } from './db';
import type { MarketQuote, Security } from '../types';

export async function updateMarketData(securities: Security[]): Promise<MarketQuote[]> {
  const active = securities.filter((s) => (s.market_symbol || s.ticker || '').trim().length > 0);
  if (!active.length) return [];
  const symbols = active.map((s) => (s.market_symbol || s.ticker || '').trim());
  const quotes = await invoke<MarketQuote[]>('fetch_market_quotes', { symbols });
  const bySymbol = new Map(active.map((s) => [(s.market_symbol || s.ticker || '').trim(), s]));
  for (const quote of quotes) {
    const security = bySymbol.get(quote.symbol);
    if (!security || quote.error || !(quote.price > 0)) continue;
    await execute(`UPDATE securities SET current_price=$1, previous_close=$2, day_change_pct=$3, high_52w=COALESCE($4,high_52w), last_price_at=$5 WHERE id=$6`, [
      quote.price, quote.previousClose ?? null, quote.dayChangePct ?? null, quote.high52w ?? null, quote.timestamp, security.id,
    ]);
    await execute(`INSERT INTO price_history(security_id,date,price,currency,source) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(security_id,date) DO UPDATE SET price=excluded.price,currency=excluded.currency,source=excluded.source`, [
      security.id, quote.timestamp.slice(0, 10), quote.price, quote.currency ?? security.currency, quote.provider,
    ]);
  }
  return quotes;
}
