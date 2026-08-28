import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator } from 'lucide-react';
import { Card, EmptyState, Field, PageHeader } from '../components/Common';
import { repo } from '../lib/db';
import { cgtByYear } from '../lib/finance';
import { money } from '../lib/utils';
import type { Security, Trade } from '../types';

export function TaxPage(){
  const [securities,setSecurities]=useState<Security[]>([]); const [trades,setTrades]=useState<Trade[]>([]);
  const [rate,setRate]=useState(0); const [exemption,setExemption]=useState(0); const [year,setYear]=useState(new Date().getFullYear().toString());
  const load=useCallback(async()=>{const [s,t]=await Promise.all([repo.securities(),repo.trades()]);setSecurities(s);setTrades(t)},[]); useEffect(()=>{load()},[load]);
  const yearly=useMemo(()=>cgtByYear(securities,trades),[securities,trades]); const row=yearly.find(x=>x.year===year); const realized=row?.realized??0; const taxable=Math.max(0,realized-exemption); const estimate=taxable*rate/100;
  return <><PageHeader title="CGT planner" subtitle="A configurable planning calculator based on FIFO realized gains. It is not tax advice and does not hard-code Belgian law."/>
    <div className="grid" style={{gridTemplateColumns:'minmax(0,1.25fr) minmax(320px,.75fr)'}}>
      <Card title="Realized gains by year" subtitle="Derived only from recorded SELL trades.">{!yearly.length?<EmptyState title="No realized disposals yet" description="SELL trades will appear here automatically."/>:<div className="table-shell"><table><thead><tr><th>Year</th><th className="numeric">Proceeds</th><th className="numeric">FIFO cost</th><th className="numeric">Realized P/L</th></tr></thead><tbody>{yearly.map(r=><tr key={r.year} onClick={()=>setYear(r.year)} style={{cursor:'pointer'}}><td><strong>{r.year}</strong></td><td className="numeric">{money(r.proceeds)}</td><td className="numeric">{money(r.cost)}</td><td className={`numeric ${r.realized>=0?'money-positive':'money-negative'}`}><strong>{money(r.realized)}</strong></td></tr>)}</tbody></table></div>}</Card>
      <Card title="Planning assumptions" subtitle="Enter the parameters relevant to the scenario you want to model."><div className="form-grid"><Field label="Year"><select className="select" value={year} onChange={e=>setYear(e.target.value)}>{[...new Set([new Date().getFullYear().toString(),...yearly.map(y=>y.year)])].map(y=><option key={y}>{y}</option>)}</select></Field><Field label="Tax rate %"><input className="input" type="number" step="0.1" value={rate} onChange={e=>setRate(Number(e.target.value))}/></Field><Field label="Exemption / deductible amount"><input className="input" type="number" value={exemption} onChange={e=>setExemption(Number(e.target.value))}/></Field></div><div style={{height:16}}/><div className="notice warn">This is a scenario tool. Confirm the actual tax treatment and applicable exemptions/rates for the relevant jurisdiction and year.</div><div style={{height:14}}/><div className="metric-row"><span>Realized FIFO gain</span><strong>{money(realized)}</strong></div><div className="metric-row"><span>Taxable after entered exemption</span><strong>{money(taxable)}</strong></div><div className="metric-row"><span>Estimated tax</span><strong>{money(estimate)}</strong></div><div style={{marginTop:14,display:'flex',alignItems:'center',gap:8,color:'var(--muted)',fontSize:10}}><Calculator size={14}/> Planning only; no filing functionality.</div></Card>
    </div>
  </>;
}
