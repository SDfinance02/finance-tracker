import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, CreditCard, Landmark, Plus, Trash2, WalletCards } from 'lucide-react';
import { Card, EmptyState, Field, PageHeader, Badge } from '../components/Common';
import { Modal } from '../components/Modal';
import { execute, repo } from '../lib/db';
import { money } from '../lib/utils';
import type { Account, AccountType } from '../types';

const blank = { name:'', institution:'', type:'current' as AccountType, currency:'EUR', balance:0, include_networth:1 };

export function Accounts() {
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [open,setOpen]=useState(false);
  const [edit,setEdit]=useState<Account|null>(null);
  const [form,setForm]=useState(blank);
  const load=useCallback(async()=>setAccounts(await repo.accounts()),[]);
  useEffect(()=>{load();},[load]);
  const total=useMemo(()=>accounts.filter(a=>a.include_networth).reduce((s,a)=>s+Number(a.balance||0),0),[accounts]);

  const showNew=()=>{setEdit(null);setForm(blank);setOpen(true)};
  const showEdit=(a:Account)=>{setEdit(a);setForm({name:a.name,institution:a.institution,type:a.type,currency:a.currency,balance:a.balance,include_networth:a.include_networth});setOpen(true)};
  const save=async()=>{
    if(!form.name.trim()) return;
    if(edit) await execute(`UPDATE accounts SET name=$1,institution=$2,type=$3,currency=$4,balance=$5,include_networth=$6 WHERE id=$7`,[form.name,form.institution,form.type,form.currency,form.balance,form.include_networth,edit.id]);
    else await execute(`INSERT INTO accounts(name,institution,type,currency,balance,include_networth) VALUES($1,$2,$3,$4,$5,$6)`,[form.name,form.institution,form.type,form.currency,form.balance,form.include_networth]);
    setOpen(false);await load();
  };
  const remove=async(id:number)=>{if(confirm('Delete this account? Transactions will remain but become unlinked.')){await execute('DELETE FROM accounts WHERE id=$1',[id]);await load();}};

  return <>
    <PageHeader title="Accounts" subtitle="Model each bank, savings and broker-cash account separately so transfers remain transfers—not expenses." actions={<button className="btn primary" onClick={showNew}><Plus size={15}/>Add account</button>}/>
    <div className="kpi-grid" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}>
      <div className="kpi-card"><div className="kpi-top"><span>Total cash</span><WalletCards size={16}/></div><div className="kpi-value">{money(total)}</div><div className="kpi-sub">Included in net worth</div></div>
      <div className="kpi-card"><div className="kpi-top"><span>Accounts</span><Landmark size={16}/></div><div className="kpi-value">{accounts.length}</div><div className="kpi-sub">Bank, cash and broker-cash ledgers</div></div>
      <div className="kpi-card"><div className="kpi-top"><span>Connected</span><Building2 size={16}/></div><div className="kpi-value">{accounts.filter(a=>a.sync_source).length}</div><div className="kpi-sub">API connections can be added later</div></div>
    </div>
    <Card title="Your accounts" subtitle="Click a row to edit balances or metadata.">
      {!accounts.length?<EmptyState title="No accounts yet" description="Start with your current account, savings account and broker cash balance." action={<button className="btn" onClick={showNew}>Add first account</button>}/>:<div className="table-shell"><table><thead><tr><th>Institution</th><th>Account</th><th>Type</th><th>Sync</th><th className="numeric">Balance</th><th></th></tr></thead><tbody>{accounts.map(a=><tr key={a.id} onDoubleClick={()=>showEdit(a)}><td>{a.institution||'—'}</td><td><strong>{a.name}</strong><div className="mini">{a.currency}</div></td><td><Badge tone="blue">{a.type.replace('_',' ')}</Badge></td><td>{a.sync_source?<Badge tone="green">{a.sync_source}</Badge>:<span className="muted">Manual</span>}</td><td className="numeric"><strong>{money(a.balance,a.currency,2)}</strong></td><td className="numeric"><button className="btn ghost" onClick={()=>showEdit(a)}>Edit</button><button className="icon-button" onClick={()=>remove(a.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
    </Card>
    <Modal open={open} title={edit?'Edit account':'Add account'} subtitle="Balances are manual unless a connector is active." onClose={()=>setOpen(false)}>
      <div className="form-grid">
        <Field label="Account name"><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Current account"/></Field>
        <Field label="Institution"><input className="input" value={form.institution} onChange={e=>setForm({...form,institution:e.target.value})} placeholder="BNP, Belfius, Bolero…"/></Field>
        <Field label="Type"><select className="select" value={form.type} onChange={e=>setForm({...form,type:e.target.value as AccountType})}><option value="current">Current</option><option value="savings">Savings</option><option value="cash">Cash</option><option value="broker_cash">Broker cash</option><option value="credit">Credit</option><option value="other">Other</option></select></Field>
        <Field label="Currency"><input className="input" value={form.currency} onChange={e=>setForm({...form,currency:e.target.value.toUpperCase()})}/></Field>
        <Field label="Current balance"><input className="input" type="number" step="0.01" value={form.balance} onChange={e=>setForm({...form,balance:Number(e.target.value)})}/></Field>
        <Field label="Include in net worth"><select className="select" value={form.include_networth} onChange={e=>setForm({...form,include_networth:Number(e.target.value)})}><option value={1}>Yes</option><option value={0}>No</option></select></Field>
      </div><div className="form-actions"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn primary" onClick={save}>{edit?'Save changes':'Add account'}</button></div>
    </Modal>
  </>;
}
