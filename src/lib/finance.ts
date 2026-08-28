import type { Account, Debtor, FinanceTotals, Liability, Pension, Position, Property, Security, Trade, Transaction } from '../types';

export function derivePositions(securities: Security[], trades: Trade[]): Position[] {
  return securities.map((security) => {
    const related = trades
      .filter((t) => t.security_id === security.id)
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

    const lots: Array<{ qty: number; unitCost: number }> = [];
    let realized = 0;

    for (const trade of related) {
      const qty = Math.abs(Number(trade.quantity) || 0);
      const price = Number(trade.price) || 0;
      const fees = Number(trade.fees) || 0;
      if (qty <= 0) continue;

      if (trade.side === 'BUY') {
        lots.push({ qty, unitCost: price + fees / qty });
      } else {
        let remaining = qty;
        let fifoCost = 0;
        while (remaining > 1e-10 && lots.length) {
          const lot = lots[0];
          const used = Math.min(remaining, lot.qty);
          fifoCost += used * lot.unitCost;
          lot.qty -= used;
          remaining -= used;
          if (lot.qty <= 1e-10) lots.shift();
        }
        const soldQty = qty - remaining;
        const feeShare = qty > 0 ? fees * (soldQty / qty) : 0;
        const proceeds = soldQty * price - feeShare;
        realized += proceeds - fifoCost;
      }
    }

    const quantity = lots.reduce((s, l) => s + l.qty, 0);
    const costBasis = lots.reduce((s, l) => s + l.qty * l.unitCost, 0);
    const averageCost = quantity > 0 ? costBasis / quantity : 0;
    const marketValue = quantity * (Number(security.current_price) || 0);
    const unrealized = marketValue - costBasis;
    const unrealizedPct = costBasis > 0 ? (unrealized / costBasis) * 100 : 0;

    return { security, quantity, costBasis, averageCost, marketValue, unrealized, unrealizedPct, realized };
  });
}

export function financeTotals(
  accounts: Account[], positions: Position[], properties: Property[], pensions: Pension[], debtors: Debtor[], liabilities: Liability[],
): FinanceTotals {
  const cash = accounts.filter((a) => a.include_networth).reduce((s, a) => s + (Number(a.balance) || 0), 0);
  const investments = positions.reduce((s, p) => s + p.marketValue, 0);
  const realEstate = properties.reduce((s, p) => {
    const ownership = (Number(p.ownership_pct) || 0) / 100;
    return s + Math.max(0, (Number(p.latest_valuation) || 0) * ownership - (Number(p.outstanding_debt) || 0) * ownership);
  }, 0);
  const pensionValue = pensions.reduce((s, p) => s + (Number(p.current_value) || 0), 0);
  const debtorValue = debtors.filter((d) => d.status !== 'paid').reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const liabilityValue = liabilities.reduce((s, l) => s + (Number(l.outstanding_balance) || 0), 0);
  return {
    cash,
    investments,
    realEstate,
    pensions: pensionValue,
    debtors: debtorValue,
    liabilities: liabilityValue,
    netWorth: cash + investments + realEstate + pensionValue + debtorValue - liabilityValue,
  };
}

export function monthlyCashflow(transactions: Transaction[], month: string) {
  const rows = transactions.filter((t) => t.date.startsWith(month));
  const income = rows.filter((t) => t.type === 'income').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const expenses = rows.filter((t) => t.type === 'expense').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const investmentFlows = rows.filter((t) => t.type === 'investment').reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const savings = income - expenses;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  return { income, expenses, investmentFlows, savings, savingsRate };
}

export function monthlySeries(transactions: Transaction[]) {
  const map = new Map<string, { month: string; income: number; expenses: number; savings: number }>();
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    const row = map.get(month) ?? { month, income: 0, expenses: 0, savings: 0 };
    if (t.type === 'income') row.income += Math.abs(Number(t.amount) || 0);
    if (t.type === 'expense') row.expenses += Math.abs(Number(t.amount) || 0);
    row.savings = row.income - row.expenses;
    map.set(month, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-36);
}

export function cgtByYear(securities: Security[], trades: Trade[]) {
  const result = new Map<string, { year: string; realized: number; proceeds: number; cost: number }>();

  for (const security of securities) {
    const lots: Array<{ qty: number; unitCost: number }> = [];
    const related = trades.filter((t) => t.security_id === security.id).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
    for (const trade of related) {
      const qty = Math.abs(Number(trade.quantity) || 0);
      const price = Number(trade.price) || 0;
      const fees = Number(trade.fees) || 0;
      if (trade.side === 'BUY') {
        if (qty > 0) lots.push({ qty, unitCost: price + fees / qty });
        continue;
      }
      let remaining = qty;
      let cost = 0;
      while (remaining > 1e-10 && lots.length) {
        const lot = lots[0];
        const used = Math.min(remaining, lot.qty);
        cost += used * lot.unitCost;
        lot.qty -= used;
        remaining -= used;
        if (lot.qty <= 1e-10) lots.shift();
      }
      const soldQty = qty - remaining;
      const proceeds = soldQty * price - (qty > 0 ? fees * soldQty / qty : 0);
      const realized = proceeds - cost;
      const year = trade.date.slice(0, 4);
      const row = result.get(year) ?? { year, realized: 0, proceeds: 0, cost: 0 };
      row.realized += realized;
      row.proceeds += proceeds;
      row.cost += cost;
      result.set(year, row);
    }
  }
  return [...result.values()].sort((a, b) => b.year.localeCompare(a.year));
}

export function recurringMonthlyEquivalent(amount: number, frequency: string) {
  const f = frequency.toLowerCase();
  if (f.includes('week')) return amount * 52 / 12;
  if (f.includes('quarter')) return amount / 3;
  if (f.includes('year') || f.includes('annual')) return amount / 12;
  if (f.includes('day')) return amount * 365 / 12;
  return amount;
}
