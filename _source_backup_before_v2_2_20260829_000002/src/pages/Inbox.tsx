import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader } from '../components/Common';
import { execute, repo } from '../lib/db';
import { money } from '../lib/utils';
import type { Account, Category, InboxItem, TransactionType } from '../types';

type Draft = { categoryId: string; accountId: string; type: TransactionType; saveRule: boolean };

export function InboxPage() {
  const [items,setItems]=useState<InboxItem[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [drafts,setDrafts]=useState<Record<number,Draft>>({});
  const load=useCallback(async()=>{
    const [i,c,a]=await Promise.all([repo.inbox('new'),repo.categories(),repo.accounts()]); setItems(i);setCategories(c);setAccounts(a);
    const d:Record<number,Draft>={};
    i.forEach(x=>{const cat=c.find(k=>k.id===x.suggested_category_id);d[x.id]={categoryId:x.suggested_category_id?String(x.suggested_category_id):'',accountId:'',type:(cat?.type ?? (x.amount>=0?'income':'expense')) as TransactionType,saveRule:false};});
    setDrafts(d);
  },[]);
  useEffect(()=>{load();},[load]);

  const highConfidence=useMemo(()=>items.filter(i=>i.confidence>=.8 && i.suggested_category_id),[items]);
  const updateDraft=(id:number, patch:Partial<Draft>)=>setDrafts(prev=>({...prev,[id]:{...prev[id],...patch}}));

  const accept=async(item:InboxItem)=>{
    const d=drafts[item.id]; if(!d) return;
    const categoryId=d.categoryId?Number(d.categoryId):null;
    await execute(`INSERT OR IGNORE INTO transactions(account_id,date,description,merchant,amount,type,category_id,source,external_id,reviewed)
      VALUES($1,$2,$3,$3,$4,$5,$6,$7,$8,1)`,[d.accountId?Number(d.accountId):null,item.date,item.description,item.amount,d.type,categoryId,item.source,item.external_id]);
    if(d.saveRule && categoryId){
      const pattern=item.description.trim().slice(0,40);
      await execute(`INSERT INTO categorization_rules(pattern,match_field,category_id,transaction_type,priority,active) VALUES($1,'description',$2,$3,120,1)`,[pattern,categoryId,d.type]);
    }
    await execute(`UPDATE inbox SET status='accepted' WHERE id=$1`,[item.id]); await load();
  };
  const reject=async(id:number)=>{await execute(`UPDATE inbox SET status='ignored' WHERE id=$1`,[id]);await load();};
  const acceptHigh=async()=>{for(const item of highConfidence) await accept(item);};

  return <>
    <PageHeader title="Review inbox" subtitle="Imported bank transactions land here first. The local rule engine suggests categories; you stay in control." actions={highConfidence.length?<button className="btn primary" onClick={acceptHigh}><CheckCheck size={15}/>Accept {highConfidence.length} high-confidence</button>:undefined}/>
    <Card title="New transactions" subtitle={`${items.length} waiting for review`} actions={<Badge tone="blue"><Sparkles size={12}/>Local categorisation</Badge>}>
      {!items.length?<EmptyState title="Inbox zero" description="Import a bank CSV from Connections. Recognised transactions can then be accepted in seconds."/>:<div>
        {items.map(item=>{const d=drafts[item.id]??{categoryId:'',accountId:'',type:item.amount>=0?'income':'expense',saveRule:false};return <div className="inbox-card" key={item.id}>
          <div><strong style={{fontSize:11}}>{item.date}</strong><div className="mini">{Math.round(item.confidence*100)}% match</div></div>
          <div className="inbox-description"><strong>{item.description}</strong><span>{item.source}{item.account_hint?` · ${item.account_hint}`:''}</span></div>
          <div className={`numeric ${item.amount>=0?'money-positive':'money-negative'}`}><strong>{item.amount>=0?'+':''}{money(item.amount,'EUR',2)}</strong></div>
          <select className="select" value={d.categoryId} onChange={e=>{const cat=categories.find(c=>c.id===Number(e.target.value));updateDraft(item.id,{categoryId:e.target.value,type:(cat?.type??d.type) as TransactionType});}}><option value="">Uncategorised</option>{categories.filter(c=>c.type===d.type||d.type==='transfer'||d.type==='investment').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="select" value={d.accountId} onChange={e=>updateDraft(item.id,{accountId:e.target.value})}><option value="">No account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.institution} · {a.name}</option>)}</select>
          <div style={{display:'flex',gap:5,justifyContent:'flex-end'}}><button className="icon-button" title="Ignore" onClick={()=>reject(item.id)}><Trash2 size={14}/></button><button className="btn" title="Accept" onClick={()=>accept(item)}><Check size={14}/>Accept</button></div>
          <div style={{gridColumn:'2 / -1',display:'flex',gap:10,alignItems:'center'}}>
            <select className="select" style={{width:135}} value={d.type} onChange={e=>updateDraft(item.id,{type:e.target.value as TransactionType,categoryId:''})}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option><option value="investment">Investment</option></select>
            <label className="mini" style={{display:'flex',gap:7,alignItems:'center',cursor:'pointer'}}><input type="checkbox" checked={d.saveRule} onChange={e=>updateDraft(item.id,{saveRule:e.target.checked})}/><Plus size={12}/>Learn this merchant as a local rule</label>
          </div>
        </div>})}
      </div>}
    </Card>
  </>;
}
