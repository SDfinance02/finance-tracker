import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Banknote, Building2, CalendarClock, CheckCircle2, CircleDollarSign, FileCheck2, Landmark,
  Plus, ReceiptText, Settings2, ShieldAlert, Trash2, WalletCards,
} from 'lucide-react';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { KpiCard } from '../components/KpiCard';
import { Modal } from '../components/Modal';
import { execute, repo } from '../lib/db';
import {
  businessCash, estimateAdvanceSurcharge, estimateCorporateTax, extractionOptions, monthSeries,
  reducedRateCheck, summarizeBusinessYear,
} from '../lib/business';
import { money, todayIso } from '../lib/utils';
import type {
  BusinessAdvancePayment, BusinessAsset, BusinessEntity, BusinessFlow, BusinessInvoice,
  BusinessTaxSettings, BusinessTransaction, BusinessTransactionKind,
} from '../types';

const tabs = ['Overview','Ledger','Invoices','Assets','Tax center','Extraction lab'] as const;
type Tab = typeof tabs[number];

const blankEntity = (): Omit<BusinessEntity,'id'|'created_at'|'updated_at'> => ({
  name:'', company_type:'BV', enterprise_number:'', vat_number:'', incorporation_date:'', fiscal_year:new Date().getFullYear(),
  currency:'EUR', opening_cash:0, small_company:1, use_reduced_rate:1, advance_payment_exempt:0,
  director_remuneration:0, benefits_in_kind:0, notes:'',
});

const blankTx = () => ({
  date:todayIso(), flow:'out' as BusinessFlow, kind:'expense' as BusinessTransactionKind, category:'Professional costs',
  description:'', counterparty:'', net_amount:0, vat_rate:21, tax_deductible_pct:100, vat_deductible_pct:100, notes:'',
});

const blankInvoice = () => ({ direction:'receivable', counterparty:'', invoice_number:'', issue_date:todayIso(), due_date:'', amount_incl_vat:0, outstanding_amount:0, status:'open', notes:'' });
const blankAsset = () => ({ name:'', category:'Equipment', purchase_date:todayIso(), purchase_value_ex_vat:0, residual_value:0, depreciation_years:5, current_book_value:0, tax_deductible_pct:100, notes:'' });

function num(x: unknown) { const n=Number(x); return Number.isFinite(n)?n:0; }
function pct(x:number){return `${x.toFixed(1).replace('.0','')}%`;}
function isoNice(x?:string|null){if(!x)return '—';const d=new Date(`${x}T12:00:00`);return Number.isNaN(d.getTime())?x:d.toLocaleDateString('nl-BE',{day:'2-digit',month:'short',year:'numeric'});}

