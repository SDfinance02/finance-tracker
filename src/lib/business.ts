import type { BusinessAdvancePayment, BusinessAsset, BusinessEntity, BusinessTaxSettings, BusinessTransaction } from '../types';

export const BELGIAN_TAX_RULES_2026: BusinessTaxSettings = {
  entity_id: 0,
  tax_year: 2026,
  standard_cit_pct: 25,
  reduced_cit_pct: 20,
  reduced_threshold: 100000,
  minimum_remuneration: 50000,
  bik_limit_pct: 20,
  advance_surcharge_pct: 6.75,
  advance_base_multiplier: 1.02,
  va1_credit_pct: 9,
  va2_credit_pct: 7.5,
  va3_credit_pct: 6,
  va4_credit_pct: 4.5,
  ordinary_dividend_wht_pct: 30,
  vvprbis_wht_pct: 18,
  liquidation_reserve_creation_tax_pct: 10,
  liquidation_reserve_wht_pct: 9.8,
  updated_at: '',
};

export function businessSignedCash(tx: BusinessTransaction): number {
  return tx.flow === 'in' ? Number(tx.gross_amount || 0) : -Number(tx.gross_amount || 0);
}

export function businessCash(entity: BusinessEntity, txs: BusinessTransaction[]): number {
  return Number(entity.opening_cash || 0) + txs.reduce((sum, tx) => sum + businessSignedCash(tx), 0);
}

export function currentYearTx(txs: BusinessTransaction[], year: number) {
  return txs.filter(tx => Number(tx.date.slice(0, 4)) === year);
}

export function depreciationForYear(asset: BusinessAsset, year: number): number {
  if (!asset.purchase_date || asset.depreciation_years <= 0) return 0;
  const purchaseYear = Number(asset.purchase_date.slice(0, 4));
  const endYear = purchaseYear + Math.max(1, Math.round(asset.depreciation_years)) - 1;
  if (year < purchaseYear || year > endYear) return 0;
  const base = Math.max(0, Number(asset.purchase_value_ex_vat || 0) - Number(asset.residual_value || 0));
  return base / Math.max(1, Number(asset.depreciation_years || 1));
}

export interface BusinessYearSummary {
  revenue: number;
  operatingCosts: number;
  remunerationCosts: number;
  accountingDepreciation: number;
  accountingProfit: number;
  deductibleCosts: number;
  deductibleDepreciation: number;
  taxableProfit: number;
  vatCollected: number;
  vatDeductible: number;
  vatPosition: number;
}

export function summarizeBusinessYear(txs: BusinessTransaction[], assets: BusinessAsset[], year: number): BusinessYearSummary {
  const rows = currentYearTx(txs, year);
  let revenue = 0;
  let operatingCosts = 0;
  let remunerationCosts = 0;
  let deductibleCosts = 0;
  let vatCollected = 0;
  let vatDeductible = 0;

  for (const tx of rows) {
    const net = Math.max(0, Number(tx.net_amount || 0));
    const vat = Math.max(0, Number(tx.vat_amount || 0));
    const taxDeductible = Math.max(0, Math.min(100, Number(tx.tax_deductible_pct ?? 100))) / 100;
    const vatDeductiblePct = Math.max(0, Math.min(100, Number(tx.vat_deductible_pct ?? 100))) / 100;
    if (tx.flow === 'in' && tx.kind === 'revenue') {
      revenue += net;
      vatCollected += vat;
    }
    if (tx.flow === 'out' && ['expense', 'salary'].includes(tx.kind)) {
      if (tx.kind === 'salary') remunerationCosts += net;
      else operatingCosts += net;
      deductibleCosts += net * taxDeductible;
      vatDeductible += vat * vatDeductiblePct;
    }
    if (tx.flow === 'out' && tx.kind === 'asset') {
      vatDeductible += vat * vatDeductiblePct;
    }
  }

  const accountingDepreciation = assets.reduce((sum, asset) => sum + depreciationForYear(asset, year), 0);
  const deductibleDepreciation = assets.reduce((sum, asset) => {
    const dep = depreciationForYear(asset, year);
    return sum + dep * Math.max(0, Math.min(100, Number(asset.tax_deductible_pct ?? 100))) / 100;
  }, 0);
  const accountingProfit = revenue - operatingCosts - remunerationCosts - accountingDepreciation;
  const taxableProfit = Math.max(0, revenue - deductibleCosts - deductibleDepreciation);

  return {
    revenue,
    operatingCosts,
    remunerationCosts,
    accountingDepreciation,
    accountingProfit,
    deductibleCosts,
    deductibleDepreciation,
    taxableProfit,
    vatCollected,
    vatDeductible,
    vatPosition: vatCollected - vatDeductible,
  };
}

export interface ReducedRateCheck {
  eligible: boolean;
  remunerationOk: boolean;
  bikOk: boolean;
  reason: string;
}

