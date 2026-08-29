import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  CalendarRange, Copy, Gauge, Home, Landmark, Pencil, Plus, Rocket, Settings2, Target,
  Trash2, TrendingUp, UsersRound, WalletCards,
} from 'lucide-react';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { KpiCard } from '../components/KpiCard';
import { Modal } from '../components/Modal';
import { useProfileSession } from '../components/ProfileSession';
import { execute, repo, select } from '../lib/db';
import { derivePositions, financeTotals, monthlySeries } from '../lib/finance';
import {
  formatFiDate, monthlyMortgagePayment, projectScenario, projectionYearly, startingNetWorth,
} from '../lib/future';
import { householdMembers, sharedAssetNet, sharedAssets, syncActiveProfile } from '../lib/household';
import { money, percent, todayIso } from '../lib/utils';
import type {
  Account, Debtor, FutureEvent, FutureEventType, FutureProjectionResult, FutureScenario,
  FutureStartingPoint, Liability, Pension, Property, Security, Trade, Transaction,
} from '../types';

const eventTypes: Array<{value:FutureEventType;label:string;hint:string}> = [
  {value:'one_off_income',label:'One-off income',hint:'Bonus, inheritance, asset sale proceeds or another inflow.'},
  {value:'one_off_expense',label:'One-off expense',hint:'Renovation, education, car, wedding or another major cost.'},
  {value:'monthly_income_change',label:'Monthly income change',hint:'Salary increase/decrease, rent or other recurring income change.'},
  {value:'monthly_expense_change',label:'Monthly expense change',hint:'Childcare, rent change, education or another recurring cost.'},
  {value:'investment_lump_sum',label:'Invest lump sum',hint:'Moves cash into investments; net worth is unchanged at that moment.'},
  {value:'home_purchase',label:'Buy a home',hint:'Adds a property, down payment, costs and amortising mortgage.'},
  {value:'retirement',label:'Retirement / work exit',hint:'Replaces baseline monthly earned income from this date onward.'},
];

const scenarioBlank = (): Omit<FutureScenario,'id'|'created_at'|'updated_at'> => ({
  name:'Base plan',description:'',scope:'profile',is_baseline:0,horizon_years:35,annual_return_pct:6,
  cash_return_pct:1.5,inflation_pct:2,income_growth_pct:2,expense_growth_pct:0,property_growth_pct:2,
  pension_growth_pct:4,surplus_to_invest_pct:80,withdrawal_rate_pct:4,include_pensions_in_fi:0,
  baseline_income_override:null,baseline_expense_override:null,pension_monthly_contribution:0,auto_fund_deficits:1,
});

const eventBlank = (): Omit<FutureEvent,'id'|'scenario_id'|'created_at'|'updated_at'> => ({
  name:'',event_type:'one_off_expense',start_date:todayIso(),end_date:'',amount:0,annual_growth_pct:0,
  details_json:'',notes:'',
});

function avgRecentCashflow(transactions: Transaction[]) {
  const all = monthlySeries(transactions);
  const currentMonth = new Date().toISOString().slice(0,7);
  const completed = all.filter(row => row.month < currentMonth);
  const series = (completed.length ? completed : all).slice(-6);
  if (!series.length) return {income:0,expenses:0,months:0};
  return {
    income: series.reduce((s,x)=>s+x.income,0)/series.length,
    expenses: series.reduce((s,x)=>s+x.expenses,0)/series.length,
    months: series.length,
  };
}

function eventLabel(type:string) { return eventTypes.find(x=>x.value===type)?.label ?? type; }
function eventTone(type:string): 'green'|'red'|'blue'|'amber'|'purple'|'slate' {
  if(type==='one_off_income'||type==='monthly_income_change') return 'green';
  if(type==='one_off_expense'||type==='monthly_expense_change') return 'red';
  if(type==='home_purchase') return 'purple';
  if(type==='investment_lump_sum') return 'blue';
  if(type==='retirement') return 'amber';
  return 'slate';
}

function parseHome(event: FutureEvent) {
  try { return event.details_json ? JSON.parse(event.details_json) as Record<string,number> : {}; } catch { return {}; }
}

function yearsFromNow(date:string|null) {
  if(!date) return null;
  const d=new Date(`${date.slice(0,7)}-01T12:00:00`);
  return Math.max(0,(d.getTime()-Date.now())/(365.25*86400000));
}

