import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, CheckCircle2, FileText, Plus, RefreshCcw, ShieldCheck, Trash2, Umbrella, AlertTriangle,
} from 'lucide-react';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { KpiCard } from '../components/KpiCard';
import { Modal } from '../components/Modal';
import { execute, repo } from '../lib/db';
import { money, todayIso } from '../lib/utils';
import type { InsuranceClaim, InsurancePolicy, InsurancePremiumFrequency, InsuranceStatus } from '../types';

const policyCategories = [
  'Home', 'Family liability', 'Car', 'Hospitalisation', 'Health', 'Income protection', 'Life',
  'Legal protection', 'Travel', 'Professional liability', 'Cyber', 'Other',
] as const;

const coverageMapCategories = policyCategories.filter(x => x !== 'Other');
const frequencies: InsurancePremiumFrequency[] = ['Monthly', 'Quarterly', 'Semiannual', 'Annual', 'One-off'];
const statuses: InsuranceStatus[] = ['active', 'pending', 'expired', 'cancelled'];

const blankPolicy = (): Omit<InsurancePolicy, 'id'|'updated_at'> => ({
  name:'', category:'Home', provider:'', policy_number:'', insured_for:'Personal', status:'active',
  premium_amount:0, premium_frequency:'Annual', start_date:todayIso(), renewal_date:'', end_date:'',
  coverage_amount:0, deductible:0, beneficiary:'', broker_name:'', broker_contact:'', auto_renewal:1,
  document_ref:'', notes:'',
});

const blankClaim = (): Omit<InsuranceClaim, 'id'|'updated_at'|'policy_name'> => ({
  policy_id:null, incident_date:todayIso(), claim_reference:'', description:'', claimed_amount:0,
  reimbursed_amount:0, status:'open', notes:'',
});

function annualPremium(policy: InsurancePolicy) {
  if (policy.status !== 'active') return 0;
  const amount = Number(policy.premium_amount || 0);
  switch (policy.premium_frequency) {
    case 'Monthly': return amount * 12;
    case 'Quarterly': return amount * 4;
    case 'Semiannual': return amount * 2;
    case 'Annual': return amount;
    default: return 0;
  }
}

