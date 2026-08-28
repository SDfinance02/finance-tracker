import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { Drawer } from '../components/Drawer';
import { execute, repo } from '../lib/db';
import { money, monthIso, todayIso } from '../lib/utils';
import type { Account, Category, Transaction, TransactionType } from '../types';

export function Transactions() {
  const navigate = useNavigate();
  const [rows,setRows]=useState<Transaction[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [month,setMonth]=useState(monthIso());
  const [typeFilter,setTypeFilter]=useState('all');
  const [form,setForm]=useState({date:todayIso(),description:'',merchant:'',amount:0,type:'expense' as TransactionType,category_id:'',account_id:'',notes:'',direction:'out'});
  const load=useCallback(async()=>{const [t,a,c]=await Promise.all([repo.transactions(2000),repo.accounts(),repo.categories()]);setRows(t);setAccounts(a);setCategories(c);},[]);
  useEffect(()=>{load();},[load]);

  const filtered=useMemo(()=>rows.filter(r=>r.date.startsWith(month)).filter(r=>typeFilter==='all'||r.type===typeFilter).filter(r=>`${r.description} ${r.merchant||''} ${r.category_name||''} ${r.account_name||''}`.toLowerCase().includes(query.toLowerCase())),[rows,month,typeFilter,query]);
  const monthIncome=filtered.filter(r=>r.type==='income').reduce((s,r)=>s+Math.abs(r.amount),0);
  const monthExpense=filtered.filter(r=>r.type==='expense').reduce((s,r)=>s+Math.abs(r.amount),0);

  const save=async()=>{
    if(!form.description.trim()||!form.amount) return;
    let amount=Math.abs(Number(form.amount));
    if(form.type==='expense'||form.type==='investment') amount=-amount;
    if(form.type==='transfer'&&form.direction==='out') amount=-amount;
    await execute(`INSERT INTO transactions(account_id,date,description,merchant,amount,type,category_id,notes,source,reviewed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'manual',1)`,[
      form.account_id?Number(form.account_id):null,form.date,form.description,form.merchant||null,amount,form.type,form.category_id?Number(form.category_id):null,form.notes||null,
    ]);
    setOpen(false);setForm({date:todayIso(),description:'',merchant:'',amount:0,type:'expense',category_id:'',account_id:'',notes:'',direction:'out'});await load();
  };
  const remove=async(id:number)=>{if(confirm('Delete this transaction?')){await execute('DELETE FROM transactions WHERE id=$1',[id]);await load();}};
  const categoryOptions=categories.filter(c=>form.type==='income'?c.type==='income':c.type==='expense');

  return <>
    <PageHeader title="Transactions" subtitle="Your normalized ledger. Transfers and investments stay separate from living expenses." actions={<><button className="btn" onClick={()=>navigate('/connections')}><Upload size={15}/>Import</button><button className="btn primary" onClick={()=>setOpen(true)}><Plus size={15}/>Add transaction</button></>}/>
    <div className="grid two" style={{marginBottom:16}}><div className="kpi-card"><div className="kpi-top"><span>Income · {month}</span></div><div className="kpi-value positive">{money(monthIncome)}</div></div><div className="kpi-card"><div className="kpi-top"><span>Expenses · {month}</span></div><div className="kpi-value">{money(monthExpense)}</div></div></div>
    <Card title="Ledger" subtitle="Double-entry matching can be added later; transfer rows are excluded from cashflow analytics.">
      <div className="toolbar">
        <div className="search-input"><Search size={16}/><input className="input" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search merchant, description, category…"/></div>
        <input className="input" style={{width:130}} type="month" value={month} onChange={e=>setMonth(e.target.value)}/>
        <select className="select" value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option><option value="transfer">Transfer</option><option value="investment">Investment</option></select>
      </div>
      {!filtered.length?<EmptyState title="No transactions found" description="Add one manually or import a bank CSV into the review inbox."/>:<div className="table-shell"><table><thead><tr><th>Date</th><th>Merchant / description</th><th>Category</th><th>Account</th><th>Type</th><th className="numeric">Amount</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{r.date}</td><td><strong>{r.merchant||r.description}</strong>{r.merchant&&<div className="mini">{r.description}</div>}</td><td>{r.category_name||<span className="muted">Uncategorised</span>}</td><td>{r.account_name||'—'}</td><td><Badge tone={r.type==='income'?'green':r.type==='expense'?'red':r.type==='transfer'?'blue':'purple'}>{r.type}</Badge></td><td className={`numeric ${r.amount>0?'money-positive':r.type==='expense'?'money-negative':''}`}><strong>{r.amount>0?'+':''}{money(r.amount, 'EUR',2)}</strong></td><td className="numeric"><button className="icon-button" onClick={()=>remove(r.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
    </Card>
    <Drawer open={open} title="Add transaction" subtitle="Accounts remain reconciled manually; ledger entries power cashflow and budgets." onClose={()=>setOpen(false)}>
      <div className="form-grid">
        <Field label="Date"><input className="input" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></Field>
        <Field label="Type"><select className="select" value={form.type} onChange={e=>setForm({...form,type:e.target.value as TransactionType,category_id:''})}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option><option value="investment">Investment</option></select></Field>
        <Field label="Description"><input className="input" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="e.g. Weekly groceries"/></Field>
        <Field label="Merchant"><input className="input" value={form.merchant} onChange={e=>setForm({...form,merchant:e.target.value})} placeholder="Optional"/></Field>
        <Field label="Amount"><input className="input" type="number" min="0" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:Number(e.target.value)})}/></Field>
        {form.type==='transfer'&&<Field label="Direction"><select className="select" value={form.direction} onChange={e=>setForm({...form,direction:e.target.value})}><option value="out">Money out</option><option value="in">Money in</option></select></Field>}
        <Field label="Account"><select className="select" value={form.account_id} onChange={e=>setForm({...form,account_id:e.target.value})}><option value="">No account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.institution} · {a.name}</option>)}</select></Field>
        {(form.type==='expense'||form.type==='income')&&<Field label="Category"><select className="select" value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})}><option value="">Uncategorised</option>{categoryOptions.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
        <div className="full"><Field label="Notes"><textarea className="textarea" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field></div>
      </div><div className="form-actions"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn primary" onClick={save}>Add transaction</button></div>
    </Drawer>
  </>;
}
