import type {
  FutureEvent, FutureRiskSettings, FutureScenario, FutureStartingPoint,
  MonteCarloDistributionBucket, MonteCarloPercentilePoint, MonteCarloResult,
} from '../types';
import { monthlyMortgagePayment } from './future';

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function addMonths(date: Date, count: number) { return new Date(date.getFullYear(), date.getMonth() + count, 1, 12, 0, 0, 0); }
function eventMonth(value?: string | null) { return value ? value.slice(0, 7) : ''; }
function monthsBetween(start: string, current: string) {
  const [sy, sm] = start.split('-').map(Number), [cy, cm] = current.split('-').map(Number);
  return !sy || !sm || !cy || !cm ? 0 : Math.max(0, (cy - sy) * 12 + (cm - sm));
}
function eventAmount(event: FutureEvent, month: string) {
  const elapsed = monthsBetween(eventMonth(event.start_date), month);
  return Number(event.amount || 0) * Math.pow(1 + Number(event.annual_growth_pct || 0) / 100, elapsed / 12);
}
function inRange(event: FutureEvent, month: string) {
  const start = eventMonth(event.start_date), end = eventMonth(event.end_date);
  return month >= start && (!end || month <= end);
}
function details(event: FutureEvent): Record<string, number | string | boolean> {
  if (!event.details_json) return {};
  try { const v = JSON.parse(event.details_json); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function normal(rng: () => number) {
  const u = Math.max(1e-12, rng()), v = Math.max(1e-12, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function stochasticMonthlyFactor(annualPct: number, annualVolPct: number, z: number) {
  const mu = Math.log(Math.max(0.0001, 1 + (Number(annualPct) || 0) / 100));
  const sigma = Math.max(0, Number(annualVolPct) || 0) / 100;
  return Math.exp((mu - 0.5 * sigma * sigma) / 12 + sigma / Math.sqrt(12) * z);
}
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function medianMonth(months: number[]) {
  if (!months.length) return null;
  const sorted = months.slice().sort((a,b)=>a-b);
  return Math.round(percentile(sorted, .5));
}

interface MortgageState { balance:number; payment:number; monthlyRate:number; startMonth:string; replacedMonthlyHousingCost:number; }
interface SinglePathResult {
  yearly: Array<{date:string;netWorth:number;investable:number}>;
  horizonNetWorth:number; horizonInvestable:number; fiMonth:number|null;
  cashStress:boolean; planFailed:boolean; minimumLiquid:number;
}

function simulatePath(start: FutureStartingPoint, scenario: FutureScenario, events: FutureEvent[], settings: FutureRiskSettings, seed: number, startDate: Date): SinglePathResult {
  const rng = mulberry32(seed);
  const horizonMonths = Math.max(12, Math.round(Math.max(1, Number(scenario.horizon_years) || 1) * 12));
  let cash=Number(start.cash)||0, investments=Number(start.investments)||0, realEstate=Number(start.realEstate)||0, pensions=Number(start.pensions)||0;
  const receivables=Number(start.receivables)||0;
  let baseLiabilities=Math.max(0,Number(start.liabilities)||0);
  const baseIncome=scenario.baseline_income_override==null?Number(start.monthlyIncome)||0:Number(scenario.baseline_income_override)||0;
  const baseExpenses=scenario.baseline_expense_override==null?Number(start.monthlyExpenses)||0:Number(scenario.baseline_expense_override)||0;
  const activeMortgages=new Map<number,MortgageState>();
  const ordered=events.slice().sort((a,b)=>a.start_date.localeCompare(b.start_date)||a.id-b.id);
  let retirementReplacementIncome:number|null=null, fiMonth:number|null=null, cashStress=false, planFailed=false, minimumLiquid=cash+investments, inflationMultiplier=1;
  const yearly:SinglePathResult['yearly']=[];
  const startMonthDate=new Date(startDate.getFullYear(),startDate.getMonth(),1,12,0,0,0);
  const investPropertyRho=Math.max(-.95,Math.min(.95,Number(settings.property_equity_correlation)||0));
  const investPensionRho=Math.max(-.95,Math.min(.95,Number(settings.pension_equity_correlation)||0));

  for(let i=0;i<=horizonMonths;i++){
    const date=addMonths(startMonthDate,i), month=monthKey(date);
    let inflationStep=1;
    if(i>0){
      const zInv=normal(rng), zCash=normal(rng), zPropRaw=normal(rng), zPenRaw=normal(rng), zInfl=normal(rng);
      const zProp=investPropertyRho*zInv+Math.sqrt(1-investPropertyRho**2)*zPropRaw;
      const zPen=investPensionRho*zInv+Math.sqrt(1-investPensionRho**2)*zPenRaw;
      cash*=stochasticMonthlyFactor(scenario.cash_return_pct,settings.cash_volatility_pct,zCash);
      investments*=stochasticMonthlyFactor(scenario.annual_return_pct,settings.investment_volatility_pct,zInv);
      realEstate*=stochasticMonthlyFactor(scenario.property_growth_pct,settings.property_volatility_pct,zProp);
      pensions*=stochasticMonthlyFactor(scenario.pension_growth_pct,settings.pension_volatility_pct,zPen);
      if(i===Math.max(1,Number(settings.early_shock_month)||1) && Number(settings.early_shock_pct)<0) investments*=Math.max(0,1+Number(settings.early_shock_pct)/100);
      inflationStep=stochasticMonthlyFactor(scenario.inflation_pct,settings.inflation_volatility_pct,zInfl);
    }

    if(i>0&&baseLiabilities>0&&start.existingDebtMonthlyPayment>0){
      const interest=baseLiabilities*Math.max(0,start.existingDebtInterestPct)/100/12;
      const principal=Math.max(0,Math.min(baseLiabilities,start.existingDebtMonthlyPayment-interest));
      baseLiabilities=Math.max(0,baseLiabilities-principal);
    }

    const incomeGrowth=Math.pow(1+Math.max(-.99,scenario.income_growth_pct/100),i/12);
    let income=baseIncome*incomeGrowth;
    // Expense drift above inflation is deterministic; inflation itself follows a random walk.
    let expenses=baseExpenses*Math.pow(1+Math.max(-.99,scenario.expense_growth_pct/100),i/12);
    if(i>0) inflationMultiplier*=inflationStep;
    expenses*=inflationMultiplier;

    const retire=ordered.filter(e=>e.event_type==='retirement'&&eventMonth(e.start_date)<=month);
    if(retire.length) retirementReplacementIncome=eventAmount(retire.at(-1)!,month);
    if(retirementReplacementIncome!=null) income=Math.max(0,retirementReplacementIncome);

    for(const event of ordered){
      const sm=eventMonth(event.start_date), amount=eventAmount(event,month);
      if(event.event_type==='monthly_income_change'&&inRange(event,month)) income+=amount;
      if(event.event_type==='monthly_expense_change'&&inRange(event,month)) expenses+=amount;
      if(month===sm){
        if(event.event_type==='one_off_income')cash+=amount;
        if(event.event_type==='one_off_expense')cash-=Math.abs(amount);
        if(event.event_type==='investment_lump_sum'){const t=Math.max(0,amount);cash-=t;investments+=t;}
        if(event.event_type==='home_purchase'){
          const d=details(event), purchase=Math.max(0,Number(d.purchasePrice??amount)||0), down=Math.max(0,Number(d.downPayment??0)||0), costs=Math.max(0,Number(d.closingCosts??0)||0);
          const principal=Math.max(0,Number(d.mortgagePrincipal??Math.max(0,purchase-down))||0), rate=Math.max(0,Number(d.interestPct??3)||0), term=Math.max(1,Number(d.termYears??20)||20);
          realEstate+=purchase;cash-=down+costs;
          activeMortgages.set(event.id,{balance:principal,payment:monthlyMortgagePayment(principal,rate,term),monthlyRate:rate/100/12,startMonth:sm,replacedMonthlyHousingCost:Math.max(0,Number(d.replacedMonthlyHousingCost??0)||0)});
        }
      }
    }
    for(const mortgage of activeMortgages.values()){
      if(month<=mortgage.startMonth||mortgage.balance<=0)continue;
      const interest=mortgage.balance*mortgage.monthlyRate, payment=Math.min(mortgage.balance+interest,mortgage.payment), principal=Math.max(0,payment-interest);
      mortgage.balance=Math.max(0,mortgage.balance-principal);expenses+=payment-mortgage.replacedMonthlyHousingCost;
    }
    expenses=Math.max(0,expenses);
    const savings=income-expenses;
    if(i>0){
      if(savings>=0){const p=Math.max(0,Math.min(100,scenario.surplus_to_invest_pct))/100;investments+=savings*p;cash+=savings*(1-p);}else cash+=savings;
      pensions+=Math.max(0,Number(scenario.pension_monthly_contribution)||0);
    }
    if(cash<0){
      cashStress=true;
      if(scenario.auto_fund_deficits){const need=-cash,w=Math.min(Math.max(0,investments),need);investments-=w;cash+=w;}
    }
    const mortgages=[...activeMortgages.values()].reduce((s,m)=>s+Math.max(0,m.balance),0), liabilities=baseLiabilities+mortgages;
    const investable=cash+investments+(scenario.include_pensions_in_fi?pensions:0), netWorth=cash+investments+realEstate+pensions+receivables-liabilities;
    minimumLiquid=Math.min(minimumLiquid,cash+investments);
    if(cash+investments<0||netWorth<Number(settings.failure_floor||0)) planFailed=true;
    const required=scenario.withdrawal_rate_pct>0?Math.max(0,expenses*12)/(scenario.withdrawal_rate_pct/100):Infinity;
    if(fiMonth==null&&required>0&&investable>=required)fiMonth=i;
    if(i===0||i%12===0||i===horizonMonths)yearly.push({date:`${month}-01`,netWorth,investable});
  }
  const last=yearly.at(-1)!;
  return {yearly,horizonNetWorth:last.netWorth,horizonInvestable:last.investable,fiMonth,cashStress,planFailed,minimumLiquid};
}

function histogram(values:number[], buckets=12):MonteCarloDistributionBucket[]{
  if(!values.length)return[];
  const min=Math.min(...values),max=Math.max(...values); if(max<=min)return[{from:min,to:max,count:values.length}];
  const width=(max-min)/buckets, out=Array.from({length:buckets},(_,i)=>({from:min+i*width,to:min+(i+1)*width,count:0}));
  for(const v of values)out[Math.min(buckets-1,Math.floor((v-min)/width))].count++;
  return out;
}

export function runMonteCarlo(start:FutureStartingPoint,scenario:FutureScenario,events:FutureEvent[],settings:FutureRiskSettings,startDate=new Date()):MonteCarloResult{
  const n=Math.max(100,Math.min(20000,Math.round(Number(settings.simulations)||1000))), baseSeed=Math.round(Number(settings.random_seed)||260829);
  const horizon:number[]=[], investable:number[]=[], fiMonths:number[]=[], paths:SinglePathResult[]=[];
  let failures=0,cashStress=0;
  for(let i=0;i<n;i++){
    const path=simulatePath(start,scenario,events,settings,(baseSeed+i*2654435761)>>>0,startDate);paths.push(path);horizon.push(path.horizonNetWorth);investable.push(path.horizonInvestable);
    if(path.planFailed)failures++; if(path.cashStress)cashStress++; if(path.fiMonth!=null)fiMonths.push(path.fiMonth);
  }
  const horizonSorted=horizon.slice().sort((a,b)=>a-b), investSorted=investable.slice().sort((a,b)=>a-b);
  const count=Math.max(...paths.map(p=>p.yearly.length)); const percentilePoints:MonteCarloPercentilePoint[]=[];
  for(let j=0;j<count;j++){
    const vals=paths.map(p=>p.yearly[j]?.netWorth).filter((v):v is number=>Number.isFinite(v)).sort((a,b)=>a-b);
    const inv=paths.map(p=>p.yearly[j]?.investable).filter((v):v is number=>Number.isFinite(v)).sort((a,b)=>a-b);
    if(!vals.length)continue;
    percentilePoints.push({date:paths.find(p=>p.yearly[j])!.yearly[j].date,p10:percentile(vals,.10),p25:percentile(vals,.25),p50:percentile(vals,.50),p75:percentile(vals,.75),p90:percentile(vals,.90),investableP50:percentile(inv,.50)});
  }
  const medFi=medianMonth(fiMonths), fiDate=medFi==null?null:`${monthKey(addMonths(new Date(startDate.getFullYear(),startDate.getMonth(),1,12),medFi))}-01`;
  return {
    scenarioId:scenario.id,simulations:n,successProbability:1-failures/n,fiProbability:fiMonths.length/n,cashStressProbability:cashStress/n,
    p10HorizonNetWorth:percentile(horizonSorted,.10),medianHorizonNetWorth:percentile(horizonSorted,.50),p90HorizonNetWorth:percentile(horizonSorted,.90),
    medianHorizonInvestable:percentile(investSorted,.50),medianFiDate:fiDate,percentilePoints,distribution:histogram(horizonSorted),
  };
}