export function Business(){
  const [entities,setEntities]=useState<BusinessEntity[]>([]);
  const [entityId,setEntityId]=useState<number|null>(null);
  const [txs,setTxs]=useState<BusinessTransaction[]>([]);
  const [assets,setAssets]=useState<BusinessAsset[]>([]);
  const [invoices,setInvoices]=useState<BusinessInvoice[]>([]);
  const [payments,setPayments]=useState<BusinessAdvancePayment[]>([]);
  const [taxSettings,setTaxSettings]=useState<BusinessTaxSettings|null>(null);
  const [tab,setTab]=useState<Tab>('Overview');
  const [entityOpen,setEntityOpen]=useState(false); const [entityForm,setEntityForm]=useState(blankEntity()); const [editingEntity,setEditingEntity]=useState<BusinessEntity|null>(null);
  const [txOpen,setTxOpen]=useState(false); const [txForm,setTxForm]=useState(blankTx());
  const [invoiceOpen,setInvoiceOpen]=useState(false); const [invoiceForm,setInvoiceForm]=useState(blankInvoice());
  const [assetOpen,setAssetOpen]=useState(false); const [assetForm,setAssetForm]=useState(blankAsset());
  const [paymentOpen,setPaymentOpen]=useState(false); const [paymentForm,setPaymentForm]=useState({quarter:1,payment_date:todayIso(),amount:0,notes:''});
  const [taxOpen,setTaxOpen]=useState(false); const [busy,setBusy]=useState(false);
  const [extractionProfit,setExtractionProfit]=useState<number|null>(null); const [salaryBurden,setSalaryBurden]=useState(50);

  const activeEntity=useMemo(()=>entities.find(e=>e.id===entityId)??entities[0]??null,[entities,entityId]);
  const year=activeEntity?.fiscal_year??new Date().getFullYear();

  const loadEntities=useCallback(async()=>{
    const rows=await repo.businessEntities();setEntities(rows);
    setEntityId(prev=>prev&&rows.some(x=>x.id===prev)?prev:(rows[0]?.id??null));
  },[]);
  useEffect(()=>{loadEntities()},[loadEntities]);
  const loadEntityData=useCallback(async()=>{
    if(!activeEntity)return;
    const [t,a,i,p,s]=await Promise.all([
      repo.businessTransactions(activeEntity.id),repo.businessAssets(activeEntity.id),repo.businessInvoices(activeEntity.id),
      repo.businessAdvancePayments(activeEntity.id,activeEntity.fiscal_year),repo.businessTaxSettings(activeEntity.id,activeEntity.fiscal_year),
    ]);
    setTxs(t);setAssets(a);setInvoices(i);setPayments(p);setTaxSettings(s);
  },[activeEntity?.id,activeEntity?.fiscal_year]);
  useEffect(()=>{loadEntityData()},[loadEntityData]);

  const summary=useMemo(()=>summarizeBusinessYear(txs,assets,year),[txs,assets,year]);
  const rateCheck=useMemo(()=>activeEntity&&taxSettings?reducedRateCheck(activeEntity,taxSettings,summary.taxableProfit):null,[activeEntity,taxSettings,summary.taxableProfit]);
  const corporateTax=useMemo(()=>taxSettings&&rateCheck?estimateCorporateTax(summary.taxableProfit,rateCheck.eligible,taxSettings):0,[summary.taxableProfit,taxSettings,rateCheck]);
  const advance=useMemo(()=>taxSettings&&activeEntity?estimateAdvanceSurcharge(corporateTax,payments,taxSettings,Boolean(activeEntity.advance_payment_exempt)):{grossSurcharge:0,credits:0,estimatedSurcharge:0},[corporateTax,payments,taxSettings,activeEntity]);
  const cash=useMemo(()=>activeEntity?businessCash(activeEntity,txs):0,[activeEntity,txs]);
  const openReceivables=useMemo(()=>invoices.filter(i=>i.direction==='receivable'&&i.status!=='paid').reduce((s,i)=>s+num(i.outstanding_amount),0),[invoices]);
  const openPayables=useMemo(()=>invoices.filter(i=>i.direction==='payable'&&i.status!=='paid').reduce((s,i)=>s+num(i.outstanding_amount),0),[invoices]);
  const monthly=useMemo(()=>monthSeries(txs,year),[txs,year]);
  const extraction=useMemo(()=>activeEntity&&taxSettings?extractionOptions(extractionProfit??summary.taxableProfit,activeEntity,taxSettings,salaryBurden):[],[activeEntity,taxSettings,extractionProfit,summary.taxableProfit,salaryBurden]);

  const createEntity=()=>{setEditingEntity(null);setEntityForm(blankEntity());setEntityOpen(true)};
  const editEntity=()=>{if(!activeEntity)return;setEditingEntity(activeEntity);setEntityForm({name:activeEntity.name,company_type:activeEntity.company_type,enterprise_number:activeEntity.enterprise_number??'',vat_number:activeEntity.vat_number??'',incorporation_date:activeEntity.incorporation_date??'',fiscal_year:activeEntity.fiscal_year,currency:activeEntity.currency,opening_cash:activeEntity.opening_cash,small_company:activeEntity.small_company,use_reduced_rate:activeEntity.use_reduced_rate,advance_payment_exempt:activeEntity.advance_payment_exempt,director_remuneration:activeEntity.director_remuneration,benefits_in_kind:activeEntity.benefits_in_kind,notes:activeEntity.notes??''});setEntityOpen(true)};
  const saveEntity=async()=>{
    if(!entityForm.name.trim())return;setBusy(true);
    try{
      const v=[entityForm.name.trim(),entityForm.company_type,entityForm.enterprise_number||null,entityForm.vat_number||null,entityForm.incorporation_date||null,entityForm.fiscal_year,entityForm.currency,entityForm.opening_cash,entityForm.small_company,entityForm.use_reduced_rate,entityForm.advance_payment_exempt,entityForm.director_remuneration,entityForm.benefits_in_kind,entityForm.notes||null];
      if(editingEntity) await execute(`UPDATE business_entities SET name=$1,company_type=$2,enterprise_number=$3,vat_number=$4,incorporation_date=$5,fiscal_year=$6,currency=$7,opening_cash=$8,small_company=$9,use_reduced_rate=$10,advance_payment_exempt=$11,director_remuneration=$12,benefits_in_kind=$13,notes=$14,updated_at=CURRENT_TIMESTAMP WHERE id=$15`,[...v,editingEntity.id]);
      else await execute(`INSERT INTO business_entities(name,company_type,enterprise_number,vat_number,incorporation_date,fiscal_year,currency,opening_cash,small_company,use_reduced_rate,advance_payment_exempt,director_remuneration,benefits_in_kind,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,v);
      setEntityOpen(false);await loadEntities();
    }finally{setBusy(false)}
  };

  const saveTx=async()=>{if(!activeEntity||!txForm.description.trim())return;setBusy(true);try{
    const vat=num(txForm.net_amount)*num(txForm.vat_rate)/100;const gross=num(txForm.net_amount)+vat;
    await execute(`INSERT INTO business_transactions(entity_id,date,flow,kind,category,description,counterparty,net_amount,vat_amount,gross_amount,tax_deductible_pct,vat_deductible_pct,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,[activeEntity.id,txForm.date,txForm.flow,txForm.kind,txForm.category,txForm.description.trim(),txForm.counterparty||null,txForm.net_amount,vat,gross,txForm.tax_deductible_pct,txForm.vat_deductible_pct,txForm.notes||null]);
    setTxOpen(false);setTxForm(blankTx());await loadEntityData();
  }finally{setBusy(false)}};

  const saveInvoice=async()=>{if(!activeEntity||!invoiceForm.counterparty.trim())return;setBusy(true);try{
    const outstanding=invoiceForm.outstanding_amount||invoiceForm.amount_incl_vat;
    await execute(`INSERT INTO business_invoices(entity_id,direction,counterparty,invoice_number,issue_date,due_date,amount_incl_vat,outstanding_amount,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[activeEntity.id,invoiceForm.direction,invoiceForm.counterparty.trim(),invoiceForm.invoice_number||null,invoiceForm.issue_date,invoiceForm.due_date||null,invoiceForm.amount_incl_vat,outstanding,invoiceForm.status,invoiceForm.notes||null]);
    setInvoiceOpen(false);setInvoiceForm(blankInvoice());await loadEntityData();
  }finally{setBusy(false)}};

  const saveAsset=async()=>{if(!activeEntity||!assetForm.name.trim())return;setBusy(true);try{
    const book=assetForm.current_book_value||assetForm.purchase_value_ex_vat;
    await execute(`INSERT INTO business_assets(entity_id,name,category,purchase_date,purchase_value_ex_vat,residual_value,depreciation_years,current_book_value,tax_deductible_pct,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[activeEntity.id,assetForm.name.trim(),assetForm.category,assetForm.purchase_date,assetForm.purchase_value_ex_vat,assetForm.residual_value,assetForm.depreciation_years,book,assetForm.tax_deductible_pct,assetForm.notes||null]);
    setAssetOpen(false);setAssetForm(blankAsset());await loadEntityData();
  }finally{setBusy(false)}};

  const savePayment=async()=>{if(!activeEntity)return;setBusy(true);try{
    await execute(`INSERT INTO business_advance_payments(entity_id,tax_year,quarter,payment_date,amount,notes) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(entity_id,tax_year,quarter) DO UPDATE SET payment_date=excluded.payment_date,amount=excluded.amount,notes=excluded.notes`,[activeEntity.id,year,paymentForm.quarter,paymentForm.payment_date||null,paymentForm.amount,paymentForm.notes||null]);
    setPaymentOpen(false);await loadEntityData();
  }finally{setBusy(false)}};

  const saveTax=async()=>{if(!taxSettings)return;setBusy(true);try{await repo.saveBusinessTaxSettings(taxSettings);setTaxOpen(false);await loadEntityData()}finally{setBusy(false)}};
  const remove=async(table:string,id:number,label:string)=>{if(confirm(`Delete ${label}?`)){await execute(`DELETE FROM ${table} WHERE id=$1`,[id]);await loadEntityData()}};
  const markInvoicePaid=async(i:BusinessInvoice)=>{await execute(`UPDATE business_invoices SET status='paid',outstanding_amount=0,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[i.id]);await loadEntityData()};

  if(!activeEntity) return <><PageHeader title="My BV" subtitle="A Belgian company-management cockpit for cash, revenue, expenses, invoices, tax planning and distributions." actions={<button className="btn primary" onClick={createEntity}><Plus size={14}/>Create BV</button>}/><Card><EmptyState title="No company yet" description="Create your BV to start a separate business ledger. This does not mix business transactions with your private cashflow." action={<button className="btn primary" onClick={createEntity}>Create company</button>}/></Card><EntityModal/></>;

  const overdue=invoices.filter(i=>i.status!=='paid'&&i.due_date&&i.due_date<todayIso());
  const taxAfterPayments=Math.max(0,corporateTax-payments.reduce((s,p)=>s+num(p.amount),0));

  return <>
    <PageHeader title="My BV" subtitle="Belgian company cockpit · management view, not a substitute for statutory accounts or your accountant." actions={<><select className="select compact-select" value={activeEntity.id} onChange={e=>setEntityId(Number(e.target.value))}>{entities.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select><button className="btn" onClick={()=>{window.location.hash='/consolidation'}}><WalletCards size={14}/>Consolidated wealth</button><button className="btn" onClick={editEntity}><Settings2 size={14}/>Company</button><button className="btn primary" onClick={()=>{setTxForm(blankTx());setTxOpen(true)}}><Plus size={14}/>Entry</button></>}/>

    <div className="business-entity-strip"><div className="business-entity-mark"><Building2 size={18}/></div><div><strong>{activeEntity.name}</strong><span>{activeEntity.company_type} · {activeEntity.enterprise_number||'enterprise number not set'} · FY {year}</span></div><div className="business-strip-spacer"/><Badge tone={activeEntity.small_company?'green':'slate'}>{activeEntity.small_company?'Small company':'Standard company'}</Badge><span className="business-strip-meta">VAT {activeEntity.vat_number||'—'}</span></div>
    <div className="subnav">{tabs.map(x=><button key={x} className={tab===x?'active':''} onClick={()=>setTab(x)}>{x}</button>)}</div>

    {tab==='Overview'&&<>
      <div className="kpi-grid business-kpis">
        <KpiCard label="Estimated company cash" value={money(cash)} icon={<WalletCards size={16}/>} sub={`Opening cash ${money(activeEntity.opening_cash)}`}/>
        <KpiCard label={`Revenue · ${year}`} value={money(summary.revenue)} icon={<ReceiptText size={16}/>} sub="Net revenue registered in business ledger"/>
        <KpiCard label="Operating costs" value={money(summary.operatingCosts+summary.remunerationCosts)} icon={<Banknote size={16}/>} sub={`${money(summary.remunerationCosts)} director remuneration entries`}/>
        <KpiCard label="Estimated taxable profit" value={money(summary.taxableProfit)} icon={<CircleDollarSign size={16}/>} sub={`${rateCheck?.eligible?'Reduced SME rate model':'Standard rate model'}`}/>
        <KpiCard label="Estimated corporate tax" value={money(corporateTax)} icon={<Landmark size={16}/>} sub={`${money(taxAfterPayments)} less advance payments remaining`}/>
        <KpiCard label="Receivables" value={money(openReceivables)} icon={<FileCheck2 size={16}/>} sub={`${money(openPayables)} payables · ${overdue.length} overdue`}/>
      </div>
      <div className="grid two">
        <Card title="Revenue vs operating costs" subtitle={`Monthly management view for ${year}.`}><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthly}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="month" tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><YAxis tickFormatter={v=>`€${Math.round(Number(v)/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Bar dataKey="revenue" fill="var(--green)" radius={[4,4,0,0]}/><Bar dataKey="costs" fill="var(--accent)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></Card>
        <Card title="Tax & liquidity radar" subtitle="A planning dashboard based on entries currently registered.">
          <div className="business-radar">
            <div><span>Corporate tax estimate</span><strong>{money(corporateTax)}</strong></div>
            <div><span>Advance payments</span><strong>{money(payments.reduce((s,p)=>s+num(p.amount),0))}</strong></div>
            <div><span>Potential advance-payment surcharge</span><strong className={advance.estimatedSurcharge>0?'money-negative':''}>{money(advance.estimatedSurcharge)}</strong></div>
            <div><span>Approx. VAT position</span><strong>{money(summary.vatPosition)}</strong></div>
            <div><span>Open receivables</span><strong>{money(openReceivables)}</strong></div>
            <div><span>Open payables</span><strong>{money(openPayables)}</strong></div>
          </div>
          <div className={`notice ${rateCheck?.eligible?'info':'warn'}`} style={{marginTop:14}}>{rateCheck?.eligible?<><CheckCircle2 size={14}/> Reduced SME-rate conditions currently pass the configured checks.</>:<><ShieldAlert size={14}/> Reduced SME-rate model not currently applied: {rateCheck?.reason}</>}</div>
        </Card>
      </div>
      <div style={{height:16}}/><Card title="Recent business entries" actions={<button className="btn" onClick={()=>setTab('Ledger')}>Open ledger</button>}>
        {!txs.length?<EmptyState title="No business entries" description="Add revenue, costs, remuneration and other company cashflows."/>:<div className="table-shell"><table><thead><tr><th>Date</th><th>Description</th><th>Kind</th><th>Counterparty</th><th className="numeric">Net</th><th className="numeric">VAT</th><th className="numeric">Gross</th></tr></thead><tbody>{txs.slice(0,8).map(t=><tr key={t.id}><td>{isoNice(t.date)}</td><td><strong>{t.description}</strong><div className="mini muted">{t.category}</div></td><td><Badge tone={t.flow==='in'?'green':t.kind==='tax'?'amber':'slate'}>{t.kind}</Badge></td><td>{t.counterparty||'—'}</td><td className={`numeric ${t.flow==='in'?'money-positive':'money-negative'}`}>{t.flow==='in'?'+':'−'}{money(t.net_amount)}</td><td className="numeric">{money(t.vat_amount)}</td><td className="numeric">{money(t.gross_amount)}</td></tr>)}</tbody></table></div>}
      </Card>
    </>}

    {tab==='Ledger'&&<Card title="Business ledger" subtitle="Separate from your private Transactions ledger." actions={<button className="btn primary" onClick={()=>{setTxForm(blankTx());setTxOpen(true)}}><Plus size={14}/>Entry</button>}>
      {!txs.length?<EmptyState title="No ledger entries"/>:<div className="table-shell"><table><thead><tr><th>Date</th><th>Description</th><th>Flow</th><th>Category</th><th className="numeric">Net</th><th className="numeric">VAT</th><th className="numeric">Tax deductible</th><th></th></tr></thead><tbody>{txs.map(t=><tr key={t.id}><td>{isoNice(t.date)}</td><td><strong>{t.description}</strong><div className="mini muted">{t.counterparty||'—'}</div></td><td><Badge tone={t.flow==='in'?'green':'slate'}>{t.flow} · {t.kind}</Badge></td><td>{t.category}</td><td className="numeric">{money(t.net_amount)}</td><td className="numeric">{money(t.vat_amount)}</td><td className="numeric">{pct(t.tax_deductible_pct)}</td><td className="numeric"><button className="icon-button danger-icon" onClick={()=>remove('business_transactions',t.id,t.description)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
    </Card>}

    {tab==='Invoices'&&<>
      <div className="grid three" style={{marginBottom:16}}><Card><div className="business-mini-kpi"><span>Receivables</span><strong>{money(openReceivables)}</strong></div></Card><Card><div className="business-mini-kpi"><span>Payables</span><strong>{money(openPayables)}</strong></div></Card><Card><div className="business-mini-kpi"><span>Overdue</span><strong>{overdue.length}</strong></div></Card></div>
      <Card title="Invoices & working capital" subtitle="Administrative tracking; does not replace invoicing/accounting software." actions={<button className="btn primary" onClick={()=>{setInvoiceForm(blankInvoice());setInvoiceOpen(true)}}><Plus size={14}/>Invoice</button>}>
        {!invoices.length?<EmptyState title="No invoices"/>:<div className="table-shell"><table><thead><tr><th>Type</th><th>Counterparty</th><th>Invoice</th><th>Due</th><th className="numeric">Amount</th><th className="numeric">Outstanding</th><th>Status</th><th></th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td><Badge tone={i.direction==='receivable'?'green':'amber'}>{i.direction}</Badge></td><td><strong>{i.counterparty}</strong></td><td>{i.invoice_number||'—'}</td><td className={i.status!=='paid'&&i.due_date&&i.due_date<todayIso()?'money-negative':''}>{isoNice(i.due_date)}</td><td className="numeric">{money(i.amount_incl_vat)}</td><td className="numeric">{money(i.outstanding_amount)}</td><td>{i.status==='paid'?<Badge tone="green">paid</Badge>:<Badge tone="amber">{i.status}</Badge>}</td><td className="numeric"><div className="row-actions">{i.status!=='paid'&&<button className="btn tiny" onClick={()=>markInvoicePaid(i)}>Paid</button>}<button className="icon-button danger-icon" onClick={()=>remove('business_invoices',i.id,'invoice')}><Trash2 size={14}/></button></div></td></tr>)}</tbody></table></div>}
      </Card>
    </>}

    {tab==='Assets'&&<Card title="Company assets & depreciation" subtitle="Straight-line management estimate. Tax deductibility remains configurable per asset." actions={<button className="btn primary" onClick={()=>{setAssetForm(blankAsset());setAssetOpen(true)}}><Plus size={14}/>Asset</button>}>
      {!assets.length?<EmptyState title="No company assets" description="Register equipment, IT, vehicles and other capital assets."/>:<div className="table-shell"><table><thead><tr><th>Asset</th><th>Purchased</th><th>Category</th><th className="numeric">Purchase ex VAT</th><th className="numeric">Book value</th><th className="numeric">Depreciation</th><th className="numeric">Tax deductible</th><th></th></tr></thead><tbody>{assets.map(a=><tr key={a.id}><td><strong>{a.name}</strong></td><td>{isoNice(a.purchase_date)}</td><td>{a.category}</td><td className="numeric">{money(a.purchase_value_ex_vat)}</td><td className="numeric">{money(a.current_book_value)}</td><td className="numeric">{a.depreciation_years}y</td><td className="numeric">{pct(a.tax_deductible_pct)}</td><td className="numeric"><button className="icon-button danger-icon" onClick={()=>remove('business_assets',a.id,a.name)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
    </Card>}

    {tab==='Tax center'&&taxSettings&&<>
      <div className="grid two">
        <Card title={`Corporate tax estimate · ${year}`} subtitle="Belgian planning rules are editable because tax law and eligibility are fact-specific." actions={<button className="btn" onClick={()=>setTaxOpen(true)}><Settings2 size={14}/>Tax assumptions</button>}>
          <div className="metric-row"><span>Estimated taxable profit</span><strong>{money(summary.taxableProfit)}</strong></div>
          <div className="metric-row"><span>Rate model</span><strong>{rateCheck?.eligible?`${taxSettings.reduced_cit_pct}% first ${money(taxSettings.reduced_threshold)} · ${taxSettings.standard_cit_pct}% above`:`${taxSettings.standard_cit_pct}% standard`}</strong></div>
          <div className="metric-row"><span>Estimated corporate tax</span><strong>{money(corporateTax)}</strong></div>
          <div className="metric-row"><span>Effective rate</span><strong>{summary.taxableProfit?pct(corporateTax/summary.taxableProfit*100):'—'}</strong></div>
          <div style={{height:12}}/><div className={`notice ${rateCheck?.eligible?'info':'warn'}`}>{rateCheck?.reason}</div>
          <div className="tax-checks"><div className={rateCheck?.remunerationOk?'ok':'bad'}><span>Director remuneration</span><strong>{money(activeEntity.director_remuneration)} / configured minimum {money(Math.min(taxSettings.minimum_remuneration,summary.taxableProfit))}</strong></div><div className={rateCheck?.bikOk?'ok':'bad'}><span>Lump-sum benefits in kind</span><strong>{activeEntity.director_remuneration?pct(activeEntity.benefits_in_kind/activeEntity.director_remuneration*100):'—'} / max {pct(taxSettings.bik_limit_pct)}</strong></div></div>
        </Card>
        <Card title="VAT management estimate" subtitle="This is an operational estimate, not a filed VAT return.">
          <div className="metric-row"><span>VAT collected</span><strong>{money(summary.vatCollected)}</strong></div><div className="metric-row"><span>Deductible input VAT</span><strong>{money(summary.vatDeductible)}</strong></div><div className="metric-row"><span>Approx. net VAT position</span><strong>{money(summary.vatPosition)}</strong></div><div className="notice warn" style={{marginTop:14}}>Mixed/private use, special VAT regimes, timing differences and adjustments can materially change the actual VAT return.</div>
        </Card>
      </div>
      <div style={{height:16}}/><Card title="Advance corporate tax payments" subtitle={`Assessment planning for income year ${year}. Earlier payments receive a larger configured credit.`} actions={<button className="btn primary" onClick={()=>{setPaymentForm({quarter:Math.min(4,(payments.at(-1)?.quarter??0)+1)||1,payment_date:todayIso(),amount:0,notes:''});setPaymentOpen(true)}}><Plus size={14}/>Payment</button>}>
        <div className="advance-grid">{[1,2,3,4].map(q=>{const p=payments.find(x=>x.quarter===q);const deadline=year===2026?['2026-04-10','2026-07-10','2026-10-12','2026-12-21'][q-1]:null;const credit=[taxSettings.va1_credit_pct,taxSettings.va2_credit_pct,taxSettings.va3_credit_pct,taxSettings.va4_credit_pct][q-1];return <div key={q} className="advance-card"><div><span>VA{q}</span><Badge tone={p?'green':'slate'}>{p?'registered':'open'}</Badge></div><strong>{p?money(p.amount):'—'}</strong><small>{deadline?`Deadline ${isoNice(deadline)}`:'Verify annual deadline'} · credit {pct(credit)}</small></div>})}</div>
        <div className="grid three" style={{marginTop:14}}><div className="business-summary-tile"><span>Gross surcharge estimate</span><strong>{money(advance.grossSurcharge)}</strong></div><div className="business-summary-tile"><span>Credits from registered VAs</span><strong>{money(advance.credits)}</strong></div><div className="business-summary-tile"><span>Potential remaining surcharge</span><strong>{money(advance.estimatedSurcharge)}</strong></div></div>
        {activeEntity.advance_payment_exempt?<div className="notice info" style={{marginTop:14}}>Advance-payment surcharge is disabled for this entity (for example because you marked an applicable start-up exemption). Verify eligibility with your accountant.</div>:null}
      </Card>
      <div style={{height:16}}/><Card title="Belgian tax assumptions · configured for 2026" subtitle="Defaults are a planning snapshot, not hard-coded legal advice."><div className="business-tax-rule-grid"><div><span>Standard CIT</span><strong>{pct(taxSettings.standard_cit_pct)}</strong></div><div><span>Reduced SME CIT</span><strong>{pct(taxSettings.reduced_cit_pct)} ≤ {money(taxSettings.reduced_threshold)}</strong></div><div><span>Director remuneration condition</span><strong>{money(taxSettings.minimum_remuneration)}</strong></div><div><span>Benefits-in-kind cap</span><strong>{pct(taxSettings.bik_limit_pct)}</strong></div><div><span>Ordinary dividend WHT</span><strong>{pct(taxSettings.ordinary_dividend_wht_pct)}</strong></div><div><span>VVPR-bis WHT</span><strong>{pct(taxSettings.vvprbis_wht_pct)}</strong></div><div><span>Liquidation reserve levy</span><strong>{pct(taxSettings.liquidation_reserve_creation_tax_pct)} + {pct(taxSettings.liquidation_reserve_wht_pct)}</strong></div><div><span>Advance surcharge</span><strong>{pct(taxSettings.advance_surcharge_pct)}</strong></div></div><div className="notice warn" style={{marginTop:16}}>Belgian tax rules depend on assessment year, company age/status, remuneration structure, dividend eligibility and other facts. Always validate a real distribution or tax filing with your accountant/tax adviser.</div></Card>
    </>}

    {tab==='Extraction lab'&&taxSettings&&<>
      <Card title="Profit extraction lab" subtitle="Compare broad routes for the same pre-tax company profit. This is a decision aid, not a tax return.">
        <div className="form-grid three"><Field label="Pre-tax company profit to allocate"><input className="input" type="number" value={extractionProfit??Math.round(summary.taxableProfit)} onChange={e=>setExtractionProfit(num(e.target.value))}/></Field><Field label="Effective burden on extra remuneration %" hint="Your own estimate for personal income tax + social contributions."><input className="input" type="number" step="1" value={salaryBurden} onChange={e=>setSalaryBurden(num(e.target.value))}/></Field><div className="business-extraction-context"><span>Corporate rate model</span><strong>{rateCheck?.eligible?'SME reduced model':'Standard model'}</strong></div></div>
        <div className="extraction-grid">{extraction.map(o=><div key={o.key} className={`extraction-card ${o.key==='keep'?'featured':''}`}><div className="extraction-title"><span>{o.label}</span><Badge tone={o.key==='keep'?'blue':o.key==='vvpr'||o.key==='reserve'?'purple':'slate'}>{o.timing}</Badge></div><div className="extraction-net"><span>Personal net</span><strong>{money(o.personalNet)}</strong></div><div className="extraction-row"><span>Retained in company</span><strong>{money(o.companyRetained)}</strong></div><div className="extraction-row"><span>Illustrative tax leakage</span><strong>{money(o.taxLeakage)}</strong></div><p>{o.note}</p></div>)}</div>
        <div className="notice warn" style={{marginTop:16}}>The salary comparison deliberately uses a user-entered effective burden instead of pretending to calculate Belgian personal tax exactly. VVPR-bis and liquidation-reserve routes require legal eligibility and waiting-period checks.</div>
      </Card>
    </>}

    <EntityModal/>
    <Modal open={txOpen} title="Add business entry" subtitle="Record management cashflow separately from your private ledger." onClose={()=>setTxOpen(false)} width={720}><div className="form-grid three"><Field label="Date"><input className="input" type="date" value={txForm.date} onChange={e=>setTxForm({...txForm,date:e.target.value})}/></Field><Field label="Flow"><select className="select" value={txForm.flow} onChange={e=>setTxForm({...txForm,flow:e.target.value as BusinessFlow})}><option value="in">Money in</option><option value="out">Money out</option></select></Field><Field label="Kind"><select className="select" value={txForm.kind} onChange={e=>setTxForm({...txForm,kind:e.target.value as BusinessTransactionKind})}>{['revenue','expense','salary','asset','tax','dividend','transfer','other'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Description"><input className="input" value={txForm.description} onChange={e=>setTxForm({...txForm,description:e.target.value})}/></Field><Field label="Counterparty"><input className="input" value={txForm.counterparty} onChange={e=>setTxForm({...txForm,counterparty:e.target.value})}/></Field><Field label="Category"><input className="input" value={txForm.category} onChange={e=>setTxForm({...txForm,category:e.target.value})}/></Field><Field label="Net amount"><input className="input" type="number" value={txForm.net_amount} onChange={e=>setTxForm({...txForm,net_amount:num(e.target.value)})}/></Field><Field label="VAT rate %"><input className="input" type="number" step="0.5" value={txForm.vat_rate} onChange={e=>setTxForm({...txForm,vat_rate:num(e.target.value)})}/></Field><Field label="Gross preview"><div className="readonly-field">{money(txForm.net_amount*(1+txForm.vat_rate/100))}</div></Field><Field label="Tax deductible %"><input className="input" type="number" value={txForm.tax_deductible_pct} onChange={e=>setTxForm({...txForm,tax_deductible_pct:num(e.target.value)})}/></Field><Field label="VAT deductible %"><input className="input" type="number" value={txForm.vat_deductible_pct} onChange={e=>setTxForm({...txForm,vat_deductible_pct:num(e.target.value)})}/></Field></div><div style={{height:12}}/><Field label="Notes"><textarea className="textarea" value={txForm.notes} onChange={e=>setTxForm({...txForm,notes:e.target.value})}/></Field><div className="modal-actions"><button className="btn" onClick={()=>setTxOpen(false)}>Cancel</button><button className="btn primary" disabled={busy||!txForm.description.trim()} onClick={saveTx}>{busy?'Saving…':'Add entry'}</button></div></Modal>

    <Modal open={invoiceOpen} title="Add invoice" onClose={()=>setInvoiceOpen(false)} width={680}><div className="form-grid three"><Field label="Type"><select className="select" value={invoiceForm.direction} onChange={e=>setInvoiceForm({...invoiceForm,direction:e.target.value})}><option value="receivable">Receivable</option><option value="payable">Payable</option></select></Field><Field label="Counterparty"><input className="input" value={invoiceForm.counterparty} onChange={e=>setInvoiceForm({...invoiceForm,counterparty:e.target.value})}/></Field><Field label="Invoice number"><input className="input" value={invoiceForm.invoice_number} onChange={e=>setInvoiceForm({...invoiceForm,invoice_number:e.target.value})}/></Field><Field label="Issue date"><input className="input" type="date" value={invoiceForm.issue_date} onChange={e=>setInvoiceForm({...invoiceForm,issue_date:e.target.value})}/></Field><Field label="Due date"><input className="input" type="date" value={invoiceForm.due_date} onChange={e=>setInvoiceForm({...invoiceForm,due_date:e.target.value})}/></Field><Field label="Amount incl. VAT"><input className="input" type="number" value={invoiceForm.amount_incl_vat} onChange={e=>setInvoiceForm({...invoiceForm,amount_incl_vat:num(e.target.value)})}/></Field></div><div style={{height:12}}/><Field label="Notes"><textarea className="textarea" value={invoiceForm.notes} onChange={e=>setInvoiceForm({...invoiceForm,notes:e.target.value})}/></Field><div className="modal-actions"><button className="btn" onClick={()=>setInvoiceOpen(false)}>Cancel</button><button className="btn primary" onClick={saveInvoice}>Add invoice</button></div></Modal>

    <Modal open={assetOpen} title="Add company asset" onClose={()=>setAssetOpen(false)} width={680}><div className="form-grid three"><Field label="Asset"><input className="input" value={assetForm.name} onChange={e=>setAssetForm({...assetForm,name:e.target.value})}/></Field><Field label="Category"><input className="input" value={assetForm.category} onChange={e=>setAssetForm({...assetForm,category:e.target.value})}/></Field><Field label="Purchase date"><input className="input" type="date" value={assetForm.purchase_date} onChange={e=>setAssetForm({...assetForm,purchase_date:e.target.value})}/></Field><Field label="Purchase value ex VAT"><input className="input" type="number" value={assetForm.purchase_value_ex_vat} onChange={e=>setAssetForm({...assetForm,purchase_value_ex_vat:num(e.target.value)})}/></Field><Field label="Residual value"><input className="input" type="number" value={assetForm.residual_value} onChange={e=>setAssetForm({...assetForm,residual_value:num(e.target.value)})}/></Field><Field label="Depreciation years"><input className="input" type="number" step="0.5" value={assetForm.depreciation_years} onChange={e=>setAssetForm({...assetForm,depreciation_years:num(e.target.value)})}/></Field><Field label="Current book value"><input className="input" type="number" value={assetForm.current_book_value} onChange={e=>setAssetForm({...assetForm,current_book_value:num(e.target.value)})}/></Field><Field label="Tax deductible %"><input className="input" type="number" value={assetForm.tax_deductible_pct} onChange={e=>setAssetForm({...assetForm,tax_deductible_pct:num(e.target.value)})}/></Field></div><div className="modal-actions"><button className="btn" onClick={()=>setAssetOpen(false)}>Cancel</button><button className="btn primary" onClick={saveAsset}>Add asset</button></div></Modal>

    <Modal open={paymentOpen} title="Register advance tax payment" onClose={()=>setPaymentOpen(false)} width={520}><div className="form-grid three"><Field label="Quarter"><select className="select" value={paymentForm.quarter} onChange={e=>setPaymentForm({...paymentForm,quarter:Number(e.target.value)})}>{[1,2,3,4].map(q=><option key={q} value={q}>VA{q}</option>)}</select></Field><Field label="Payment date"><input className="input" type="date" value={paymentForm.payment_date} onChange={e=>setPaymentForm({...paymentForm,payment_date:e.target.value})}/></Field><Field label="Amount"><input className="input" type="number" value={paymentForm.amount} onChange={e=>setPaymentForm({...paymentForm,amount:num(e.target.value)})}/></Field></div><div className="modal-actions"><button className="btn" onClick={()=>setPaymentOpen(false)}>Cancel</button><button className="btn primary" onClick={savePayment}>Save payment</button></div></Modal>

    <Modal open={taxOpen} title={`Belgian tax assumptions · ${year}`} subtitle="Editable planning defaults. Use your accountant's figures if your situation differs." onClose={()=>setTaxOpen(false)} width={760}>{taxSettings&&<><div className="form-grid three"><Field label="Standard CIT %"><input className="input" type="number" step="0.1" value={taxSettings.standard_cit_pct} onChange={e=>setTaxSettings({...taxSettings,standard_cit_pct:num(e.target.value)})}/></Field><Field label="Reduced SME CIT %"><input className="input" type="number" step="0.1" value={taxSettings.reduced_cit_pct} onChange={e=>setTaxSettings({...taxSettings,reduced_cit_pct:num(e.target.value)})}/></Field><Field label="Reduced threshold"><input className="input" type="number" value={taxSettings.reduced_threshold} onChange={e=>setTaxSettings({...taxSettings,reduced_threshold:num(e.target.value)})}/></Field><Field label="Minimum director remuneration"><input className="input" type="number" value={taxSettings.minimum_remuneration} onChange={e=>setTaxSettings({...taxSettings,minimum_remuneration:num(e.target.value)})}/></Field><Field label="BIK limit %"><input className="input" type="number" value={taxSettings.bik_limit_pct} onChange={e=>setTaxSettings({...taxSettings,bik_limit_pct:num(e.target.value)})}/></Field><Field label="Advance surcharge %"><input className="input" type="number" step="0.05" value={taxSettings.advance_surcharge_pct} onChange={e=>setTaxSettings({...taxSettings,advance_surcharge_pct:num(e.target.value)})}/></Field><Field label="Ordinary dividend WHT %"><input className="input" type="number" value={taxSettings.ordinary_dividend_wht_pct} onChange={e=>setTaxSettings({...taxSettings,ordinary_dividend_wht_pct:num(e.target.value)})}/></Field><Field label="VVPR-bis WHT %"><input className="input" type="number" value={taxSettings.vvprbis_wht_pct} onChange={e=>setTaxSettings({...taxSettings,vvprbis_wht_pct:num(e.target.value)})}/></Field><Field label="Liquidation reserve creation levy %"><input className="input" type="number" value={taxSettings.liquidation_reserve_creation_tax_pct} onChange={e=>setTaxSettings({...taxSettings,liquidation_reserve_creation_tax_pct:num(e.target.value)})}/></Field><Field label="Liquidation reserve WHT %"><input className="input" type="number" value={taxSettings.liquidation_reserve_wht_pct} onChange={e=>setTaxSettings({...taxSettings,liquidation_reserve_wht_pct:num(e.target.value)})}/></Field></div><div className="modal-actions"><button className="btn" onClick={()=>setTaxOpen(false)}>Cancel</button><button className="btn primary" onClick={saveTax}>Save assumptions</button></div></>}</Modal>
  </>;

  function EntityModal(){return <Modal open={entityOpen} title={editingEntity?'Company settings':'Create Belgian company'} subtitle="Create a separate business ledger inside this profile." onClose={()=>setEntityOpen(false)} width={760}><div className="form-grid three"><Field label="Company name"><input className="input" value={entityForm.name} onChange={e=>setEntityForm({...entityForm,name:e.target.value})}/></Field><Field label="Legal form"><input className="input" value={entityForm.company_type} onChange={e=>setEntityForm({...entityForm,company_type:e.target.value})}/></Field><Field label="Fiscal year / income year"><input className="input" type="number" value={entityForm.fiscal_year} onChange={e=>setEntityForm({...entityForm,fiscal_year:Number(e.target.value)})}/></Field><Field label="Enterprise number"><input className="input" value={entityForm.enterprise_number??''} onChange={e=>setEntityForm({...entityForm,enterprise_number:e.target.value})}/></Field><Field label="VAT number"><input className="input" value={entityForm.vat_number??''} onChange={e=>setEntityForm({...entityForm,vat_number:e.target.value})}/></Field><Field label="Incorporation date"><input className="input" type="date" value={entityForm.incorporation_date??''} onChange={e=>setEntityForm({...entityForm,incorporation_date:e.target.value})}/></Field><Field label="Opening business cash"><input className="input" type="number" value={entityForm.opening_cash} onChange={e=>setEntityForm({...entityForm,opening_cash:num(e.target.value)})}/></Field><Field label="Annual director remuneration"><input className="input" type="number" value={entityForm.director_remuneration} onChange={e=>setEntityForm({...entityForm,director_remuneration:num(e.target.value)})}/></Field><Field label="Lump-sum benefits in kind"><input className="input" type="number" value={entityForm.benefits_in_kind} onChange={e=>setEntityForm({...entityForm,benefits_in_kind:num(e.target.value)})}/></Field></div><div className="business-check-grid"><label><input type="checkbox" checked={Boolean(entityForm.small_company)} onChange={e=>setEntityForm({...entityForm,small_company:e.target.checked?1:0})}/> Small company / SME</label><label><input type="checkbox" checked={Boolean(entityForm.use_reduced_rate)} onChange={e=>setEntityForm({...entityForm,use_reduced_rate:e.target.checked?1:0})}/> Apply reduced rate when configured checks pass</label><label><input type="checkbox" checked={Boolean(entityForm.advance_payment_exempt)} onChange={e=>setEntityForm({...entityForm,advance_payment_exempt:e.target.checked?1:0})}/> Exempt from advance-payment surcharge</label></div><Field label="Notes"><textarea className="textarea" value={entityForm.notes??''} onChange={e=>setEntityForm({...entityForm,notes:e.target.value})}/></Field><div className="modal-actions"><button className="btn" onClick={()=>setEntityOpen(false)}>Cancel</button><button className="btn primary" disabled={busy||!entityForm.name.trim()} onClick={saveEntity}>{busy?'Saving…':editingEntity?'Save company':'Create company'}</button></div></Modal>}
}
