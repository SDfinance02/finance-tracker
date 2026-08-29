import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, BarChart3, Dices, Gauge, Play, Save, ShieldCheck, Sparkles, Target, TriangleAlert, UsersRound } from 'lucide-react';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { KpiCard } from '../components/KpiCard';
import { useProfileSession } from '../components/ProfileSession';
import { execute, repo, select } from '../lib/db';
import { derivePositions, financeTotals, monthlySeries } from '../lib/finance';
import { formatFiDate } from '../lib/future';
import { householdMembers, sharedAssetNet, sharedAssets, syncActiveProfile } from '../lib/household';
import { money, numberFmt } from '../lib/utils';
import type { Account, Debtor, DecisionLabRun, FutureEvent, FutureRiskSettings, FutureScenario, FutureStartingPoint, Liability, MonteCarloResult, Pension, Property, Security, Trade, Transaction } from '../types';

function avgRecentCashflow(transactions:Transaction[]){
  const all=monthlySeries(transactions),current=new Date().toISOString().slice(0,7),completed=all.filter(x=>x.month<current),series=(completed.length?completed:all).slice(-6);
  if(!series.length)return{income:0,expenses:0,months:0};
  return{income:series.reduce((s,x)=>s+x.income,0)/series.length,expenses:series.reduce((s,x)=>s+x.expenses,0)/series.length,months:series.length};
}
function pct01(v:number){return `${numberFmt(v*100,1)}%`}
function riskTone(p:number):'green'|'amber'|'red'{return p>=.85?'green':p>=.65?'amber':'red'}
function runWorker(start:FutureStartingPoint,scenario:FutureScenario,events:FutureEvent[],settings:FutureRiskSettings):Promise<MonteCarloResult>{
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/monteCarlo.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(e:MessageEvent<{ok:boolean;result?:MonteCarloResult;error?:string}>)=>{worker.terminate();e.data.ok&&e.data.result?resolve(e.data.result):reject(new Error(e.data.error||'Monte Carlo failed'));};
    worker.onerror=(e)=>{worker.terminate();reject(new Error(e.message||'Monte Carlo worker failed'));};
    worker.postMessage({start,scenario,events,settings,startDate:new Date().toISOString()});
  });
}