export function reducedRateCheck(entity: BusinessEntity, settings: BusinessTaxSettings, taxableProfit: number): ReducedRateCheck {
  const salary = Number(entity.director_remuneration || 0);
  const bik = Number(entity.benefits_in_kind || 0);
  const requiredSalary = Math.min(Number(settings.minimum_remuneration || 0), Math.max(0, taxableProfit));
  const remunerationOk = salary >= requiredSalary;
  const bikRatio = salary > 0 ? (bik / salary) * 100 : (bik > 0 ? 999 : 0);
  const bikOk = bikRatio <= Number(settings.bik_limit_pct || 0);
  const eligible = Boolean(entity.small_company) && Boolean(entity.use_reduced_rate) && remunerationOk && bikOk;
  const reason = !entity.small_company ? 'Entity is not marked as a small company.'
    : !entity.use_reduced_rate ? 'Reduced SME rate is disabled for this entity.'
    : !remunerationOk ? `Director remuneration is below the configured condition (${Math.round(requiredSalary).toLocaleString('nl-BE')} EUR).`
    : !bikOk ? `Lump-sum benefits in kind exceed ${settings.bik_limit_pct}% of director remuneration.`
    : 'Configured SME-rate conditions are met.';
  return { eligible, remunerationOk, bikOk, reason };
}

export function estimateCorporateTax(taxableProfit: number, reducedEligible: boolean, settings: BusinessTaxSettings): number {
  const profit = Math.max(0, taxableProfit);
  if (!reducedEligible) return profit * Number(settings.standard_cit_pct || 0) / 100;
  const threshold = Math.max(0, Number(settings.reduced_threshold || 0));
  return Math.min(profit, threshold) * Number(settings.reduced_cit_pct || 0) / 100
    + Math.max(0, profit - threshold) * Number(settings.standard_cit_pct || 0) / 100;
}

export function estimateAdvanceSurcharge(corporateTax: number, payments: BusinessAdvancePayment[], settings: BusinessTaxSettings, exempt: boolean): {grossSurcharge:number; credits:number; estimatedSurcharge:number} {
  if (exempt) return { grossSurcharge: 0, credits: 0, estimatedSurcharge: 0 };
  const grossSurcharge = Math.max(0, corporateTax) * Number(settings.advance_base_multiplier || 1) * Number(settings.advance_surcharge_pct || 0) / 100;
  const creditRate: Record<number, number> = {
    1: settings.va1_credit_pct,
    2: settings.va2_credit_pct,
    3: settings.va3_credit_pct,
    4: settings.va4_credit_pct,
  };
  const credits = payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount || 0)) * Number(creditRate[p.quarter] || 0) / 100, 0);
  return { grossSurcharge, credits, estimatedSurcharge: Math.max(0, grossSurcharge - credits) };
}

export function monthSeries(txs: BusinessTransaction[], year: number) {
  const rows = Array.from({ length: 12 }, (_, i) => ({ month: `${year}-${String(i + 1).padStart(2, '0')}`, revenue: 0, costs: 0 }));
  const map = new Map(rows.map(r => [r.month, r]));
  currentYearTx(txs, year).forEach(tx => {
    const bucket = map.get(tx.date.slice(0, 7));
    if (!bucket) return;
    if (tx.flow === 'in' && tx.kind === 'revenue') bucket.revenue += Number(tx.net_amount || 0);
    if (tx.flow === 'out' && ['expense', 'salary'].includes(tx.kind)) bucket.costs += Number(tx.net_amount || 0);
  });
  return rows;
}

export interface ExtractionOption {
  key: string;
  label: string;
  personalNet: number;
  companyRetained: number;
  taxLeakage: number;
  timing: string;
  note: string;
}

export function extractionOptions(preTaxProfit: number, entity: BusinessEntity, settings: BusinessTaxSettings, effectiveSalaryBurdenPct: number): ExtractionOption[] {
  const profit = Math.max(0, preTaxProfit);
  const check = reducedRateCheck(entity, settings, profit);
  const cit = estimateCorporateTax(profit, check.eligible, settings);
  const afterCit = Math.max(0, profit - cit);
  const ordinaryNet = afterCit * (1 - settings.ordinary_dividend_wht_pct / 100);
  const vvprNet = afterCit * (1 - settings.vvprbis_wht_pct / 100);
  const reservePrincipal = afterCit / (1 + settings.liquidation_reserve_creation_tax_pct / 100);
  const reserveNet = reservePrincipal * (1 - settings.liquidation_reserve_wht_pct / 100);
  const salaryNet = profit * (1 - Math.max(0, Math.min(100, effectiveSalaryBurdenPct)) / 100);
  return [
    { key:'keep', label:'Keep in BV', personalNet:0, companyRetained:afterCit, taxLeakage:cit, timing:'Now', note:'After estimated corporate income tax; capital remains inside the company.' },
    { key:'salary', label:'Additional remuneration', personalNet:salaryNet, companyRetained:0, taxLeakage:profit-salaryNet, timing:'Now', note:'Uses your configurable effective personal tax + social contribution burden. This is deliberately an approximation.' },
    { key:'ordinary', label:'Ordinary dividend', personalNet:ordinaryNet, companyRetained:0, taxLeakage:profit-ordinaryNet, timing:'After distribution', note:`Estimated corporate tax followed by ${settings.ordinary_dividend_wht_pct}% withholding tax.` },
    { key:'vvpr', label:'VVPR-bis', personalNet:vvprNet, companyRetained:0, taxLeakage:profit-vvprNet, timing:'After eligibility / waiting', note:`Planning illustration using ${settings.vvprbis_wht_pct}% withholding after the configured waiting period. Verify eligibility.` },
    { key:'reserve', label:'Liquidation reserve', personalNet:reserveNet, companyRetained:0, taxLeakage:profit-reserveNet, timing:'After waiting period', note:`Illustration assumes a ${settings.liquidation_reserve_creation_tax_pct}% levy when constituting the reserve and ${settings.liquidation_reserve_wht_pct}% withholding after the waiting period.` },
  ];
}