export function Future() {
  const {profile}=useProfileSession();
  const [scenarios,setScenarios]=useState<FutureScenario[]>([]);
  const [events,setEvents]=useState<FutureEvent[]>([]);
  const [selectedId,setSelectedId]=useState<number|null>(null);
  const [profileStart,setProfileStart]=useState<FutureStartingPoint|null>(null);
  const [householdStart,setHouseholdStart]=useState<FutureStartingPoint|null>(null);
  const [scenarioOpen,setScenarioOpen]=useState(false);
  const [newScenarioOpen,setNewScenarioOpen]=useState(false);
  const [eventOpen,setEventOpen]=useState(false);
  const [scenarioForm,setScenarioForm]=useState(scenarioBlank());
  const [eventForm,setEventForm]=useState(eventBlank());
  const [homeForm,setHomeForm]=useState({purchasePrice:600000,downPayment:120000,closingCosts:45000,mortgagePrincipal:480000,interestPct:3.2,termYears:25,replacedMonthlyHousingCost:0});
  const [cloneName,setCloneName]=useState('');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');

  const buildStartingPoints=useCallback(async()=>{
    const [accounts,securities,trades,properties,pensions,liabilities,debtors,transactions] = await Promise.all([
      repo.accounts(),repo.securities(),repo.trades(),repo.properties(),repo.pensions(),repo.liabilities(),repo.debtors(),
      select<Transaction>('SELECT * FROM transactions ORDER BY date,id'),
    ]) as [Account[],Security[],Trade[],Property[],Pension[],Liability[],Debtor[],Transaction[]];
    const positions=derivePositions(securities,trades);
    const totals=financeTotals(accounts,positions,properties,pensions,debtors,liabilities);
    const flow=avgRecentCashflow(transactions);
    const weightedDebtRate=liabilities.reduce((s,l)=>s+Math.max(0,l.outstanding_balance)*Math.max(0,l.interest_pct),0)/Math.max(1,liabilities.reduce((s,l)=>s+Math.max(0,l.outstanding_balance),0));
    setProfileStart({
      cash:totals.cash,investments:totals.investments,realEstate:totals.realEstate,pensions:totals.pensions,
      receivables:totals.debtors,liabilities:totals.liabilities,monthlyIncome:flow.income,monthlyExpenses:flow.expenses,
      existingDebtMonthlyPayment:liabilities.reduce((s,l)=>s+Math.max(0,l.monthly_payment),0),existingDebtInterestPct:weightedDebtRate||0,
      sourceLabel:`${profile.name} · trailing ${flow.months}-month average cashflow`,
    });

    try {
      await syncActiveProfile(profile);
      const [members,shared]=await Promise.all([householdMembers(),sharedAssets()]);
      const sharedCash=shared.filter(x=>x.liquid||x.asset_class==='cash').reduce((s,a)=>s+sharedAssetNet(a),0);
      const sharedInvestments=shared.filter(x=>x.asset_class==='investments'&&!x.liquid).reduce((s,a)=>s+sharedAssetNet(a),0);
      const sharedProperty=shared.filter(x=>['real_estate','other'].includes(x.asset_class)&&!x.liquid).reduce((s,a)=>s+sharedAssetNet(a),0);
      const sharedPensions=shared.filter(x=>x.asset_class==='pensions').reduce((s,a)=>s+sharedAssetNet(a),0);
      const sharedReceivables=shared.filter(x=>x.asset_class==='receivables').reduce((s,a)=>s+sharedAssetNet(a),0);
      const sharedLiabilities=shared.filter(x=>x.asset_class==='liability').reduce((s,a)=>s+Math.abs(sharedAssetNet(a)),0);
      setHouseholdStart({
        cash:members.reduce((s,m)=>s+m.cash,0)+sharedCash,
        investments:members.reduce((s,m)=>s+m.investments,0)+sharedInvestments,
        realEstate:members.reduce((s,m)=>s+m.real_estate,0)+sharedProperty,
        pensions:members.reduce((s,m)=>s+m.pensions,0)+sharedPensions,
        receivables:members.reduce((s,m)=>s+m.debtors,0)+sharedReceivables,
        liabilities:members.reduce((s,m)=>s+m.liabilities,0)+sharedLiabilities,
        monthlyIncome:members.reduce((s,m)=>s+m.monthly_income,0),
        monthlyExpenses:members.reduce((s,m)=>s+m.monthly_expenses,0),
        existingDebtMonthlyPayment:0,existingDebtInterestPct:0,
        sourceLabel:`Household · ${members.length} shared profile ${members.length===1?'summary':'summaries'} + joint assets`,
      });
    } catch(e) {
      console.warn('Household projection source unavailable',e);
      setHouseholdStart(null);
    }
  },[profile]);

  const load=useCallback(async()=>{
    const [s,e]=await Promise.all([repo.futureScenarios(),repo.futureEvents()]);
    setScenarios(s);setEvents(e);
    setSelectedId(prev=>prev&&s.some(x=>x.id===prev)?prev:(s.find(x=>x.is_baseline)?.id??s[0]?.id??null));
    await buildStartingPoints();
  },[buildStartingPoints]);
  useEffect(()=>{load()},[load]);

  const selected=useMemo(()=>scenarios.find(x=>x.id===selectedId)??scenarios[0]??null,[scenarios,selectedId]);
  const selectedEvents=useMemo(()=>selected?events.filter(e=>e.scenario_id===selected.id):[],[events,selected]);
  const startFor=useCallback((scenario:FutureScenario)=>scenario.scope==='household'?(householdStart??profileStart):profileStart,[householdStart,profileStart]);
  const result=useMemo(()=>selected&&startFor(selected)?projectScenario(startFor(selected)!,selected,selectedEvents):null,[selected,selectedEvents,startFor]);
  const chartData=useMemo(()=>result?projectionYearly(result.points):[],[result]);
  const allResults=useMemo(()=>scenarios.map(s=>{
    const start=startFor(s); if(!start)return null;
    return {scenario:s,result:projectScenario(start,s,events.filter(e=>e.scenario_id===s.id))};
  }).filter(Boolean) as Array<{scenario:FutureScenario;result:FutureProjectionResult}>,[scenarios,events,startFor]);
  const baselineResult=allResults.find(x=>x.scenario.is_baseline)?.result??allResults[0]?.result;
  const comparisonData=useMemo(()=>{
    const map=new Map<string,Record<string,string|number>>();
    for(const {scenario,result:r} of allResults){
      for(const point of projectionYearly(r.points)){
        const row=map.get(point.date)??{date:point.date};
        row[`scenario_${scenario.id}`]=point.netWorth;
        map.set(point.date,row);
      }
    }
    return [...map.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  },[allResults]);
  const currentStart=selected?startFor(selected):null;

  const openAssumptions=()=>{
    if(!selected)return;
    setScenarioForm({...selected});setScenarioOpen(true);
  };
  const saveAssumptions=async()=>{
    if(!selected)return;setBusy(true);
    try{
      await execute(`UPDATE future_scenarios SET name=$1,description=$2,scope=$3,horizon_years=$4,annual_return_pct=$5,cash_return_pct=$6,inflation_pct=$7,income_growth_pct=$8,expense_growth_pct=$9,property_growth_pct=$10,pension_growth_pct=$11,surplus_to_invest_pct=$12,withdrawal_rate_pct=$13,include_pensions_in_fi=$14,baseline_income_override=$15,baseline_expense_override=$16,pension_monthly_contribution=$17,auto_fund_deficits=$18,updated_at=CURRENT_TIMESTAMP WHERE id=$19`,[
        scenarioForm.name.trim()||selected.name,scenarioForm.description||null,scenarioForm.scope,scenarioForm.horizon_years,scenarioForm.annual_return_pct,scenarioForm.cash_return_pct,scenarioForm.inflation_pct,scenarioForm.income_growth_pct,scenarioForm.expense_growth_pct,scenarioForm.property_growth_pct,scenarioForm.pension_growth_pct,scenarioForm.surplus_to_invest_pct,scenarioForm.withdrawal_rate_pct,scenarioForm.include_pensions_in_fi,scenarioForm.baseline_income_override,scenarioForm.baseline_expense_override,scenarioForm.pension_monthly_contribution,scenarioForm.auto_fund_deficits,selected.id,
      ]);setScenarioOpen(false);await load();
    }finally{setBusy(false)}
  };

  const openClone=()=>{if(!selected)return;setCloneName(`${selected.name} copy`);setNewScenarioOpen(true)};
  const cloneScenario=async()=>{
    if(!selected||!cloneName.trim())return;setBusy(true);
    try{
      const r=await execute(`INSERT INTO future_scenarios(name,description,scope,is_baseline,horizon_years,annual_return_pct,cash_return_pct,inflation_pct,income_growth_pct,expense_growth_pct,property_growth_pct,pension_growth_pct,surplus_to_invest_pct,withdrawal_rate_pct,include_pensions_in_fi,baseline_income_override,baseline_expense_override,pension_monthly_contribution,auto_fund_deficits) VALUES($1,$2,$3,0,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[
        cloneName.trim(),selected.description||null,selected.scope,selected.horizon_years,selected.annual_return_pct,selected.cash_return_pct,selected.inflation_pct,selected.income_growth_pct,selected.expense_growth_pct,selected.property_growth_pct,selected.pension_growth_pct,selected.surplus_to_invest_pct,selected.withdrawal_rate_pct,selected.include_pensions_in_fi,selected.baseline_income_override,selected.baseline_expense_override,selected.pension_monthly_contribution,selected.auto_fund_deficits,
      ]);
      const newId=Number(r.lastInsertId);
      for(const e of selectedEvents) await execute(`INSERT INTO future_events(scenario_id,name,event_type,start_date,end_date,amount,annual_growth_pct,details_json,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[newId,e.name,e.event_type,e.start_date,e.end_date||null,e.amount,e.annual_growth_pct,e.details_json||null,e.notes||null]);
      setNewScenarioOpen(false);await load();setSelectedId(newId);
    }finally{setBusy(false)}
  };
  const deleteScenario=async()=>{
    if(!selected||scenarios.length<=1)return;
    if(!confirm(`Delete scenario “${selected.name}” and all its life events?`))return;
    await execute('DELETE FROM future_events WHERE scenario_id=$1',[selected.id]);
    await execute('DELETE FROM future_scenarios WHERE id=$1',[selected.id]);await load();
  };
  const makeBaseline=async()=>{
    if(!selected)return;await execute('UPDATE future_scenarios SET is_baseline=0');await execute('UPDATE future_scenarios SET is_baseline=1 WHERE id=$1',[selected.id]);await load();
  };

  const openNewEvent=()=>{setEventForm(eventBlank());setHomeForm({purchasePrice:600000,downPayment:120000,closingCosts:45000,mortgagePrincipal:480000,interestPct:3.2,termYears:25,replacedMonthlyHousingCost:0});setEventOpen(true)};
  const saveEvent=async()=>{
    if(!selected||!eventForm.name.trim())return;setBusy(true);
    try{
      const detailsJson=eventForm.event_type==='home_purchase'?JSON.stringify(homeForm):(eventForm.details_json||null);
      const amount=eventForm.event_type==='home_purchase'?homeForm.purchasePrice:eventForm.amount;
      await execute(`INSERT INTO future_events(scenario_id,name,event_type,start_date,end_date,amount,annual_growth_pct,details_json,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[selected.id,eventForm.name.trim(),eventForm.event_type,eventForm.start_date,eventForm.end_date||null,amount,eventForm.annual_growth_pct,detailsJson,eventForm.notes||null]);
      setEventOpen(false);await load();
    }finally{setBusy(false)}
  };
  const deleteEvent=async(e:FutureEvent)=>{if(confirm(`Delete “${e.name}”?`)){await execute('DELETE FROM future_events WHERE id=$1',[e.id]);await load();}};

  if(!selected||!result||!currentStart) return <><PageHeader title="Future" subtitle="Long-term wealth projections and financial decision scenarios."/><Card><EmptyState title="Preparing your first projection" description="Finance Tracker is building the deterministic baseline from your local financial data."/></Card></>;

  const delta=result.horizonNetWorth-result.startingNetWorth;
  const vsBaseline=baselineResult?result.horizonNetWorth-baselineResult.horizonNetWorth:0;
  const fiYears=yearsFromNow(result.fiDate);

  return <>
    <PageHeader title="Future" subtitle="Model major financial choices before you make them — using your current Finance Tracker data as the starting point." actions={<>
      <button className="btn" onClick={openAssumptions}><Settings2 size={14}/>Assumptions</button>
      <button className="btn" onClick={openClone}><Copy size={14}/>Duplicate</button>
      <button className="btn primary" onClick={openNewEvent}><Plus size={14}/>Life event</button>
    </>}/>
    {status&&<div className="notice info" style={{marginBottom:14}}>{status}</div>}

    <div className="future-scenario-strip">
      {scenarios.map(s=><button key={s.id} className={`future-scenario-pill ${s.id===selected.id?'active':''}`} onClick={()=>setSelectedId(s.id)}><span>{s.name}</span>{s.is_baseline?<Badge tone="blue">Baseline</Badge>:null}<small>{s.scope==='household'?'Household':'Profile'} · {s.horizon_years}y</small></button>)}
      <button className="future-scenario-add" onClick={openClone}><Plus size={15}/>New scenario</button>
    </div>

    <div className="kpi-grid future-kpis">
      <KpiCard label={`Projected net worth · ${selected.horizon_years}y`} value={money(result.horizonNetWorth)} sub={`${money(delta)} vs today · ≈ ${money(result.horizonNetWorth/Math.pow(1+selected.inflation_pct/100,selected.horizon_years))} in today’s euros`} tone={delta>=0?'positive':'negative'} icon={<TrendingUp size={16}/>}/>
      <KpiCard label="Financial independence" value={formatFiDate(result.fiDate)} sub={fiYears!=null?`≈ ${fiYears.toFixed(1)} years from now`:`Not reached within ${selected.horizon_years} years`} icon={<Target size={16}/>}/>
      <KpiCard label="Investable assets at horizon" value={money(result.horizonInvestable)} sub={`${selected.include_pensions_in_fi?'Cash + investments + pensions':'Cash + investments'}`} icon={<WalletCards size={16}/>}/>
      <KpiCard label="Lowest projected cash" value={money(result.minimumCash)} sub={result.minimumCash<0?'Deficit requires attention':'Cash remains non-negative'} tone={result.minimumCash>=0?'positive':'negative'} icon={<Gauge size={16}/>}/>
    </div>

    <div className="grid future-main-grid" style={{marginBottom:16}}>
      <Card title="Projected wealth path" subtitle={`${selected.name} · deterministic monthly model shown at year-end intervals`} actions={<Badge tone={selected.scope==='household'?'purple':'blue'}>{selected.scope==='household'?<><UsersRound size={11}/> Household</>:<>Profile</>}</Badge>}>
        <div className="future-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={chartData} margin={{left:4,right:18,top:12,bottom:2}}>
          <defs><linearGradient id="futureNw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.22}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tickFormatter={v=>String(v).slice(0,4)} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>`€${Math.round(Number(v)/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><Tooltip labelFormatter={v=>String(v).slice(0,7)} formatter={(v,n)=>[money(Number(v)),String(n)]}/><Legend wrapperStyle={{fontSize:9}}/><Area type="monotone" name="Net worth" dataKey="netWorth" stroke="var(--accent)" strokeWidth={2.2} fill="url(#futureNw)"/><Line type="monotone" name="Investable" dataKey="investableAssets" stroke="var(--green)" strokeWidth={1.7} dot={false}/>
        </ComposedChart></ResponsiveContainer></div>
        <div className="future-source-note"><Landmark size={13}/><span>Starting point: {currentStart.sourceLabel}. The projection does not overwrite your real accounts or balances.</span></div>
      </Card>
      <Card title="Scenario assumptions" subtitle="Transparent inputs — no hidden AI forecast." actions={<button className="icon-button small" onClick={openAssumptions}><Pencil size={13}/></button>}>
        <div className="future-assumptions">
          <div><span>Portfolio return</span><strong>{percent(selected.annual_return_pct)}</strong></div>
          <div><span>Inflation</span><strong>{percent(selected.inflation_pct)}</strong></div>
          <div><span>Income growth</span><strong>{percent(selected.income_growth_pct)}</strong></div>
          <div><span>Expense drift above inflation</span><strong>{percent(selected.expense_growth_pct)}</strong></div>
          <div><span>Property growth</span><strong>{percent(selected.property_growth_pct)}</strong></div>
          <div><span>Surplus invested</span><strong>{selected.surplus_to_invest_pct.toFixed(0)}%</strong></div>
          <div><span>FI withdrawal rate</span><strong>{selected.withdrawal_rate_pct.toFixed(2)}%</strong></div>
          <div><span>Projection horizon</span><strong>{selected.horizon_years} years</strong></div>
        </div>
        <div className="notice neutral future-method-note"><strong>FI definition</strong><span>First month where projected {selected.include_pensions_in_fi?'cash + investments + pensions':'cash + investments'} ≥ annual projected expenses ÷ withdrawal rate. Real estate is excluded from FI assets.</span></div>
      </Card>
    </div>

    <div className="grid two" style={{marginBottom:16}}>
      <Card title="Life-event timeline" subtitle="Events change the selected scenario only." actions={<button className="btn compact" onClick={openNewEvent}><Plus size={13}/>Add</button>}>
        {!selectedEvents.length?<EmptyState title="No life events yet" description="Add a salary change, large purchase, home, retirement or other event." action={<button className="btn primary compact" onClick={openNewEvent}>Add first event</button>}/>:<div className="future-event-list">{selectedEvents.map(e=>{
          const home=e.event_type==='home_purchase'?parseHome(e):null;
          return <div className="future-event-row" key={e.id}><div className={`future-event-icon ${eventTone(e.event_type)}`}>{e.event_type==='home_purchase'?<Home size={15}/>:e.event_type==='retirement'?<Rocket size={15}/>:<CalendarRange size={15}/>}</div><div className="future-event-copy"><div><strong>{e.name}</strong><Badge tone={eventTone(e.event_type)}>{eventLabel(e.event_type)}</Badge></div><span>{e.start_date}{e.end_date?` → ${e.end_date}`:''}{e.event_type==='home_purchase'&&home?` · ${money(Number(home.purchasePrice||e.amount))} home · ${money(monthlyMortgagePayment(Number(home.mortgagePrincipal||0),Number(home.interestPct||0),Number(home.termYears||0)))} /mo mortgage`:e.amount?` · ${money(Math.abs(e.amount))}${e.event_type.includes('monthly')||e.event_type==='retirement'?' /mo':''}`:''}</span>{e.notes&&<p>{e.notes}</p>}</div><button className="icon-button small danger" onClick={()=>deleteEvent(e)}><Trash2 size={13}/></button></div>})}</div>}
      </Card>
      <Card title="Starting balance sheet" subtitle="Live values used at month zero.">
        {[['Cash',currentStart.cash],['Investments',currentStart.investments],['Real estate / equity',currentStart.realEstate],['Pensions',currentStart.pensions],['Receivables',currentStart.receivables],['Liabilities',-currentStart.liabilities]].map(([label,value])=><div className="metric-row" key={String(label)}><span>{label}</span><strong className={Number(value)<0?'money-negative':''}>{money(Number(value))}</strong></div>)}
        <div className="future-flow-start"><div><span>Baseline monthly income</span><strong>{money(selected.baseline_income_override??currentStart.monthlyIncome)}</strong></div><div><span>Baseline monthly expenses</span><strong>{money(selected.baseline_expense_override??currentStart.monthlyExpenses)}</strong></div></div>
      </Card>
    </div>

    <Card title="Scenario comparison" subtitle="Same engine, different assumptions and life events. This is where major choices become comparable." className="future-compare-card">
      {allResults.length>1&&<div className="future-compare-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={comparisonData} margin={{left:4,right:16,top:10,bottom:0}}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tickFormatter={v=>String(v).slice(0,4)} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>`€${Math.round(Number(v)/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><Tooltip formatter={(v)=>money(Number(v))}/><Legend wrapperStyle={{fontSize:9}}/>{allResults.map(({scenario},index)=><Line key={scenario.id} type="monotone" name={scenario.name} dataKey={`scenario_${scenario.id}`} stroke={['var(--accent)','var(--green)','var(--purple)','var(--amber)','var(--navy)'][index%5]} strokeWidth={scenario.id===selected.id?2.4:1.5} dot={false} connectNulls/>)}</ComposedChart></ResponsiveContainer></div>}
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Scenario</th><th>Scope</th><th>Horizon</th><th>FI estimate</th><th>Projected net worth</th><th>Investable assets</th><th>Vs baseline</th><th>Minimum cash</th></tr></thead><tbody>{allResults.map(({scenario,result:r})=><tr key={scenario.id} className={scenario.id===selected.id?'selected-row':''}><td><button className="table-link" onClick={()=>setSelectedId(scenario.id)}>{scenario.name}</button>{scenario.is_baseline?<span className="table-sub">Baseline</span>:null}</td><td>{scenario.scope==='household'?'Household':'Profile'}</td><td>{scenario.horizon_years}y</td><td>{formatFiDate(r.fiDate)}</td><td><strong>{money(r.horizonNetWorth)}</strong></td><td>{money(r.horizonInvestable)}</td><td className={baselineResult&&r.horizonNetWorth>=baselineResult.horizonNetWorth?'money-positive':'money-negative'}>{baselineResult?money(r.horizonNetWorth-baselineResult.horizonNetWorth):'—'}</td><td className={r.minimumCash<0?'money-negative':''}>{money(r.minimumCash)}</td></tr>)}</tbody></table></div>
      <div className="future-compare-foot"><span>Selected vs baseline at horizon</span><strong className={vsBaseline>=0?'money-positive':'money-negative'}>{money(vsBaseline)}</strong></div>
    </Card>

    <div className="future-scenario-admin"><button className="btn compact" onClick={makeBaseline} disabled={!!selected.is_baseline}>Make baseline</button><button className="btn compact danger" onClick={deleteScenario} disabled={scenarios.length<=1}><Trash2 size={13}/>Delete scenario</button></div>
    <div className="notice neutral future-disclaimer"><strong>Planning model, not a prediction.</strong><span>V2.5 uses deterministic assumptions and simplifies taxes, market sequence risk, mortgage tax effects and irregular future spending. V2.6 adds stochastic Monte Carlo and Decision Lab comparisons.</span></div>

    <Modal open={scenarioOpen} title="Scenario assumptions" subtitle="Fine-tune the model while keeping every assumption visible." onClose={()=>setScenarioOpen(false)} width={760}>
      <div className="form-grid three">
        <Field label="Scenario name"><input className="input" value={scenarioForm.name} onChange={e=>setScenarioForm({...scenarioForm,name:e.target.value})}/></Field>
        <Field label="Projection scope"><select className="select" value={scenarioForm.scope} onChange={e=>setScenarioForm({...scenarioForm,scope:e.target.value})}><option value="profile">This profile</option><option value="household">Household</option></select></Field>
        <Field label="Horizon (years)"><input className="input" type="number" min="5" max="70" value={scenarioForm.horizon_years} onChange={e=>setScenarioForm({...scenarioForm,horizon_years:Number(e.target.value)})}/></Field>
        <Field label="Portfolio return %"><input className="input" type="number" step="0.1" value={scenarioForm.annual_return_pct} onChange={e=>setScenarioForm({...scenarioForm,annual_return_pct:Number(e.target.value)})}/></Field>
        <Field label="Cash return %"><input className="input" type="number" step="0.1" value={scenarioForm.cash_return_pct} onChange={e=>setScenarioForm({...scenarioForm,cash_return_pct:Number(e.target.value)})}/></Field>
        <Field label="Inflation %"><input className="input" type="number" step="0.1" value={scenarioForm.inflation_pct} onChange={e=>setScenarioForm({...scenarioForm,inflation_pct:Number(e.target.value)})}/></Field>
        <Field label="Income growth %"><input className="input" type="number" step="0.1" value={scenarioForm.income_growth_pct} onChange={e=>setScenarioForm({...scenarioForm,income_growth_pct:Number(e.target.value)})}/></Field>
        <Field label="Expense drift above inflation %"><input className="input" type="number" step="0.1" value={scenarioForm.expense_growth_pct} onChange={e=>setScenarioForm({...scenarioForm,expense_growth_pct:Number(e.target.value)})}/></Field>
        <Field label="Property growth %"><input className="input" type="number" step="0.1" value={scenarioForm.property_growth_pct} onChange={e=>setScenarioForm({...scenarioForm,property_growth_pct:Number(e.target.value)})}/></Field>
        <Field label="Pension growth %"><input className="input" type="number" step="0.1" value={scenarioForm.pension_growth_pct} onChange={e=>setScenarioForm({...scenarioForm,pension_growth_pct:Number(e.target.value)})}/></Field>
        <Field label="Surplus invested %"><input className="input" type="number" min="0" max="100" value={scenarioForm.surplus_to_invest_pct} onChange={e=>setScenarioForm({...scenarioForm,surplus_to_invest_pct:Number(e.target.value)})}/></Field>
        <Field label="FI withdrawal rate %"><input className="input" type="number" step="0.05" min="0.5" value={scenarioForm.withdrawal_rate_pct} onChange={e=>setScenarioForm({...scenarioForm,withdrawal_rate_pct:Number(e.target.value)})}/></Field>
        <Field label="Monthly pension contribution"><input className="input" type="number" value={scenarioForm.pension_monthly_contribution} onChange={e=>setScenarioForm({...scenarioForm,pension_monthly_contribution:Number(e.target.value)})}/></Field>
        <Field label="Override monthly income" hint="Leave blank to use Finance Tracker history."><input className="input" type="number" value={scenarioForm.baseline_income_override??''} placeholder={String(Math.round(currentStart.monthlyIncome))} onChange={e=>setScenarioForm({...scenarioForm,baseline_income_override:e.target.value===''?null:Number(e.target.value)})}/></Field>
        <Field label="Override monthly expenses" hint="Leave blank to use Finance Tracker history."><input className="input" type="number" value={scenarioForm.baseline_expense_override??''} placeholder={String(Math.round(currentStart.monthlyExpenses))} onChange={e=>setScenarioForm({...scenarioForm,baseline_expense_override:e.target.value===''?null:Number(e.target.value)})}/></Field>
        <div className="full"><Field label="Description"><textarea className="textarea" value={scenarioForm.description??''} onChange={e=>setScenarioForm({...scenarioForm,description:e.target.value})}/></Field></div>
      </div>
      <div className="future-toggle-grid"><label className="biometry-choice"><input type="checkbox" checked={!!scenarioForm.include_pensions_in_fi} onChange={e=>setScenarioForm({...scenarioForm,include_pensions_in_fi:e.target.checked?1:0})}/><Target size={17}/><div><strong>Count pensions toward FI</strong><span>Off by default because access may be age-restricted.</span></div></label><label className="biometry-choice"><input type="checkbox" checked={!!scenarioForm.auto_fund_deficits} onChange={e=>setScenarioForm({...scenarioForm,auto_fund_deficits:e.target.checked?1:0})}/><WalletCards size={17}/><div><strong>Fund cash deficits from investments</strong><span>Useful after retirement; prevents cash staying negative while investments exist.</span></div></label></div>
      <div className="modal-actions"><button className="btn" onClick={()=>setScenarioOpen(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={saveAssumptions}>{busy?'Saving…':'Save assumptions'}</button></div>
    </Modal>

    <Modal open={newScenarioOpen} title="Duplicate scenario" subtitle="Create a branch from the current plan, including its life events." onClose={()=>setNewScenarioOpen(false)} width={520}>
      <Field label="New scenario name"><input className="input" autoFocus value={cloneName} onChange={e=>setCloneName(e.target.value)}/></Field><div className="notice neutral" style={{marginTop:12}}>Copies <strong>{selected.name}</strong>. You can then change assumptions or events independently.</div><div className="modal-actions"><button className="btn" onClick={()=>setNewScenarioOpen(false)}>Cancel</button><button className="btn primary" disabled={busy||!cloneName.trim()} onClick={cloneScenario}>{busy?'Creating…':'Create scenario'}</button></div>
    </Modal>

    <Modal open={eventOpen} title="Add life event" subtitle="Model a change from a specific month onward." onClose={()=>setEventOpen(false)} width={720}>
      <div className="form-grid three">
        <Field label="Event name"><input className="input" value={eventForm.name} onChange={e=>setEventForm({...eventForm,name:e.target.value})}/></Field>
        <Field label="Event type"><select className="select" value={eventForm.event_type} onChange={e=>setEventForm({...eventForm,event_type:e.target.value as FutureEventType})}>{eventTypes.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
        <Field label="Start date"><input className="input" type="date" value={eventForm.start_date} onChange={e=>setEventForm({...eventForm,start_date:e.target.value})}/></Field>
        {eventForm.event_type!=='home_purchase'&&<Field label={eventForm.event_type==='retirement'?'Replacement monthly income':'Amount'}><input className="input" type="number" value={eventForm.amount} onChange={e=>setEventForm({...eventForm,amount:Number(e.target.value)})}/></Field>}
        {(eventForm.event_type==='monthly_income_change'||eventForm.event_type==='monthly_expense_change')&&<Field label="End date (optional)"><input className="input" type="date" value={eventForm.end_date??''} onChange={e=>setEventForm({...eventForm,end_date:e.target.value})}/></Field>}
        {eventForm.event_type!=='home_purchase'&&<Field label="Annual growth %"><input className="input" type="number" step="0.1" value={eventForm.annual_growth_pct} onChange={e=>setEventForm({...eventForm,annual_growth_pct:Number(e.target.value)})}/></Field>}
      </div>
      <div className="future-event-hint">{eventTypes.find(x=>x.value===eventForm.event_type)?.hint}</div>
      {eventForm.event_type==='home_purchase'&&<><div className="section-label">Home & mortgage</div><div className="form-grid three">
        <Field label="Purchase price"><input className="input" type="number" value={homeForm.purchasePrice} onChange={e=>{const purchasePrice=Number(e.target.value);setHomeForm({...homeForm,purchasePrice,mortgagePrincipal:Math.max(0,purchasePrice-homeForm.downPayment)})}}/></Field>
        <Field label="Down payment"><input className="input" type="number" value={homeForm.downPayment} onChange={e=>{const downPayment=Number(e.target.value);setHomeForm({...homeForm,downPayment,mortgagePrincipal:Math.max(0,homeForm.purchasePrice-downPayment)})}}/></Field>
        <Field label="Purchase / closing costs"><input className="input" type="number" value={homeForm.closingCosts} onChange={e=>setHomeForm({...homeForm,closingCosts:Number(e.target.value)})}/></Field>
        <Field label="Mortgage principal"><input className="input" type="number" value={homeForm.mortgagePrincipal} onChange={e=>setHomeForm({...homeForm,mortgagePrincipal:Number(e.target.value)})}/></Field>
        <Field label="Mortgage interest %"><input className="input" type="number" step="0.05" value={homeForm.interestPct} onChange={e=>setHomeForm({...homeForm,interestPct:Number(e.target.value)})}/></Field>
        <Field label="Mortgage term (years)"><input className="input" type="number" value={homeForm.termYears} onChange={e=>setHomeForm({...homeForm,termYears:Number(e.target.value)})}/></Field>
        <Field label="Existing monthly housing cost replaced" hint="E.g. current rent/mortgage that disappears after purchase."><input className="input" type="number" value={homeForm.replacedMonthlyHousingCost} onChange={e=>setHomeForm({...homeForm,replacedMonthlyHousingCost:Number(e.target.value)})}/></Field>
        <div className="future-mortgage-preview"><span>Estimated payment</span><strong>{money(monthlyMortgagePayment(homeForm.mortgagePrincipal,homeForm.interestPct,homeForm.termYears))}/mo</strong></div>
      </div></>}
      <div style={{height:12}}/><Field label="Notes"><textarea className="textarea" value={eventForm.notes??''} onChange={e=>setEventForm({...eventForm,notes:e.target.value})}/></Field>
      <div className="modal-actions"><button className="btn" onClick={()=>setEventOpen(false)}>Cancel</button><button className="btn primary" disabled={busy||!eventForm.name.trim()} onClick={saveEvent}>{busy?'Adding…':'Add event'}</button></div>
    </Modal>
  </>;
}