export function DecisionLab(){
  const {profile}=useProfileSession();
  const [scenarios,setScenarios]=useState<FutureScenario[]>([]),[events,setEvents]=useState<FutureEvent[]>([]),[selectedId,setSelectedId]=useState<number|null>(null);
  const [profileStart,setProfileStart]=useState<FutureStartingPoint|null>(null),[householdStart,setHouseholdStart]=useState<FutureStartingPoint|null>(null);
  const [settings,setSettings]=useState<FutureRiskSettings|null>(null),[result,setResult]=useState<MonteCarloResult|null>(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
  const [comparison,setComparison]=useState<Array<{scenario:FutureScenario;result:MonteCarloResult}>>([]),[runs,setRuns]=useState<DecisionLabRun[]>([]);

  const buildStarts=useCallback(async()=>{
    const [accounts,securities,trades,properties,pensions,liabilities,debtors,transactions]=await Promise.all([repo.accounts(),repo.securities(),repo.trades(),repo.properties(),repo.pensions(),repo.liabilities(),repo.debtors(),select<Transaction>('SELECT * FROM transactions ORDER BY date,id')]) as [Account[],Security[],Trade[],Property[],Pension[],Liability[],Debtor[],Transaction[]];
    const totals=financeTotals(accounts,derivePositions(securities,trades),properties,pensions,debtors,liabilities),flow=avgRecentCashflow(transactions),debtTotal=liabilities.reduce((s,l)=>s+Math.max(0,l.outstanding_balance),0);
    const debtRate=liabilities.reduce((s,l)=>s+Math.max(0,l.outstanding_balance)*Math.max(0,l.interest_pct),0)/Math.max(1,debtTotal);
    setProfileStart({cash:totals.cash,investments:totals.investments,realEstate:totals.realEstate,pensions:totals.pensions,receivables:totals.debtors,liabilities:totals.liabilities,monthlyIncome:flow.income,monthlyExpenses:flow.expenses,existingDebtMonthlyPayment:liabilities.reduce((s,l)=>s+Math.max(0,l.monthly_payment),0),existingDebtInterestPct:debtRate||0,sourceLabel:`${profile.name} · trailing ${flow.months}-month cashflow`});
    try{
      await syncActiveProfile(profile);const [members,shared]=await Promise.all([householdMembers(),sharedAssets()]);
      setHouseholdStart({cash:members.reduce((s,m)=>s+m.cash,0)+shared.filter(x=>x.liquid||x.asset_class==='cash').reduce((s,a)=>s+sharedAssetNet(a),0),investments:members.reduce((s,m)=>s+m.investments,0)+shared.filter(x=>x.asset_class==='investments'&&!x.liquid).reduce((s,a)=>s+sharedAssetNet(a),0),realEstate:members.reduce((s,m)=>s+m.real_estate,0)+shared.filter(x=>['real_estate','other'].includes(x.asset_class)&&!x.liquid).reduce((s,a)=>s+sharedAssetNet(a),0),pensions:members.reduce((s,m)=>s+m.pensions,0)+shared.filter(x=>x.asset_class==='pensions').reduce((s,a)=>s+sharedAssetNet(a),0),receivables:members.reduce((s,m)=>s+m.debtors,0)+shared.filter(x=>x.asset_class==='receivables').reduce((s,a)=>s+sharedAssetNet(a),0),liabilities:members.reduce((s,m)=>s+m.liabilities,0)+shared.filter(x=>x.asset_class==='liability').reduce((s,a)=>s+Math.abs(sharedAssetNet(a)),0),monthlyIncome:members.reduce((s,m)=>s+m.monthly_income,0),monthlyExpenses:members.reduce((s,m)=>s+m.monthly_expenses,0),existingDebtMonthlyPayment:0,existingDebtInterestPct:0,sourceLabel:`Household · ${members.length} profile summaries + joint assets`});
    }catch{setHouseholdStart(null)}
  },[profile]);

  const load=useCallback(async()=>{const[s,e,h]=await Promise.all([repo.futureScenarios(),repo.futureEvents(),repo.decisionLabRuns(12)]);setScenarios(s);setEvents(e);setRuns(h);setSelectedId(p=>p&&s.some(x=>x.id===p)?p:(s.find(x=>x.is_baseline)?.id??s[0]?.id??null));await buildStarts();},[buildStarts]);
  useEffect(()=>{load()},[load]);
  const selected=useMemo(()=>scenarios.find(x=>x.id===selectedId)??null,[scenarios,selectedId]);
  const startFor=useCallback((s:FutureScenario)=>s.scope==='household'?(householdStart??profileStart):profileStart,[householdStart,profileStart]);
  useEffect(()=>{if(!selected)return;repo.futureRiskSettings(selected.id).then(s=>{setSettings(s);setResult(null)});},[selected]);

  const saveSettings=async()=>{if(!settings)return;await repo.saveFutureRiskSettings(settings);setStatus('Risk assumptions saved locally.');setTimeout(()=>setStatus(''),2500)};
  const run=async()=>{if(!selected||!settings)return;const start=startFor(selected);if(!start)return;setBusy(true);setStatus(`Running ${settings.simulations.toLocaleString()} paths…`);try{await repo.saveFutureRiskSettings(settings);const r=await runWorker(start,selected,events.filter(e=>e.scenario_id===selected.id),settings);setResult(r);await execute(`INSERT INTO decision_lab_runs(scenario_id,scenario_name,simulations,success_probability,fi_probability,cash_stress_probability,p10_horizon_nw,median_horizon_nw,p90_horizon_nw,median_fi_date,settings_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[selected.id,selected.name,r.simulations,r.successProbability,r.fiProbability,r.cashStressProbability,r.p10HorizonNetWorth,r.medianHorizonNetWorth,r.p90HorizonNetWorth,r.medianFiDate,JSON.stringify(settings)]);setRuns(await repo.decisionLabRuns(12));setStatus('Simulation complete.');}catch(e){setStatus(String(e))}finally{setBusy(false)}};
  const compare=async()=>{if(!settings||!scenarios.length)return;setBusy(true);setStatus('Comparing scenarios with matched risk assumptions…');try{const picked=scenarios.slice(0,4),out:Array<{scenario:FutureScenario;result:MonteCarloResult}>=[];for(const s of picked){const st=startFor(s);if(!st)continue;const own=await repo.futureRiskSettings(s.id);const matched={...own,simulations:Math.min(settings.simulations,5000),investment_volatility_pct:settings.investment_volatility_pct,inflation_volatility_pct:settings.inflation_volatility_pct,property_volatility_pct:settings.property_volatility_pct,pension_volatility_pct:settings.pension_volatility_pct,early_shock_pct:settings.early_shock_pct,early_shock_month:settings.early_shock_month,random_seed:settings.random_seed};out.push({scenario:s,result:await runWorker(st,s,events.filter(e=>e.scenario_id===s.id),matched)});}setComparison(out);setStatus('Scenario comparison complete.');}catch(e){setStatus(String(e))}finally{setBusy(false)}};

  if(!selected||!settings)return <><PageHeader title="Decision Lab" subtitle="Monte Carlo, sequence risk and scenario robustness."/><Card><EmptyState title="Preparing Decision Lab" description="Create at least one Future scenario first."/></Card></>;
  const chart=result?.percentilePoints??[],hist=(result?.distribution??[]).map((x,i)=>({bucket:i+1,label:`${money(x.from)} – ${money(x.to)}`,mid:(x.from+x.to)/2,count:x.count}));

  return <>
    <PageHeader title="Decision Lab" subtitle="Stress-test your Future scenarios across thousands of plausible market and inflation paths." actions={<><button className="btn" onClick={saveSettings}><Save size={14}/>Save assumptions</button><button className="btn" onClick={compare} disabled={busy}><BarChart3 size={14}/>Compare scenarios</button><button className="btn primary" onClick={run} disabled={busy}><Play size={14}/>{busy?'Running…':'Run Monte Carlo'}</button></>}/>
    {status&&<div className="notice info" style={{marginBottom:14}}>{status}</div>}
    <div className="decision-scenario-row">{scenarios.map(s=><button key={s.id} className={`future-scenario-pill ${s.id===selected.id?'active':''}`} onClick={()=>setSelectedId(s.id)}><span>{s.name}</span>{s.is_baseline?<Badge tone="blue">Baseline</Badge>:null}<small>{s.scope==='household'?'Household':'Profile'} · {s.horizon_years}y</small></button>)}</div>

    <div className="grid decision-layout" style={{marginBottom:16}}>
      <Card title="Risk assumptions" subtitle="Volatility is annualised. Returns still use the expected values from Future.">
        <div className="form-grid decision-form">
          <Field label="Simulations"><select value={settings.simulations} onChange={e=>setSettings({...settings,simulations:Number(e.target.value)})}><option value={1000}>1,000 · quick</option><option value={2500}>2,500</option><option value={5000}>5,000 · recommended</option><option value={10000}>10,000 · detailed</option></select></Field>
          <Field label="Portfolio volatility"><input type="number" step="0.5" value={settings.investment_volatility_pct} onChange={e=>setSettings({...settings,investment_volatility_pct:Number(e.target.value)})}/></Field>
          <Field label="Inflation volatility"><input type="number" step="0.1" value={settings.inflation_volatility_pct} onChange={e=>setSettings({...settings,inflation_volatility_pct:Number(e.target.value)})}/></Field>
          <Field label="Property volatility"><input type="number" step="0.5" value={settings.property_volatility_pct} onChange={e=>setSettings({...settings,property_volatility_pct:Number(e.target.value)})}/></Field>
          <Field label="Pension volatility"><input type="number" step="0.5" value={settings.pension_volatility_pct} onChange={e=>setSettings({...settings,pension_volatility_pct:Number(e.target.value)})}/></Field>
          <Field label="Cash volatility"><input type="number" step="0.1" value={settings.cash_volatility_pct} onChange={e=>setSettings({...settings,cash_volatility_pct:Number(e.target.value)})}/></Field>
          <Field label="Initial market shock (%)" hint="Optional sequence-risk stress. Use e.g. -30."><input type="number" step="1" max="0" value={settings.early_shock_pct} onChange={e=>setSettings({...settings,early_shock_pct:Number(e.target.value)})}/></Field>
          <Field label="Shock month"><input type="number" min="1" max="60" value={settings.early_shock_month} onChange={e=>setSettings({...settings,early_shock_month:Number(e.target.value)})}/></Field>
          <Field label="Property / equity correlation"><input type="number" min="-0.95" max="0.95" step="0.05" value={settings.property_equity_correlation} onChange={e=>setSettings({...settings,property_equity_correlation:Number(e.target.value)})}/></Field>
          <Field label="Pension / equity correlation"><input type="number" min="-0.95" max="0.95" step="0.05" value={settings.pension_equity_correlation} onChange={e=>setSettings({...settings,pension_equity_correlation:Number(e.target.value)})}/></Field>
          <Field label="Failure floor (€)" hint="Plan is marked failed if net worth drops below this level."><input type="number" step="1000" value={settings.failure_floor} onChange={e=>setSettings({...settings,failure_floor:Number(e.target.value)})}/></Field>
          <Field label="Random seed" hint="Keep fixed for reproducible comparisons."><input type="number" step="1" value={settings.random_seed} onChange={e=>setSettings({...settings,random_seed:Number(e.target.value)})}/></Field>
        </div>
        <div className="decision-note"><Dices size={15}/><span>Random paths are reproducible with seed {settings.random_seed}. Change the seed only when you deliberately want a different sample.</span></div>
      </Card>
      <Card title="Model definition" subtitle="What success means in V2.6.">
        <div className="decision-definition">
          <div><ShieldCheck size={16}/><span><strong>Plan success</strong> · liquid assets do not become insolvent and net worth does not fall below the failure floor.</span></div>
          <div><Target size={16}/><span><strong>FI probability</strong> · cash + investments (and pensions if enabled in Future) reach annual spending ÷ withdrawal rate.</span></div>
          <div><TriangleAlert size={16}/><span><strong>Cash stress</strong> · monthly cash turns negative and requires portfolio funding at least once.</span></div>
          <div><UsersRound size={16}/><span><strong>Household</strong> · uses the latest partner summary and shared assets when the Future scenario scope is Household.</span></div>
        </div>
      </Card>
    </div>

    {result?<>
      <div className="kpi-grid decision-kpis">
        <KpiCard label="Plan success" value={pct01(result.successProbability)} sub={`${result.simulations.toLocaleString()} simulated paths`} tone={riskTone(result.successProbability)==='green'?'positive':riskTone(result.successProbability)==='red'?'negative':'neutral'} icon={<ShieldCheck size={16}/>}/>
        <KpiCard label="Reach FI" value={pct01(result.fiProbability)} sub={`Median FI: ${formatFiDate(result.medianFiDate)}`} icon={<Target size={16}/>}/>
        <KpiCard label={`Median net worth · ${selected.horizon_years}y`} value={money(result.medianHorizonNetWorth)} sub={`P10 ${money(result.p10HorizonNetWorth)} · P90 ${money(result.p90HorizonNetWorth)}`} icon={<Activity size={16}/>}/>
        <KpiCard label="Cash stress risk" value={pct01(result.cashStressProbability)} sub="At least one month needing portfolio funding" tone={result.cashStressProbability<.2?'positive':result.cashStressProbability>.5?'negative':'neutral'} icon={<Gauge size={16}/>}/>
      </div>
      <div className="grid decision-chart-grid" style={{marginBottom:16}}>
        <Card title="Wealth confidence bands" subtitle="P10 / median / P90 net worth across simulated paths."><div className="decision-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart} margin={{left:6,right:16,top:10,bottom:0}}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tickFormatter={v=>String(v).slice(0,4)} tick={{fontSize:9,fill:'var(--muted)'}}/><YAxis tickFormatter={v=>`€${Math.round(Number(v)/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}}/><Tooltip formatter={v=>money(Number(v))}/><Legend wrapperStyle={{fontSize:9}}/><Area type="monotone" dataKey="p90" name="P90" stroke="var(--green)" fill="var(--green-soft)" fillOpacity={.24}/><Area type="monotone" dataKey="p50" name="Median" stroke="var(--accent)" fill="transparent" strokeWidth={2.4}/><Area type="monotone" dataKey="p10" name="P10" stroke="var(--amber)" fill="transparent"/></AreaChart></ResponsiveContainer></div></Card>
        <Card title="Horizon distribution" subtitle="How the simulated ending net-worth outcomes are distributed."><div className="decision-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={hist}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="mid" tickFormatter={v=>`€${Math.round(Number(v)/1000)}k`} tick={{fontSize:8,fill:'var(--muted)'}}/><YAxis tick={{fontSize:9,fill:'var(--muted)'}}/><Tooltip labelFormatter={(_,payload)=>payload?.[0]?.payload?.label||''}/><Bar dataKey="count" name="Paths" fill="var(--accent)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div></Card>
      </div>
    </>:<Card className="decision-empty"><EmptyState title="Run your first Monte Carlo simulation" description="V2.5's deterministic projection remains in Future. Decision Lab adds uncertainty and sequence-of-returns risk on top." action={<button className="btn primary" onClick={run}><Sparkles size={14}/>Run {settings.simulations.toLocaleString()} paths</button>}/></Card>}

    {comparison.length>0&&<Card title="Scenario robustness comparison" subtitle="Same core risk assumptions applied across up to four Future scenarios." className="decision-comparison"><div className="table-wrap"><table><thead><tr><th>Scenario</th><th>Success</th><th>FI probability</th><th>P10 horizon</th><th>Median horizon</th><th>P90 horizon</th><th>Cash stress</th></tr></thead><tbody>{comparison.map(({scenario,result:r})=><tr key={scenario.id}><td><strong>{scenario.name}</strong><small>{scenario.scope}</small></td><td><Badge tone={riskTone(r.successProbability)}>{pct01(r.successProbability)}</Badge></td><td>{pct01(r.fiProbability)}</td><td>{money(r.p10HorizonNetWorth)}</td><td><strong>{money(r.medianHorizonNetWorth)}</strong></td><td>{money(r.p90HorizonNetWorth)}</td><td>{pct01(r.cashStressProbability)}</td></tr>)}</tbody></table></div></Card>}

    <Card title="Recent Decision Lab runs" subtitle="Compact local audit trail of your latest simulations.">{runs.length?<div className="table-wrap"><table><thead><tr><th>Run</th><th>Scenario</th><th>Paths</th><th>Success</th><th>FI</th><th>Median</th><th>P10 / P90</th></tr></thead><tbody>{runs.map(r=><tr key={r.id}><td>{new Date(r.created_at.replace(' ','T')+'Z').toLocaleString()}</td><td><strong>{r.scenario_name}</strong></td><td>{r.simulations.toLocaleString()}</td><td>{pct01(r.success_probability)}</td><td>{pct01(r.fi_probability)}</td><td>{money(r.median_horizon_nw)}</td><td>{money(r.p10_horizon_nw)} / {money(r.p90_horizon_nw)}</td></tr>)}</tbody></table></div>:<EmptyState title="No saved runs yet" description="Each completed Monte Carlo run is summarized locally here."/>}</Card>
    <div className="notice neutral future-disclaimer"><strong>Planning model, not a forecast.</strong><span>Monte Carlo results depend on your return, volatility, inflation, correlation and life-event assumptions. They are decision support, not investment or tax advice.</span></div>
  </>;
}
