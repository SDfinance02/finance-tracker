import type {
  BusinessAdvancePayment, BusinessAsset, BusinessBalanceItem, BusinessConsolidationSettings,
  BusinessEntity, BusinessInvoice, BusinessTaxSettings, BusinessTransaction, BusinessValuationBreakdown, HouseholdMemberSummary,
} from '../types';
import { businessCash, estimateCorporateTax, reducedRateCheck, summarizeBusinessYear } from './business';

export function defaultBusinessConsolidationSettings(entityId:number): BusinessConsolidationSettings {
  return {
    entity_id: entityId,
    ownership_pct: 100,
    valuation_mode: 'calculated',
    manual_equity_value: 0,
    include_in_personal: 1,
    include_in_household: 1,
    include_in_future: 1,
    include_in_fi: 0,
    future_growth_pct: 4,
    future_volatility_pct: 22,
    updated_at: '',
  };
}

export function businessValuation(
  entity: BusinessEntity,
  txs: BusinessTransaction[],
  assets: BusinessAsset[],
  invoices: BusinessInvoice[],
  payments: BusinessAdvancePayment[],
  taxSettings: BusinessTaxSettings,
  consolidation: BusinessConsolidationSettings,
  balanceItems: BusinessBalanceItem[],
): BusinessValuationBreakdown {
  const cash = businessCash(entity, txs);
  const receivables = invoices.filter(i=>i.direction==='receivable'&&i.status!=='paid').reduce((s,i)=>s+Math.max(0,Number(i.outstanding_amount)||0),0);
  const payables = invoices.filter(i=>i.direction==='payable'&&i.status!=='paid').reduce((s,i)=>s+Math.max(0,Number(i.outstanding_amount)||0),0);
  const fixedAssets = assets.reduce((s,a)=>s+Math.max(0,Number(a.current_book_value)||0),0);
  const investments = balanceItems.filter(i=>i.asset_class==='investments').reduce((s,i)=>s+Math.max(0,Number(i.value)||0),0);
  const realEstate = balanceItems.filter(i=>i.asset_class==='real_estate').reduce((s,i)=>s+Math.max(0,Number(i.value)||0),0);
  const otherAssets = balanceItems.filter(i=>i.asset_class==='other_asset').reduce((s,i)=>s+Math.max(0,Number(i.value)||0),0);
  const otherLiabilities = balanceItems.filter(i=>i.asset_class==='liability').reduce((s,i)=>s+Math.max(0,Number(i.value)||0),0);
  const year = entity.fiscal_year;
  const summary = summarizeBusinessYear(txs, assets, year);
  const check = reducedRateCheck(entity, taxSettings, summary.taxableProfit);
  const corporateTax = estimateCorporateTax(summary.taxableProfit, check.eligible, taxSettings);
  const advancePaid = payments.filter(p=>p.tax_year===year).reduce((s,p)=>s+Math.max(0,Number(p.amount)||0),0);
  const taxLiability = Math.max(0, corporateTax - advancePaid);
  const grossAssets = cash + receivables + fixedAssets + investments + realEstate + otherAssets;
  const liabilities = payables + taxLiability + otherLiabilities;
  const calculatedEquity = grossAssets - liabilities;
  const equity = consolidation.valuation_mode==='manual' ? Number(consolidation.manual_equity_value)||0 : calculatedEquity;
  const ownerEquity = equity * Math.max(0,Math.min(100,Number(consolidation.ownership_pct)||0))/100;
  return {cash,receivables,fixedAssets,investments,realEstate,otherAssets,payables,taxLiability,otherLiabilities,grossAssets,liabilities,calculatedEquity,equity,ownerEquity};
}

export function sumOwnerBusinessEquity(items:Array<{settings:BusinessConsolidationSettings; valuation:BusinessValuationBreakdown}>, mode:'personal'|'household'|'future') {
  return items.reduce((sum,item)=>{
    const include = mode==='personal'?item.settings.include_in_personal:mode==='household'?item.settings.include_in_household:item.settings.include_in_future;
    return sum + (include ? item.valuation.ownerEquity : 0);
  },0);
}

export async function currentBusinessProjectionContribution(mode:'personal'|'future'='future') {
  const { repo } = await import('./db');
  const entities = await repo.businessEntities();
  let equity = 0, weight = 0, weightedGrowth = 0, weightedVol = 0, fiEligible = 0;
  for (const entity of entities) {
    const [txs,assets,invoices,payments,tax,settings,items] = await Promise.all([
      repo.businessTransactions(entity.id), repo.businessAssets(entity.id), repo.businessInvoices(entity.id),
      repo.businessAdvancePayments(entity.id,entity.fiscal_year), repo.businessTaxSettings(entity.id,entity.fiscal_year),
      repo.businessConsolidationSettings(entity.id), repo.businessBalanceItems(entity.id),
    ]);
    if (mode==='future' ? !settings.include_in_future : !settings.include_in_personal) continue;
    const valuation = businessValuation(entity,txs,assets,invoices,payments,tax,settings,items);
    const value = valuation.ownerEquity;
    equity += value;
    const w = Math.abs(value);
    weight += w;
    weightedGrowth += w * Number(settings.future_growth_pct || 0);
    weightedVol += w * Number(settings.future_volatility_pct || 0);
    if (settings.include_in_fi) fiEligible += Math.max(0,value);
  }
  return {
    equity,
    growthPct: weight ? weightedGrowth / weight : 0,
    volatilityPct: weight ? weightedVol / weight : 0,
    fiEligiblePct: Math.max(0,equity) ? Math.max(0,Math.min(100,fiEligible/Math.max(0,equity)*100)) : 0,
  };
}

export function householdBusinessProjectionContribution(members: HouseholdMemberSummary[]) {
  let equity = 0, weight = 0, weightedGrowth = 0, weightedVolatility = 0, fiEligible = 0;
  for (const member of members) {
    const value = Number(member.business_future_equity ?? member.business_equity ?? 0) || 0;
    const w = Math.abs(value);
    equity += value;
    weight += w;
    weightedGrowth += w * (Number(member.business_growth_pct) || 0);
    weightedVolatility += w * (Number(member.business_volatility_pct) || 0);
    fiEligible += Math.max(0,value) * Math.max(0,Math.min(100,Number(member.business_fi_eligible_pct)||0))/100;
  }
  return {
    equity,
    growthPct: weight ? weightedGrowth / weight : 0,
    volatilityPct: weight ? weightedVolatility / weight : 0,
    fiEligiblePct: Math.max(0,equity) ? Math.max(0,Math.min(100,fiEligible/Math.max(0,equity)*100)) : 0,
  };
}