function daysUntil(date?: string | null) {
  if (!date) return Number.POSITIVE_INFINITY;
  const target = new Date(`${date}T12:00:00`);
  if (Number.isNaN(target.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date(); now.setHours(12,0,0,0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function niceDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'});
}

function renewalTone(days: number): 'red'|'amber'|'green'|'slate' {
  if (days < 0) return 'red';
  if (days <= 30) return 'red';
  if (days <= 90) return 'amber';
  if (days <= 365) return 'green';
  return 'slate';
}

export function Protection() {
  const [policies,setPolicies] = useState<InsurancePolicy[]>([]);
  const [claims,setClaims] = useState<InsuranceClaim[]>([]);
  const [policyOpen,setPolicyOpen] = useState(false);
  const [claimOpen,setClaimOpen] = useState(false);
  const [editing,setEditing] = useState<InsurancePolicy|null>(null);
  const [policyForm,setPolicyForm] = useState(blankPolicy());
  const [claimForm,setClaimForm] = useState(blankClaim());
  const [filter,setFilter] = useState<'all'|'active'|'renewals'>('all');
  const [busy,setBusy] = useState(false);

  const load = useCallback(async()=>{
    const [p,c] = await Promise.all([repo.insurancePolicies(), repo.insuranceClaims()]);
    setPolicies(p); setClaims(c);
  },[]);
  useEffect(()=>{load()},[load]);

  const active = useMemo(()=>policies.filter(p=>p.status==='active'),[policies]);
  const annual = useMemo(()=>active.reduce((s,p)=>s+annualPremium(p),0),[active]);
  const next90 = useMemo(()=>active.filter(p=>{const d=daysUntil(p.renewal_date);return d>=0&&d<=90}),[active]);
  const documentCoverage = active.length ? active.filter(p=>!!p.document_ref?.trim()).length / active.length * 100 : 0;
  const openClaims = useMemo(()=>claims.filter(c=>!['paid','closed','rejected'].includes(c.status.toLowerCase())),[claims]);

  const filtered = useMemo(()=>policies.filter(p=>{
    if(filter==='active') return p.status==='active';
    if(filter==='renewals'){const d=daysUntil(p.renewal_date);return p.status==='active'&&d>=0&&d<=90;}
    return true;
  }),[policies,filter]);

  const renewalList = useMemo(()=>active
    .filter(p=>Number.isFinite(daysUntil(p.renewal_date)))
    .sort((a,b)=>daysUntil(a.renewal_date)-daysUntil(b.renewal_date))
    .slice(0,6),[active]);

  const premiumByCategory = useMemo(()=>{
    const map = new Map<string,number>();
    active.forEach(p=>map.set(p.category,(map.get(p.category)||0)+annualPremium(p)));
    return [...map.entries()].map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
  },[active]);
  const maxPremium = premiumByCategory[0]?.value || 1;

  const openNewPolicy = () => { setEditing(null); setPolicyForm(blankPolicy()); setPolicyOpen(true); };
  const openEditPolicy = (p: InsurancePolicy) => {
    setEditing(p);
    setPolicyForm({
      name:p.name, category:p.category, provider:p.provider, policy_number:p.policy_number??'', insured_for:p.insured_for,
      status:p.status, premium_amount:p.premium_amount, premium_frequency:p.premium_frequency, start_date:p.start_date??'',
      renewal_date:p.renewal_date??'', end_date:p.end_date??'', coverage_amount:p.coverage_amount, deductible:p.deductible,
      beneficiary:p.beneficiary??'', broker_name:p.broker_name??'', broker_contact:p.broker_contact??'', auto_renewal:p.auto_renewal,
      document_ref:p.document_ref??'', notes:p.notes??'',
    });
    setPolicyOpen(true);
  };

  const savePolicy = async()=>{
    if(!policyForm.name.trim() || !policyForm.provider.trim()) return;
    setBusy(true);
    try {
      const values = [policyForm.name.trim(),policyForm.category,policyForm.provider.trim(),policyForm.policy_number||null,policyForm.insured_for,policyForm.status,
        policyForm.premium_amount,policyForm.premium_frequency,policyForm.start_date||null,policyForm.renewal_date||null,policyForm.end_date||null,
        policyForm.coverage_amount,policyForm.deductible,policyForm.beneficiary||null,policyForm.broker_name||null,policyForm.broker_contact||null,
        policyForm.auto_renewal,policyForm.document_ref||null,policyForm.notes||null];
      if(editing){
        await execute(`UPDATE insurance_policies SET name=$1,category=$2,provider=$3,policy_number=$4,insured_for=$5,status=$6,premium_amount=$7,premium_frequency=$8,start_date=$9,renewal_date=$10,end_date=$11,coverage_amount=$12,deductible=$13,beneficiary=$14,broker_name=$15,broker_contact=$16,auto_renewal=$17,document_ref=$18,notes=$19,updated_at=CURRENT_TIMESTAMP WHERE id=$20`,[...values,editing.id]);
      } else {
        await execute(`INSERT INTO insurance_policies(name,category,provider,policy_number,insured_for,status,premium_amount,premium_frequency,start_date,renewal_date,end_date,coverage_amount,deductible,beneficiary,broker_name,broker_contact,auto_renewal,document_ref,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,values);
      }
      setPolicyOpen(false); await load();
    } finally { setBusy(false); }
  };

  const removePolicy = async(p:InsurancePolicy)=>{
    if(!confirm(`Delete ${p.name}? Existing claims will remain in the claims log without a policy link.`)) return;
    await execute('DELETE FROM insurance_policies WHERE id=$1',[p.id]); await load();
  };

  const openNewClaim = () => {
    setClaimForm({...blankClaim(),policy_id:active[0]?.id??null}); setClaimOpen(true);
  };
  const saveClaim = async()=>{
    if(!claimForm.description.trim()) return;
    setBusy(true);
    try {
      await execute(`INSERT INTO insurance_claims(policy_id,incident_date,claim_reference,description,claimed_amount,reimbursed_amount,status,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[
        claimForm.policy_id||null,claimForm.incident_date,claimForm.claim_reference||null,claimForm.description.trim(),claimForm.claimed_amount,claimForm.reimbursed_amount,claimForm.status,claimForm.notes||null,
      ]);
      setClaimOpen(false); await load();
    } finally { setBusy(false); }
  };
  const removeClaim = async(c:InsuranceClaim)=>{if(confirm('Delete this claim record?')){await execute('DELETE FROM insurance_claims WHERE id=$1',[c.id]);await load();}};

  return <>
    <PageHeader title="Protection" subtitle="Insurance administration, renewals, premium visibility, coverage register and claims — kept in your local profile." actions={<><button className="btn" onClick={openNewClaim}><Plus size={14}/>Claim</button><button className="btn primary" onClick={openNewPolicy}><Plus size={14}/>Policy</button></>}/>

    <div className="kpi-grid protection-kpis">
      <KpiCard label="Annual recurring premiums" value={money(annual)} icon={<Umbrella size={16}/>} sub={`${active.length} active ${active.length===1?'policy':'policies'}`}/>
      <KpiCard label="Renewals next 90 days" value={String(next90.length)} icon={<CalendarClock size={16}/>} sub={next90.length?`Next: ${niceDate(next90[0]?.renewal_date)}`:'Nothing registered'}/>
      <KpiCard label="Policy documents" value={`${documentCoverage.toFixed(0)}%`} icon={<FileText size={16}/>} sub="Active policies with a document reference"/>
      <KpiCard label="Open claims" value={String(openClaims.length)} icon={<RefreshCcw size={16}/>} sub={openClaims.length?money(openClaims.reduce((s,c)=>s+Math.max(0,c.claimed_amount-c.reimbursed_amount),0))+' outstanding':'No open claims'}/>
    </div>

    <div className="grid two" style={{marginBottom:16}}>
      <Card title="Upcoming renewals" subtitle="A practical calendar based on the dates you register.">
        {!renewalList.length?<EmptyState title="No renewal dates yet" description="Add a renewal date to an active policy and it will appear here."/>:<div className="protection-renewals">{renewalList.map(p=>{const d=daysUntil(p.renewal_date);return <div className="protection-renewal-row" key={p.id}><div className="renewal-date"><strong>{niceDate(p.renewal_date)}</strong><span>{d<0?`${Math.abs(d)} days overdue`:d===0?'Today':`in ${d} days`}</span></div><div className="renewal-copy"><strong>{p.name}</strong><span>{p.provider} · {p.category}</span></div><Badge tone={renewalTone(d)}>{p.auto_renewal?'Auto-renew':'Review'}</Badge></div>})}</div>}
      </Card>
      <Card title="Annual premium allocation" subtitle="Recurring premium equivalent; one-off premiums are excluded.">
        {!premiumByCategory.length?<EmptyState title="No recurring premiums yet"/>:<div className="premium-bars">{premiumByCategory.map(x=><div className="premium-bar-row" key={x.name}><div className="premium-bar-label"><span>{x.name}</span><strong>{money(x.value)}</strong></div><div className="premium-bar-track"><span style={{width:`${Math.max(4,x.value/maxPremium*100)}%`}}/></div></div>)}</div>}
      </Card>
    </div>

    <Card title="Coverage register" subtitle="Administrative map of active policies already registered in Finance Tracker — not a recommendation about what coverage you should buy." className="coverage-card">
      <div className="coverage-map">{coverageMapCategories.map(category=>{const matches=active.filter(p=>p.category===category);return <div className={`coverage-tile ${matches.length?'registered':''}`} key={category}><div className="coverage-icon">{matches.length?<CheckCircle2 size={16}/>:<ShieldCheck size={16}/>}</div><div><strong>{category}</strong><span>{matches.length?`${matches.length} active ${matches.length===1?'policy':'policies'}`:'Not registered'}</span></div></div>})}</div>
      <div className="notice" style={{marginTop:12}}><ShieldCheck size={14}/>This is an administrative completeness view only. “Not registered” does not mean that a policy is necessary or appropriate for you.</div>
    </Card>

    <div style={{height:16}}/>
    <Card title="Policies" subtitle="Double-click a row to edit. Store a document name/path as a reference; managed document attachments will be added in a later document-vault update." actions={<div className="segmented"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All</button><button className={filter==='active'?'active':''} onClick={()=>setFilter('active')}>Active</button><button className={filter==='renewals'?'active':''} onClick={()=>setFilter('renewals')}>90-day renewals</button></div>}>
      {!filtered.length?<EmptyState title="No policies in this view" description="Add a policy or change the filter." action={<button className="btn" onClick={openNewPolicy}><Plus size={14}/>Add policy</button>}/>:<div className="table-wrap"><table><thead><tr><th>Policy</th><th>Insured</th><th>Status</th><th>Renewal</th><th className="numeric">Annual premium</th><th className="numeric">Coverage</th><th></th></tr></thead><tbody>{filtered.map(p=>{const d=daysUntil(p.renewal_date);return <tr key={p.id} onDoubleClick={()=>openEditPolicy(p)}><td><strong>{p.name}</strong><div className="table-sub">{p.provider}{p.policy_number?` · ${p.policy_number}`:''} · {p.category}{p.document_ref?<span className="doc-inline"> · <FileText size={10}/> {p.document_ref}</span>:''}</div></td><td>{p.insured_for}</td><td><Badge tone={p.status==='active'?'green':p.status==='pending'?'amber':p.status==='cancelled'?'red':'slate'}>{p.status}</Badge></td><td><div>{niceDate(p.renewal_date)}</div>{Number.isFinite(d)&&p.status==='active'&&<div className={`mini ${d<0||d<=30?'money-negative':''}`}>{d<0?`${Math.abs(d)}d overdue`:`${d}d`}</div>}</td><td className="numeric"><strong>{annualPremium(p)?money(annualPremium(p)):'—'}</strong><div className="mini">{money(p.premium_amount)} · {p.premium_frequency}</div></td><td className="numeric">{p.coverage_amount?money(p.coverage_amount):'—'}{p.deductible>0&&<div className="mini">deductible {money(p.deductible)}</div>}</td><td><div className="table-actions"><button className="icon-button small" onClick={()=>openEditPolicy(p)}>Edit</button><button className="icon-button small danger" onClick={()=>removePolicy(p)}><Trash2 size={13}/></button></div></td></tr>})}</tbody></table></div>}
    </Card>

    <div style={{height:16}}/>
    <Card title="Claims log" subtitle="Track an incident from submission to reimbursement." actions={<button className="btn" onClick={openNewClaim}><Plus size={14}/>Add claim</button>}>
      {!claims.length?<EmptyState title="No claims" description="Hopefully this stays quiet. Add a claim when you need an administrative record."/>:<div className="table-wrap"><table><thead><tr><th>Incident</th><th>Policy</th><th>Status</th><th className="numeric">Claimed</th><th className="numeric">Reimbursed</th><th></th></tr></thead><tbody>{claims.map(c=><tr key={c.id}><td><strong>{niceDate(c.incident_date)}</strong><div className="table-sub">{c.description}{c.claim_reference?` · ${c.claim_reference}`:''}</div></td><td>{c.policy_name||'Unlinked policy'}</td><td><Badge tone={c.status==='paid'||c.status==='closed'?'green':c.status==='rejected'?'red':'amber'}>{c.status}</Badge></td><td className="numeric">{money(c.claimed_amount)}</td><td className="numeric">{money(c.reimbursed_amount)}</td><td><button className="icon-button small danger" onClick={()=>removeClaim(c)}><Trash2 size={13}/></button></td></tr>)}</tbody></table></div>}
    </Card>

    <div className="notice warn protection-disclaimer"><AlertTriangle size={14}/>Finance Tracker organizes the information you enter; it does not assess whether your insurance cover is legally or financially sufficient. Verify material decisions with the insurer, broker or professional adviser.</div>

    <Modal open={policyOpen} title={editing?'Edit policy':'Add insurance policy'} subtitle="Keep contractual details and renewal dates in one place." onClose={()=>setPolicyOpen(false)} width={760}>
      <div className="form-grid two">
        <Field label="Policy name"><input value={policyForm.name} onChange={e=>setPolicyForm({...policyForm,name:e.target.value})} placeholder="Hospitalisation plan"/></Field>
        <Field label="Category"><select value={policyForm.category} onChange={e=>setPolicyForm({...policyForm,category:e.target.value})}>{policyCategories.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Provider / insurer"><input value={policyForm.provider} onChange={e=>setPolicyForm({...policyForm,provider:e.target.value})} placeholder="Insurer"/></Field>
        <Field label="Policy number"><input value={policyForm.policy_number??''} onChange={e=>setPolicyForm({...policyForm,policy_number:e.target.value})} placeholder="Optional"/></Field>
        <Field label="Insured for"><select value={policyForm.insured_for} onChange={e=>setPolicyForm({...policyForm,insured_for:e.target.value})}><option>Personal</option><option>Partner</option><option>Household</option><option>Business</option><option>Other</option></select></Field>
        <Field label="Status"><select value={policyForm.status} onChange={e=>setPolicyForm({...policyForm,status:e.target.value as InsuranceStatus})}>{statuses.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Premium amount"><input type="number" min="0" step="0.01" value={policyForm.premium_amount} onChange={e=>setPolicyForm({...policyForm,premium_amount:Number(e.target.value)})}/></Field>
        <Field label="Premium frequency"><select value={policyForm.premium_frequency} onChange={e=>setPolicyForm({...policyForm,premium_frequency:e.target.value as InsurancePremiumFrequency})}>{frequencies.map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Start date"><input type="date" value={policyForm.start_date??''} onChange={e=>setPolicyForm({...policyForm,start_date:e.target.value})}/></Field>
        <Field label="Next renewal / review"><input type="date" value={policyForm.renewal_date??''} onChange={e=>setPolicyForm({...policyForm,renewal_date:e.target.value})}/></Field>
        <Field label="End date"><input type="date" value={policyForm.end_date??''} onChange={e=>setPolicyForm({...policyForm,end_date:e.target.value})}/></Field>
        <Field label="Auto-renewal"><select value={policyForm.auto_renewal} onChange={e=>setPolicyForm({...policyForm,auto_renewal:Number(e.target.value)})}><option value={1}>Yes</option><option value={0}>No / review manually</option></select></Field>
        <Field label="Coverage / insured amount"><input type="number" min="0" step="0.01" value={policyForm.coverage_amount} onChange={e=>setPolicyForm({...policyForm,coverage_amount:Number(e.target.value)})}/></Field>
        <Field label="Deductible / franchise"><input type="number" min="0" step="0.01" value={policyForm.deductible} onChange={e=>setPolicyForm({...policyForm,deductible:Number(e.target.value)})}/></Field>
        <Field label="Beneficiary"><input value={policyForm.beneficiary??''} onChange={e=>setPolicyForm({...policyForm,beneficiary:e.target.value})} placeholder="Optional"/></Field>
        <Field label="Broker / intermediary"><input value={policyForm.broker_name??''} onChange={e=>setPolicyForm({...policyForm,broker_name:e.target.value})} placeholder="Optional"/></Field>
        <Field label="Broker contact"><input value={policyForm.broker_contact??''} onChange={e=>setPolicyForm({...policyForm,broker_contact:e.target.value})} placeholder="Email / phone"/></Field>
        <Field label="Document reference" hint="For now: filename or local/cloud reference. A managed document vault is planned."><input value={policyForm.document_ref??''} onChange={e=>setPolicyForm({...policyForm,document_ref:e.target.value})} placeholder="policy-2026.pdf"/></Field>
        <div className="full"><Field label="Notes"><textarea value={policyForm.notes??''} onChange={e=>setPolicyForm({...policyForm,notes:e.target.value})} placeholder="Special clauses, indexation, exclusions to remember…"/></Field></div>
      </div>
      <div className="modal-actions"><button className="btn" onClick={()=>setPolicyOpen(false)}>Cancel</button><button className="btn primary" disabled={busy||!policyForm.name.trim()||!policyForm.provider.trim()} onClick={savePolicy}>{editing?'Save changes':'Add policy'}</button></div>
    </Modal>

    <Modal open={claimOpen} title="Add insurance claim" subtitle="Administrative tracking only; use the insurer's official process to submit the actual claim." onClose={()=>setClaimOpen(false)} width={620}>
      <div className="form-grid two">
        <Field label="Policy"><select value={claimForm.policy_id??''} onChange={e=>setClaimForm({...claimForm,policy_id:e.target.value?Number(e.target.value):null})}><option value="">Unlinked / other policy</option>{policies.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Incident date"><input type="date" value={claimForm.incident_date} onChange={e=>setClaimForm({...claimForm,incident_date:e.target.value})}/></Field>
        <Field label="Claim reference"><input value={claimForm.claim_reference??''} onChange={e=>setClaimForm({...claimForm,claim_reference:e.target.value})} placeholder="Optional insurer reference"/></Field>
        <Field label="Status"><select value={claimForm.status} onChange={e=>setClaimForm({...claimForm,status:e.target.value})}><option value="open">Open</option><option value="submitted">Submitted</option><option value="review">Under review</option><option value="paid">Paid</option><option value="closed">Closed</option><option value="rejected">Rejected</option></select></Field>
        <Field label="Claimed amount"><input type="number" min="0" step="0.01" value={claimForm.claimed_amount} onChange={e=>setClaimForm({...claimForm,claimed_amount:Number(e.target.value)})}/></Field>
        <Field label="Reimbursed amount"><input type="number" min="0" step="0.01" value={claimForm.reimbursed_amount} onChange={e=>setClaimForm({...claimForm,reimbursed_amount:Number(e.target.value)})}/></Field>
        <div className="full"><Field label="Description"><input value={claimForm.description} onChange={e=>setClaimForm({...claimForm,description:e.target.value})} placeholder="What happened?"/></Field></div>
        <div className="full"><Field label="Notes"><textarea value={claimForm.notes??''} onChange={e=>setClaimForm({...claimForm,notes:e.target.value})}/></Field></div>
      </div>
      <div className="modal-actions"><button className="btn" onClick={()=>setClaimOpen(false)}>Cancel</button><button className="btn primary" disabled={busy||!claimForm.description.trim()} onClick={saveClaim}>Add claim</button></div>
    </Modal>
  </>;
}
