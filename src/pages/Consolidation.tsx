import { useCallback, useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Building2, Eye, Layers3, Plus, Settings2, Trash2, WalletCards } from 'lucide-react';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { KpiCard } from '../components/KpiCard';
import { Modal } from '../components/Modal';
import { useProfileSession } from '../components/ProfileSession';
import { execute, repo } from '../lib/db';
import { businessValuation } from '../lib/consolidation';
import { derivePositions, financeTotals } from '../lib/finance';
import { householdMembers, sharedAssetNet, sharedAssets, syncActiveProfile } from '../lib/household';
import { money, numberFmt } from '../lib/utils';
import type { BusinessBalanceItem, BusinessConsolidationSettings, BusinessEntity, BusinessValuationBreakdown } from '../types';

type ViewMode='equity'|'lookthrough';
const blankItem=(entityId:number):Omit<BusinessBalanceItem,'id'|'updated_at'>=>({entity_id:entityId,name:'',asset_class:'investments',value:0,notes:''});

export function Consolidation(){
  const {profile}=useProfileSession();
  const [entities,setEntities]=useState<BusinessEntity[]>([]);
  const [rows,setRows]=useState<Array<{entity:BusinessEntity;settings:BusinessConsolidationSettings;valuation:BusinessValuationBreakdown;items:BusinessBalanceItem[]}>>([]);
  const [privateNw,setPrivateNw]=useState(0);
  const [householdTotal,setHouseholdTotal]=useState<number|null>(null);
  const [privateParts,setPrivateParts]=useState({cash:0,investments:0,realEstate:0,pensions:0,receivables:0,liabilities:0});
  const [mode,setMode]=useState<ViewMode>('equity');
  const [settingsOpen,setSettingsOpen]=useState(false),[itemOpen,setItemOpen]=useState(false);
  const [settingsForm,setSettingsForm]=useState<BusinessConsolidationSettings|null>(null);
  const [itemForm,setItemForm]=useState<Omit<BusinessBalanceItem,'id'|'updated_at'>>(blankItem(0));
  const [status,setStatus]=useState('');

  const load=useCallback(async()=>{
    const [accounts,securities,trades,properties,pensions,debtors,liabilities,ents]=await Promise.all([repo.accounts(),repo.securities(),repo.trades(),repo.properties(),repo.pensions(),repo.debtors(),repo.liabilities(),repo.businessEntities()]);
    const totals=financeTotals(accounts,derivePositions(securities,trades),properties,pensions,debtors,liabilities);
    setPrivateNw(totals.netWorth);setPrivateParts({cash:totals.cash,investments:totals.investments,realEstate:totals.realEstate,pensions:totals.pensions,receivables:totals.debtors,liabilities:totals.liabilities});setEntities(ents);
    const out=[] as Array<{entity:BusinessEntity;settings:BusinessConsolidationSettings;valuation:BusinessValuationBreakdown;items:BusinessBalanceItem[]}>;
    for(const entity of ents){
      const [txs,assets,invoices,payments,tax,settings,items]=await Promise.all([repo.businessTransactions(entity.id),repo.businessAssets(entity.id),repo.businessInvoices(entity.id),repo.businessAdvancePayments(entity.id,entity.fiscal_year),repo.businessTaxSettings(entity.id,entity.fiscal_year),repo.businessConsolidationSettings(entity.id),repo.businessBalanceItems(entity.id)]);
      out.push({entity,settings,items,valuation:businessValuation(entity,txs,assets,invoices,payments,tax,settings,items)});
    }
    setRows(out);
    try {
      await syncActiveProfile(profile);
      const [members,shared]=await Promise.all([householdMembers(),sharedAssets()]);
      setHouseholdTotal(members.reduce((sum,m)=>sum+m.net_worth,0)+shared.reduce((sum,a)=>sum+sharedAssetNet(a),0));
    } catch { setHouseholdTotal(null); }
  },[profile]);
  useEffect(()=>{load()},[load]);

  const bvEquity=rows.filter(r=>r.settings.include_in_personal).reduce((s,r)=>s+r.valuation.ownerEquity,0);
  const consolidated=privateNw+bvEquity;
  const businessWeight=consolidated?bvEquity/consolidated*100:0;
  const allocation=useMemo(()=>{
    const parts:Record<string,number>={Cash:privateParts.cash,Investments:privateParts.investments,'Real estate':privateParts.realEstate,Pensions:privateParts.pensions,Receivables:privateParts.receivables};
    if(mode==='equity') parts['Business equity']=bvEquity;
    else for(const r of rows.filter(x=>x.settings.include_in_personal)){
      const f=Math.max(0,Math.min(100,r.settings.ownership_pct))/100;
      parts.Cash+=r.valuation.cash*f;parts.Investments+=r.valuation.investments*f;parts['Real estate']+=r.valuation.realEstate*f;parts.Receivables+=r.valuation.receivables*f;
      parts['Business operating assets']=(parts['Business operating assets']||0)+(r.valuation.fixedAssets+r.valuation.otherAssets)*f;
    }
    const colors:Record<string,string>={Cash:'var(--accent)',Investments:'var(--navy)','Real estate':'var(--green)',Pensions:'var(--purple)',Receivables:'var(--amber)','Business equity':'#7c6ee6','Business operating assets':'#6f7c8c'};
    return Object.entries(parts).filter(([,v])=>v>0).map(([name,value])=>({name,value,color:colors[name]||'var(--muted)'}));
  },[mode,rows,bvEquity,privateParts]);

  const openSettings=(id:number)=>{const r=rows.find(x=>x.entity.id===id);if(!r)return;setSettingsForm({...r.settings});setSettingsOpen(true)};
  const saveSettings=async()=>{if(!settingsForm)return;await execute(`INSERT INTO business_consolidation_settings(entity_id,ownership_pct,valuation_mode,manual_equity_value,include_in_personal,include_in_household,include_in_future,include_in_fi,future_growth_pct,future_volatility_pct,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP) ON CONFLICT(entity_id) DO UPDATE SET ownership_pct=excluded.ownership_pct,valuation_mode=excluded.valuation_mode,manual_equity_value=excluded.manual_equity_value,include_in_personal=excluded.include_in_personal,include_in_household=excluded.include_in_household,include_in_future=excluded.include_in_future,include_in_fi=excluded.include_in_fi,future_growth_pct=excluded.future_growth_pct,future_volatility_pct=excluded.future_volatility_pct,updated_at=CURRENT_TIMESTAMP`,[settingsForm.entity_id,settingsForm.ownership_pct,settingsForm.valuation_mode,settingsForm.manual_equity_value,settingsForm.include_in_personal,settingsForm.include_in_household,settingsForm.include_in_future,settingsForm.include_in_fi,settingsForm.future_growth_pct,settingsForm.future_volatility_pct]);setSettingsOpen(false);await load();setStatus('Consolidation settings saved.')};
  const openItem=(id:number)=>{setItemForm(blankItem(id));setItemOpen(true)};
  const saveItem=async()=>{if(!itemForm.name.trim())return;await execute(`INSERT INTO business_balance_items(entity_id,name,asset_class,value,notes,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`,[itemForm.entity_id,itemForm.name.trim(),itemForm.asset_class,itemForm.value,itemForm.notes||null]);setItemOpen(false);await load()};
  const deleteItem=async(id:number)=>{if(!confirm('Delete this consolidation balance-sheet item?'))return;await execute('DELETE FROM business_balance_items WHERE id=$1',[id]);await load()};

  return <>
    <PageHeader title="Consolidated wealth" subtitle="Private + business wealth in one view, with equity and look-through modes that avoid double counting." actions={<div className="segmented"><button className={mode==='equity'?'active':''} onClick={()=>setMode('equity')}><Layers3 size={14}/>Equity</button><button className={mode==='lookthrough'?'active':''} onClick={()=>setMode('lookthrough')}><Eye size={14}/>Look-through</button></div>}/>
    {status&&<div className="notice info" style={{marginBottom:14}}>{status}</div>}
    <div className="kpi-grid">
      <KpiCard label="Private net worth" value={money(privateNw)} icon={<WalletCards size={16}/>} sub="Excludes business equity"/>
      <KpiCard label="Owned BV equity" value={money(bvEquity)} icon={<Building2 size={16}/>} sub="Ownership-adjusted"/>
      <KpiCard label="Consolidated net worth" value={money(consolidated)} icon={<Layers3 size={16}/>} sub="Private + included BV equity"/>
      <KpiCard label="Business weight" value={`${numberFmt(businessWeight,1)}%`} icon={<Building2 size={16}/>} sub="Share of personal consolidated wealth"/>
      <KpiCard label="Household consolidated" value={householdTotal==null?'—':money(householdTotal)} icon={<Layers3 size={16}/>} sub="Personal + partner + shared + included BV equity"/>
    </div>
    <div className="grid two" style={{marginBottom:16}}>
      <Card title={mode==='equity'?'Equity view':'Look-through allocation'} subtitle={mode==='equity'?'Each BV appears once as owner equity.':'Gross company assets are reclassified into household-style asset classes; company liabilities remain visible in the company equity calculation.'}>
        {!allocation.length?<EmptyState title="No wealth to display"/>:<div className="consolidation-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={allocation} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>{allocation.map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip formatter={v=>money(Number(v))}/></PieChart></ResponsiveContainer></div>}
        <div className="asset-legend">{allocation.map(x=><div className="asset-legend-row" key={x.name}><span className="legend-dot" style={{background:x.color}}/><span>{x.name}</span><strong>{money(x.value)}</strong></div>)}</div>
      </Card>
      <Card title="Double-count protection" subtitle="How V2.8 treats company ownership.">
        <div className="decision-definition"><div><Layers3 size={16}/><span><strong>Equity view</strong> · private wealth + your ownership share of BV equity. Underlying company assets are not added again.</span></div><div><Eye size={16}/><span><strong>Look-through</strong> · decomposes the BV gross assets into cash, investments, real estate, receivables and operating assets; liabilities continue to offset consolidated net worth through BV equity.</span></div><div><Building2 size={16}/><span><strong>Ownership</strong> · a 70% stake contributes only 70% of company economic value.</span></div></div>
      </Card>
    </div>
    <Card title="Companies in consolidated wealth" subtitle="Calculated equity uses company cash + receivables + book-value operating assets + manual market-value items − payables − estimated corporate tax.">
      {!entities.length?<EmptyState title="No BV configured" description="Create a company in My BV first."/>:<div className="table-wrap"><table><thead><tr><th>Company</th><th>Ownership</th><th>Calculated equity</th><th>Used equity</th><th>Personal</th><th>Household</th><th>Future</th><th></th></tr></thead><tbody>{rows.map(r=><tr key={r.entity.id}><td><strong>{r.entity.name}</strong><small>{r.entity.company_type}</small></td><td>{numberFmt(r.settings.ownership_pct,1)}%</td><td>{money(r.valuation.calculatedEquity)}</td><td><strong>{money(r.valuation.ownerEquity)}</strong>{r.settings.valuation_mode==='manual'&&<Badge tone="amber">manual</Badge>}</td><td>{r.settings.include_in_personal?<Badge tone="green">included</Badge>:<Badge tone="slate">off</Badge>}</td><td>{r.settings.include_in_household?<Badge tone="green">included</Badge>:<Badge tone="slate">off</Badge>}</td><td>{r.settings.include_in_future?<Badge tone="green">included</Badge>:<Badge tone="slate">off</Badge>}</td><td><div className="row-actions"><button className="btn tiny" onClick={()=>openItem(r.entity.id)}><Plus size={12}/>Item</button><button className="icon-button" onClick={()=>openSettings(r.entity.id)}><Settings2 size={14}/></button></div></td></tr>)}</tbody></table></div>}
      {rows.map(r=>r.items.length?<div key={r.entity.id} className="consolidation-items"><strong>{r.entity.name} · look-through additions</strong>{r.items.map(i=><span key={i.id}>{i.name} · {i.asset_class.replace('_',' ')} · {money(i.value)} <button className="link danger" onClick={()=>deleteItem(i.id)}><Trash2 size={11}/></button></span>)}</div>:null)}
    </Card>
    <div className="notice neutral" style={{marginTop:16}}><strong>Management valuation.</strong> Calculated BV equity is a planning estimate, not statutory equity, fair market value or a tax valuation. Use Manual equity if your accountant/valuation provides a better figure.</div>

    <Modal open={settingsOpen} title="Business consolidation settings" subtitle="Define ownership and where this BV should be included." onClose={()=>setSettingsOpen(false)} width={720}>{settingsForm&&<><div className="form-grid three"><Field label="Ownership %"><input type="number" min="0" max="100" step="1" value={settingsForm.ownership_pct} onChange={e=>setSettingsForm({...settingsForm,ownership_pct:Number(e.target.value)})}/></Field><Field label="Valuation mode"><select value={settingsForm.valuation_mode} onChange={e=>setSettingsForm({...settingsForm,valuation_mode:e.target.value})}><option value="calculated">Calculated balance-sheet equity</option><option value="manual">Manual equity value</option></select></Field><Field label="Manual company equity"><input type="number" disabled={settingsForm.valuation_mode!=='manual'} value={settingsForm.manual_equity_value} onChange={e=>setSettingsForm({...settingsForm,manual_equity_value:Number(e.target.value)})}/></Field><Field label="Future business growth %"><input type="number" step="0.1" value={settingsForm.future_growth_pct} onChange={e=>setSettingsForm({...settingsForm,future_growth_pct:Number(e.target.value)})}/></Field><Field label="Decision Lab volatility %"><input type="number" step="0.5" value={settingsForm.future_volatility_pct} onChange={e=>setSettingsForm({...settingsForm,future_volatility_pct:Number(e.target.value)})}/></Field></div><div className="business-check-grid"><label><input type="checkbox" checked={!!settingsForm.include_in_personal} onChange={e=>setSettingsForm({...settingsForm,include_in_personal:e.target.checked?1:0})}/> Include in Personal consolidated wealth</label><label><input type="checkbox" checked={!!settingsForm.include_in_household} onChange={e=>setSettingsForm({...settingsForm,include_in_household:e.target.checked?1:0})}/> Include in Household</label><label><input type="checkbox" checked={!!settingsForm.include_in_future} onChange={e=>setSettingsForm({...settingsForm,include_in_future:e.target.checked?1:0})}/> Include in Future / Decision Lab</label><label><input type="checkbox" checked={!!settingsForm.include_in_fi} onChange={e=>setSettingsForm({...settingsForm,include_in_fi:e.target.checked?1:0})}/> Count BV equity toward FI assets</label></div><div className="modal-actions"><button className="btn" onClick={()=>setSettingsOpen(false)}>Cancel</button><button className="btn primary" onClick={saveSettings}>Save</button></div></>}</Modal>
    <Modal open={itemOpen} title="Add look-through balance item" subtitle="Use market values for BV investments, real estate or liabilities not already represented by the company ledger." onClose={()=>setItemOpen(false)} width={600}><div className="form-grid two"><Field label="Name"><input value={itemForm.name} onChange={e=>setItemForm({...itemForm,name:e.target.value})}/></Field><Field label="Class"><select value={itemForm.asset_class} onChange={e=>setItemForm({...itemForm,asset_class:e.target.value})}><option value="investments">Investments</option><option value="real_estate">Real estate</option><option value="other_asset">Other asset</option><option value="liability">Liability</option></select></Field><Field label="Current value"><input type="number" value={itemForm.value} onChange={e=>setItemForm({...itemForm,value:Number(e.target.value)})}/></Field><Field label="Notes"><input value={itemForm.notes??''} onChange={e=>setItemForm({...itemForm,notes:e.target.value})}/></Field></div><div className="modal-actions"><button className="btn" onClick={()=>setItemOpen(false)}>Cancel</button><button className="btn primary" onClick={saveItem}>Add item</button></div></Modal>
  </>;
}
