import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, EmptyState, Field, PageHeader } from '../components/Common';
import { Modal } from '../components/Modal';
import { execute, repo } from '../lib/db';
import { recurringMonthlyEquivalent } from '../lib/finance';
import { money, monthIso, todayIso } from '../lib/utils';
import type { Account, Budget, Category, RecurringExpense } from '../types';

export function BudgetPage(){
  const [month,setMonth]=useState(monthIso());
  const [budgets,setBudgets]=useState<Budget[]>([]);
  const [recurring,setRecurring]=useState<RecurringExpense[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [budgetOpen,setBudgetOpen]=useState(false);
  const [recOpen,setRecOpen]=useState(false);
  const [bform,setBform]=useState({category_id:'',target:0});
  const [rform,setRform]=useState({name:'',amount:0,frequency:'Monthly',category_id:'',next_date:todayIso(),account_id:'',notes:''});
  const load=useCallback(async()=>{const [b,r,c,a]=await Promise.all([repo.budgets(month),repo.recurring(),repo.categories('expense'),repo.accounts()]);setBudgets(b);setRecurring(r);setCategories(c);setAccounts(a);},[month]);
  useEffect(()=>{load();},[load]);
  const totalTarget=useMemo(()=>budgets.reduce((s,b)=>s+Number(b.target||0),0),[budgets]);
  const totalActual=useMemo(()=>budgets.reduce((s,b)=>s+Number(b.actual||0),0),[budgets]);
  const monthlyRecurring=useMemo(()=>recurring.filter(r=>r.active).reduce((s,r)=>s+recurringMonthlyEquivalent(Number(r.amount),r.frequency),0),[recurring]);
  const saveBudget=async()=>{if(!bform.category_id)return;await execute(`INSERT INTO budgets(month,category_id,target) VALUES($1,$2,$3) ON CONFLICT(month,category_id) DO UPDATE SET target=excluded.target`,[month,Number(bform.category_id),bform.target]);setBudgetOpen(false);setBform({category_id:'',target:0});await load();};
  const saveRecurring=async()=>{if(!rform.name||!rform.amount)return;await execute(`INSERT INTO recurring_expenses(name,amount,frequency,category_id,next_date,account_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7)`,[rform.name,rform.amount,rform.frequency,rform.category_id?Number(rform.category_id):null,rform.next_date||null,rform.account_id?Number(rform.account_id):null,rform.notes||null]);setRecOpen(false);await load();};
  const removeBudget=async(id:number)=>{await execute('DELETE FROM budgets WHERE id=$1',[id]);await load();};
  const removeRecurring=async(id:number)=>{await execute('DELETE FROM recurring_expenses WHERE id=$1',[id]);await load();};

  return <>
    <PageHeader title="Budget" subtitle="Set category targets, track actual spending and keep subscriptions or renewals visible." actions={<><input className="input" style={{width:135}} type="month" value={month} onChange={e=>setMonth(e.target.value)}/><button className="btn" onClick={()=>setRecOpen(true)}><Plus size={14}/>Recurring</button><button className="btn primary" onClick={()=>setBudgetOpen(true)}><Plus size={14}/>Budget target</button></>}/>
    <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}><div className="kpi-card"><div className="kpi-top"><span>Monthly target</span></div><div className="kpi-value">{money(totalTarget)}</div></div><div className="kpi-card"><div className="kpi-top"><span>Actual in budgeted categories</span></div><div className="kpi-value">{money(totalActual)}</div></div><div className="kpi-card"><div className="kpi-top"><span>Recurring monthly equivalent</span></div><div className="kpi-value">{money(monthlyRecurring)}</div></div></div>
    <div className="grid two">
      <Card title={`Budget · ${month}`} subtitle="Actuals are calculated from expense transactions.">{!budgets.length?<EmptyState title="No targets for this month" description="Set category budgets to see real-time utilisation."/>:<div>{budgets.map(b=>{const pct=b.target>0?(Number(b.actual||0)/b.target*100):0;return <div className="list-row" key={b.id}><div style={{flex:1}}><div style={{display:'flex',justifyContent:'space-between',gap:12,marginBottom:7}}><strong>{b.category_name}</strong><span className="mini">{money(Number(b.actual||0))} / {money(b.target)} · {Math.round(pct)}%</span></div><div className="progress"><span className={pct>100?'over':''} style={{width:`${Math.min(100,pct)}%`}}/></div></div><button className="icon-button" onClick={()=>removeBudget(b.id)}><Trash2 size={14}/></button></div>})}</div>}</Card>
      <Card title="Recurring expenses" subtitle="Monthly equivalent normalises weekly, quarterly and yearly charges.">{!recurring.length?<EmptyState title="No recurring expenses" description="Add subscriptions, insurance renewals and other predictable costs."/>:<div>{recurring.map(r=><div className="list-row" key={r.id}><div><strong>{r.name}</strong><p>{r.category_name||'Uncategorised'} · {r.frequency}{r.next_date?` · next ${r.next_date}`:''}</p></div><div style={{display:'flex',alignItems:'center',gap:8}}><strong>{money(recurringMonthlyEquivalent(r.amount,r.frequency), 'EUR', 2)}/mo</strong><button className="icon-button" onClick={()=>removeRecurring(r.id)}><Trash2 size={14}/></button></div></div>)}</div>}</Card>
    </div>
    <Modal open={budgetOpen} title="Set budget target" subtitle={`For ${month}`} onClose={()=>setBudgetOpen(false)}><div className="form-grid"><Field label="Expense category"><select className="select" value={bform.category_id} onChange={e=>setBform({...bform,category_id:e.target.value})}><option value="">Select…</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Monthly target"><input className="input" type="number" min="0" step="1" value={bform.target} onChange={e=>setBform({...bform,target:Number(e.target.value)})}/></Field></div><div className="form-actions"><button className="btn" onClick={()=>setBudgetOpen(false)}>Cancel</button><button className="btn primary" onClick={saveBudget}>Save target</button></div></Modal>
    <Modal open={recOpen} title="Add recurring expense" onClose={()=>setRecOpen(false)}><div className="form-grid"><Field label="Name"><input className="input" value={rform.name} onChange={e=>setRform({...rform,name:e.target.value})}/></Field><Field label="Amount per charge"><input className="input" type="number" value={rform.amount} onChange={e=>setRform({...rform,amount:Number(e.target.value)})}/></Field><Field label="Frequency"><select className="select" value={rform.frequency} onChange={e=>setRform({...rform,frequency:e.target.value})}><option>Monthly</option><option>Weekly</option><option>Quarterly</option><option>Yearly</option></select></Field><Field label="Next / renewal date"><input className="input" type="date" value={rform.next_date} onChange={e=>setRform({...rform,next_date:e.target.value})}/></Field><Field label="Category"><select className="select" value={rform.category_id} onChange={e=>setRform({...rform,category_id:e.target.value})}><option value="">Uncategorised</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Account"><select className="select" value={rform.account_id} onChange={e=>setRform({...rform,account_id:e.target.value})}><option value="">No account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></Field><div className="full"><Field label="Notes"><textarea className="textarea" value={rform.notes} onChange={e=>setRform({...rform,notes:e.target.value})}/></Field></div></div><div className="form-actions"><button className="btn" onClick={()=>setRecOpen(false)}>Cancel</button><button className="btn primary" onClick={saveRecurring}>Add recurring expense</button></div></Modal>
  </>;
}
