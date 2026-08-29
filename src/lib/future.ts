import type {
  FutureEvent, FutureProjectionPoint, FutureProjectionResult, FutureScenario, FutureStartingPoint,
} from '../types';

function monthlyRate(annualPct: number) {
  return Math.pow(1 + (Number(annualPct) || 0) / 100, 1 / 12) - 1;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1, 12, 0, 0, 0);
}

function eventMonth(value?: string | null) {
  return value ? value.slice(0, 7) : '';
}

function monthsBetween(start: string, current: string) {
  const [sy, sm] = start.split('-').map(Number);
  const [cy, cm] = current.split('-').map(Number);
  if (!sy || !sm || !cy || !cm) return 0;
  return Math.max(0, (cy - sy) * 12 + (cm - sm));
}

function eventAmount(event: FutureEvent, month: string) {
  const annual = Number(event.annual_growth_pct || 0);
  const elapsed = monthsBetween(eventMonth(event.start_date), month);
  return Number(event.amount || 0) * Math.pow(1 + annual / 100, elapsed / 12);
}

function inRange(event: FutureEvent, month: string) {
  const start = eventMonth(event.start_date);
  const end = eventMonth(event.end_date);
  return month >= start && (!end || month <= end);
}

function details(event: FutureEvent): Record<string, number | string | boolean> {
  if (!event.details_json) return {};
  try {
    const value = JSON.parse(event.details_json);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

export function monthlyMortgagePayment(principal: number, annualInterestPct: number, termYears: number) {
  const p = Math.max(0, Number(principal) || 0);
  const n = Math.max(1, Math.round((Number(termYears) || 0) * 12));
  const r = Math.max(0, Number(annualInterestPct) || 0) / 100 / 12;
  if (!p) return 0;
  if (!r) return p / n;
  return p * r / (1 - Math.pow(1 + r, -n));
}

export function startingNetWorth(start: FutureStartingPoint) {
  return start.cash + start.investments + start.realEstate + start.pensions + start.receivables + start.businessEquity - start.liabilities;
}

interface MortgageState {
  eventId: number;
  balance: number;
  payment: number;
  monthlyRate: number;
  startMonth: string;
  replacedMonthlyHousingCost: number;
}

export function projectScenario(
  start: FutureStartingPoint,
  scenario: FutureScenario,
  events: FutureEvent[],
  startDate = new Date(),
): FutureProjectionResult {
  const horizonMonths = Math.max(12, Math.round(Math.max(1, Number(scenario.horizon_years) || 1) * 12));
  const investmentRate = monthlyRate(scenario.annual_return_pct);
  const cashRate = monthlyRate(scenario.cash_return_pct);
  const propertyRate = monthlyRate(scenario.property_growth_pct);
  const pensionRate = monthlyRate(scenario.pension_growth_pct);
  const businessRate = monthlyRate(scenario.business_growth_pct ?? start.businessGrowthPct ?? 0);
  const incomeRate = monthlyRate(scenario.income_growth_pct);
  const expenseRate = monthlyRate((Number(scenario.inflation_pct) || 0) + (Number(scenario.expense_growth_pct) || 0));

  let cash = Number(start.cash) || 0;
  let investments = Number(start.investments) || 0;
  let realEstate = Number(start.realEstate) || 0;
  let pensions = Number(start.pensions) || 0;
  let businessEquity = Number(start.businessEquity) || 0;
  const receivables = Number(start.receivables) || 0;
  let baseLiabilities = Math.max(0, Number(start.liabilities) || 0);
  const baseIncome = scenario.baseline_income_override == null
    ? Number(start.monthlyIncome) || 0
    : Number(scenario.baseline_income_override) || 0;
  const baseExpenses = scenario.baseline_expense_override == null
    ? Number(start.monthlyExpenses) || 0
    : Number(scenario.baseline_expense_override) || 0;

  const activeMortgages = new Map<number, MortgageState>();
  let retirementReplacementIncome: number | null = null;
  let cumulativeSavings = 0;
  let minimumCash = cash;
  let fiDate: string | null = null;
  const points: FutureProjectionPoint[] = [];
  const orderedEvents = events.slice().sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id);

  const startMonthDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1, 12, 0, 0, 0);

  for (let i = 0; i <= horizonMonths; i++) {
    const date = addMonths(startMonthDate, i);
    const month = monthKey(date);

    if (i > 0) {
      cash *= 1 + cashRate;
      investments *= 1 + investmentRate;
      realEstate *= 1 + propertyRate;
      pensions *= 1 + pensionRate;
      businessEquity *= 1 + businessRate;
    }

    // Existing non-mortgage debt amortisation. The payment is assumed to already
    // be represented inside baseline expenses, so this only changes the balance sheet.
    if (i > 0 && baseLiabilities > 0 && start.existingDebtMonthlyPayment > 0) {
      const monthlyInterest = Math.max(0, start.existingDebtInterestPct) / 100 / 12;
      const interest = baseLiabilities * monthlyInterest;
      const principal = Math.max(0, Math.min(baseLiabilities, start.existingDebtMonthlyPayment - interest));
      baseLiabilities = Math.max(0, baseLiabilities - principal);
    }

    let income = baseIncome * Math.pow(1 + incomeRate, i);
    let expenses = baseExpenses * Math.pow(1 + expenseRate, i);

    // A retirement event replaces the baseline earned income from its start month onward.
    const retirementEvents = orderedEvents.filter(e => e.event_type === 'retirement' && eventMonth(e.start_date) <= month);
    if (retirementEvents.length) {
      const latest = retirementEvents.at(-1)!;
      retirementReplacementIncome = eventAmount(latest, month);
    }
    if (retirementReplacementIncome != null) income = Math.max(0, retirementReplacementIncome);

    for (const event of orderedEvents) {
      const startMonth = eventMonth(event.start_date);
      const amount = eventAmount(event, month);

      if (event.event_type === 'monthly_income_change' && inRange(event, month)) income += amount;
      if (event.event_type === 'monthly_expense_change' && inRange(event, month)) expenses += amount;

      if (month === startMonth) {
        if (event.event_type === 'one_off_income') cash += amount;
        if (event.event_type === 'one_off_expense') cash -= Math.abs(amount);
        if (event.event_type === 'investment_lump_sum') {
          const transfer = Math.max(0, amount);
          cash -= transfer;
          investments += transfer;
        }
        if (event.event_type === 'home_purchase') {
          const d = details(event);
          const purchasePrice = Math.max(0, Number(d.purchasePrice ?? amount) || 0);
          const downPayment = Math.max(0, Number(d.downPayment ?? 0) || 0);
          const closingCosts = Math.max(0, Number(d.closingCosts ?? 0) || 0);
          const principal = Math.max(0, Number(d.mortgagePrincipal ?? Math.max(0, purchasePrice - downPayment)) || 0);
          const interestPct = Math.max(0, Number(d.interestPct ?? 3) || 0);
          const termYears = Math.max(1, Number(d.termYears ?? 20) || 20);
          const replacedMonthlyHousingCost = Math.max(0, Number(d.replacedMonthlyHousingCost ?? 0) || 0);
          realEstate += purchasePrice;
          cash -= downPayment + closingCosts;
          activeMortgages.set(event.id, {
            eventId: event.id,
            balance: principal,
            payment: monthlyMortgagePayment(principal, interestPct, termYears),
            monthlyRate: interestPct / 100 / 12,
            startMonth,
            replacedMonthlyHousingCost,
          });
        }
      }
    }

    // Mortgage payments begin one month after the purchase. The monthly payment
    // replaces any existing housing cost explicitly supplied by the user.
    for (const mortgage of activeMortgages.values()) {
      if (month <= mortgage.startMonth || mortgage.balance <= 0) continue;
      const interest = mortgage.balance * mortgage.monthlyRate;
      const payment = Math.min(mortgage.balance + interest, mortgage.payment);
      const principal = Math.max(0, payment - interest);
      mortgage.balance = Math.max(0, mortgage.balance - principal);
      expenses += payment - mortgage.replacedMonthlyHousingCost;
    }

    expenses = Math.max(0, expenses);
    const savings = income - expenses;
    cumulativeSavings += savings;

    if (i > 0) {
      if (savings >= 0) {
        const investPct = Math.max(0, Math.min(100, Number(scenario.surplus_to_invest_pct) || 0)) / 100;
        investments += savings * investPct;
        cash += savings * (1 - investPct);
      } else {
        cash += savings;
      }
      pensions += Math.max(0, Number(scenario.pension_monthly_contribution) || 0);
    }
    if (cash < 0 && scenario.auto_fund_deficits) {
      const need = -cash;
      const withdrawal = Math.min(Math.max(0, investments), need);
      investments -= withdrawal;
      cash += withdrawal;
    }

    minimumCash = Math.min(minimumCash, cash);
    const mortgageLiabilities = [...activeMortgages.values()].reduce((sum, mortgage) => sum + Math.max(0, mortgage.balance), 0);
    const liabilities = baseLiabilities + mortgageLiabilities;
    const eligibleBusiness = Math.max(0,businessEquity) * Math.max(0,Math.min(100,Number(start.businessFiEligiblePct)||0)) / 100;
    const investableAssets = cash + investments + (scenario.include_pensions_in_fi ? pensions : 0) + (scenario.include_business_in_fi ? eligibleBusiness : 0);
    const netWorth = cash + investments + realEstate + pensions + receivables + businessEquity - liabilities;
    const annualExpenses = Math.max(0, expenses * 12);
    const requiredFiAssets = scenario.withdrawal_rate_pct > 0
      ? annualExpenses / (scenario.withdrawal_rate_pct / 100)
      : Number.POSITIVE_INFINITY;
    if (!fiDate && investableAssets >= requiredFiAssets && requiredFiAssets > 0) fiDate = `${month}-01`;

    points.push({
      date: `${month}-01`, monthIndex: i, cash, investments, realEstate, pensions, receivables,
      liabilities, businessEquity, investableAssets, netWorth, income, expenses, savings,
    });
  }

  const last = points.at(-1)!;
  return {
    points,
    fiDate,
    horizonNetWorth: last.netWorth,
    horizonInvestable: last.investableAssets,
    minimumCash,
    cumulativeSavings,
    startingNetWorth: startingNetWorth(start),
  };
}

export function projectionYearly(points: FutureProjectionPoint[]) {
  if (!points.length) return [];
  const output: FutureProjectionPoint[] = [];
  for (const point of points) {
    const year = point.date.slice(0, 4);
    const last = output.at(-1);
    if (!last || last.date.slice(0, 4) !== year) output.push(point);
    else output[output.length - 1] = point;
  }
  return output;
}

export function formatFiDate(value: string | null) {
  if (!value) return 'Beyond horizon';
  const date = new Date(`${value.slice(0, 7)}-01T12:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
