import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Fingerprint, Home, LockKeyhole, Plus, RefreshCw, ShieldCheck, Trash2, UsersRound, WalletCards,
} from 'lucide-react';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { KpiCard } from '../components/KpiCard';
import { Modal } from '../components/Modal';
import { useProfileSession } from '../components/ProfileSession';
import {
  addSharedAsset, deleteSharedAsset, householdCashflow, householdMembers, householdSnapshots,
  saveHouseholdSnapshot, sharedAssetNet, sharedAssets, syncActiveProfile, syncAuthorizedProfile, updateSharedAsset,
} from '../lib/household';
import {
  getBiometryStatus, listProfiles, unlockWithBiometry, verifyProfilePassword, type Profile,
} from '../lib/profiles';
import { money, monthIso, percent } from '../lib/utils';
import type {
  HouseholdAssetClass, HouseholdMemberSummary, HouseholdMonthlyCashflow, HouseholdSharedAsset, HouseholdSnapshot,
} from '../types';

const assetClasses: Array<{value:HouseholdAssetClass;label:string}> = [
  {value:'cash',label:'Cash'}, {value:'investments',label:'Investments'}, {value:'real_estate',label:'Real estate'},
  {value:'pensions',label:'Pensions'}, {value:'receivables',label:'Receivables'}, {value:'other',label:'Other asset'},
  {value:'liability',label:'Liability'},
];

const emptyAsset = (partnerExists: boolean): Omit<HouseholdSharedAsset,'id'|'updated_at'> => ({
  asset_class:'cash', name:'', current_value:0, debt_value:0,
  personal_pct:partnerExists?50:100, partner_pct:partnerExists?50:0, liquid:1, notes:'',
});

function fmtSync(value?: string | null) {
  if (!value) return 'Never synced';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
}

export function Household() {
  const { profile } = useProfileSession();
  const [members,setMembers] = useState<HouseholdMemberSummary[]>([]);
  const [cashflow,setCashflow] = useState<HouseholdMonthlyCashflow[]>([]);
  const [shared,setShared] = useState<HouseholdSharedAsset[]>([]);
  const [snapshots,setSnapshots] = useState<HouseholdSnapshot[]>([]);
  const [profiles,setProfiles] = useState<Profile[]>([]);
  const [status,setStatus] = useState('');
  const [busy,setBusy] = useState(false);
  const [authProfile,setAuthProfile] = useState<Profile|null>(null);
  const [authPassword,setAuthPassword] = useState('');
  const [authError,setAuthError] = useState('');
  const [assetOpen,setAssetOpen] = useState(false);
  const [editing,setEditing] = useState<HouseholdSharedAsset|null>(null);
  const [assetForm,setAssetForm] = useState<Omit<HouseholdSharedAsset,'id'|'updated_at'>>(emptyAsset(false));

  const load = useCallback(async () => {
    const [m,c,s,sn,p] = await Promise.all([householdMembers(), householdCashflow(), sharedAssets(), householdSnapshots(), listProfiles()]);
    setMembers(m); setCashflow(c); setShared(s); setSnapshots(sn); setProfiles(p);
  },[]);

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setBusy(true);
      try {
        await syncActiveProfile(profile);
        if(!cancelled) await load();
      } catch(e) { if(!cancelled) setStatus(`Household sync warning: ${String(e)}`); }
      finally { if(!cancelled) setBusy(false); }
    })();
    return()=>{cancelled=true};
  },[profile,load]);

  const personal = members.find(m=>m.profile_kind==='personal');
  const partner = members.find(m=>m.profile_kind==='partner');
  const externalProfile = profile.kind==='demo' ? undefined : profiles.find(p=>p.kind !== profile.kind && (p.kind==='personal'||p.kind==='partner'));
  const profilePartnerExists = profile.kind==='demo' ? true : !!profiles.find(p=>p.kind==='partner');

  const sharedNet = useMemo(()=>shared.reduce((sum,a)=>sum+sharedAssetNet(a),0),[shared]);
  const sharedLiquid = useMemo(()=>shared.filter(a=>a.liquid && a.asset_class!=='liability').reduce((sum,a)=>sum+Math.max(0,sharedAssetNet(a)),0),[shared]);
  const personalNw = personal?.net_worth ?? 0;
  const partnerNw = partner?.net_worth ?? 0;
  const totalNw = personalNw + partnerNw + sharedNet;
  const personalEconomic = personalNw + shared.reduce((sum,a)=>sum+sharedAssetNet(a)*(Number(a.personal_pct)||0)/100,0);
  const partnerEconomic = partnerNw + shared.reduce((sum,a)=>sum+sharedAssetNet(a)*(Number(a.partner_pct)||0)/100,0);
  const liquid = (personal?.cash??0)+(personal?.investments??0)+(partner?.cash??0)+(partner?.investments??0)+sharedLiquid;

  const currentMonth = monthIso();
  const currentFlows = cashflow.filter(r=>r.month===currentMonth);
  const monthIncome = currentFlows.reduce((s,r)=>s+r.income,0);
  const monthExpenses = currentFlows.reduce((s,r)=>s+r.expenses,0);
  const monthSavings = monthIncome-monthExpenses;
  const savingsRate = monthIncome>0 ? monthSavings/monthIncome*100 : 0;

  const combinedCashflow = useMemo(()=>{
    const map=new Map<string,{month:string;income:number;expenses:number;savings:number}>();
    for(const r of cashflow){const row=map.get(r.month)??{month:r.month,income:0,expenses:0,savings:0};row.income+=r.income;row.expenses+=r.expenses;row.savings=row.income-row.expenses;map.set(r.month,row)}
    return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month)).slice(-12);
  },[cashflow]);

  const allocation = useMemo(()=>{
    const values:Record<string,number>={
      Cash:(personal?.cash??0)+(partner?.cash??0),
      Investments:(personal?.investments??0)+(partner?.investments??0),
      'Real estate':(personal?.real_estate??0)+(partner?.real_estate??0),
      Pensions:(personal?.pensions??0)+(partner?.pensions??0),
      Receivables:(personal?.debtors??0)+(partner?.debtors??0),
      Other:0,
    };
    for(const a of shared){
      const net=sharedAssetNet(a);
      if(net<=0) continue;
      const label=a.asset_class==='cash'?'Cash':a.asset_class==='investments'?'Investments':a.asset_class==='real_estate'?'Real estate':a.asset_class==='pensions'?'Pensions':a.asset_class==='receivables'?'Receivables':'Other';
      values[label]+=net;
    }
    const colors:Record<string,string>={Cash:'var(--accent)',Investments:'var(--navy)','Real estate':'var(--green)',Pensions:'var(--purple)',Receivables:'var(--amber)',Other:'var(--muted)'};
    return Object.entries(values).filter(([,value])=>value>0).map(([name,value])=>({name,value,color:colors[name]}));
  },[personal,partner,shared]);

  const ownershipData = [
    {name:personal?.profile_name || 'Personal',value:Math.max(0,personalEconomic),fill:'var(--accent)'},
    {name:partner?.profile_name || 'Partner',value:Math.max(0,partnerEconomic),fill:'var(--purple)'},
  ].filter(x=>x.value>0);

  const refreshSelf = async()=>{
    setBusy(true);setStatus('');
    try{await syncActiveProfile(profile);await load();setStatus(`${profile.name} household totals refreshed.`)}catch(e){setStatus(String(e))}finally{setBusy(false)}
  };

  const beginExternalSync = async()=>{
    if(!externalProfile)return;
    setBusy(true);setStatus('');
    try{
      const bio=await getBiometryStatus();
      if(externalProfile.biometricEnabled && bio.isAvailable){
        const ok=await unlockWithBiometry(externalProfile);
        if(ok){await syncAuthorizedProfile(externalProfile);await load();setStatus(`${externalProfile.name} shared totals refreshed.`);return;}
      }
      setAuthPassword('');setAuthError('');setAuthProfile(externalProfile);
    }catch(e){setStatus(String(e))}finally{setBusy(false)}
  };

  const syncWithPassword = async()=>{
    if(!authProfile||!authPassword)return;
    setBusy(true);setAuthError('');
    try{
      const ok=await verifyProfilePassword(authProfile.id,authPassword);
      if(!ok){setAuthError('Incorrect profile password.');return;}
      await syncAuthorizedProfile(authProfile);
      setAuthProfile(null);setAuthPassword('');await load();setStatus(`${authProfile.name} shared totals refreshed.`);
    }catch(e){setAuthError(String(e))}finally{setBusy(false)}
  };

  const openNewAsset=()=>{setEditing(null);setAssetForm(emptyAsset(profilePartnerExists));setAssetOpen(true)};
  const openEditAsset=(a:HouseholdSharedAsset)=>{setEditing(a);setAssetForm({asset_class:a.asset_class,name:a.name,current_value:a.current_value,debt_value:a.debt_value,personal_pct:a.personal_pct,partner_pct:a.partner_pct,liquid:a.liquid,notes:a.notes??''});setAssetOpen(true)};
  const saveAsset=async()=>{
    const totalPct=Number(assetForm.personal_pct)+Number(assetForm.partner_pct);
    if(!assetForm.name.trim()){setStatus('Give the shared asset a name.');return}
    if(Math.abs(totalPct-100)>0.01){setStatus('Personal + partner ownership must equal 100%.');return}
    setBusy(true);setStatus('');
    try{
      const normalized={...assetForm,name:assetForm.name.trim(),current_value:Number(assetForm.current_value)||0,debt_value:Number(assetForm.debt_value)||0,personal_pct:Number(assetForm.personal_pct)||0,partner_pct:Number(assetForm.partner_pct)||0,liquid:Number(assetForm.liquid)||0};
      if(editing) await updateSharedAsset(editing.id,normalized); else await addSharedAsset(normalized);
      setAssetOpen(false);setEditing(null);await load();setStatus(editing?'Shared asset updated.':'Shared asset added.');
    }catch(e){setStatus(String(e))}finally{setBusy(false)}
  };

  const removeAsset=async(a:HouseholdSharedAsset)=>{
    if(!window.confirm(`Remove ${a.name} from Household?`))return;
    await deleteSharedAsset(a.id);await load();
  };

  const saveSnapshot=async()=>{await saveHouseholdSnapshot();await load();setStatus('Household snapshot saved for today.')};

  return <>
    <PageHeader title="Household" subtitle="One consolidated view of personal, partner and genuinely shared wealth — without mixing the underlying ledgers." actions={<>
      <button className="btn" onClick={refreshSelf} disabled={busy}><RefreshCw size={15} className={busy?'spin':''}/>Refresh my data</button>
      {externalProfile&&<button className="btn" onClick={beginExternalSync} disabled={busy}><LockKeyhole size={15}/>Refresh {externalProfile.name}</button>}
      <button className="btn primary" onClick={saveSnapshot}>Save snapshot</button>
    </>}/>
    {status&&<div className="notice info" style={{marginBottom:14}}>{status}</div>}

    <div className="kpi-grid household-kpis">
      <KpiCard label="Household net worth" value={money(totalNw)} sub="Personal + partner + shared" icon={<UsersRound size={16}/>}/>
      <KpiCard label="Liquid wealth" value={money(liquid)} sub="Cash + marketable investments + shared liquid assets" icon={<WalletCards size={16}/>}/>
      <KpiCard label="Monthly savings" value={money(monthSavings)} sub={`${percent(savingsRate)} household savings rate`} tone={monthSavings>=0?'positive':'negative'}/>
      <KpiCard label={personal?.profile_name||'Personal'} value={money(personalEconomic)} sub={`${totalNw?percent(personalEconomic/totalNw*100):'0%'} economic share`} />
      <KpiCard label={partner?.profile_name||'Partner'} value={money(partnerEconomic)} sub={partner?`${totalNw?percent(partnerEconomic/totalNw*100):'0%'} economic share`:'Not linked yet'} />
      <KpiCard label="Shared net assets" value={money(sharedNet)} sub={`${shared.length} shared item${shared.length===1?'':'s'}`} icon={<Home size={16}/>}/>
    </div>

    <div className="grid" style={{gridTemplateColumns:'minmax(0,1.6fr) minmax(330px,.85fr)',marginBottom:16}}>
      <Card title="Household wealth evolution" subtitle="Saved household snapshots keep a consolidated history.">
        {snapshots.length<2?<EmptyState title="Build your household history" description="Save a snapshot periodically. Personal and partner ledgers remain separate; only consolidated totals are stored here."/>:<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={snapshots} margin={{left:5,right:10,top:10,bottom:0}}>
          <defs><linearGradient id="hhfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.22}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
          <CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={(v)=>`€${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><Tooltip formatter={(v)=>money(Number(v))}/><Area type="monotone" dataKey="total_nw" name="Household" stroke="var(--accent)" strokeWidth={2} fill="url(#hhfill)"/></AreaChart></ResponsiveContainer></div>}
      </Card>
      <Card title="Asset allocation" subtitle="Combined gross assets before standalone liabilities.">
        {allocation.length===0?<EmptyState title="No household assets yet" description="Add data to Personal/Partner or create a shared asset."/>:<>
          <div className="chart-wrap small"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={allocation} dataKey="value" innerRadius={62} outerRadius={86} paddingAngle={2} stroke="none">{allocation.map(x=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip formatter={(v)=>money(Number(v))}/></PieChart></ResponsiveContainer></div>
          <div className="asset-legend">{allocation.map(x=><div className="asset-legend-row" key={x.name}><span className="legend-dot" style={{background:x.color}}/><span>{x.name}</span><strong>{money(x.value)}</strong></div>)}</div>
        </>}
      </Card>
    </div>

    <div className="grid two" style={{marginBottom:16}}>
      <Card title="12-month household cashflow" subtitle="Only aggregated income and expenses are shared between profiles.">
        {combinedCashflow.length===0?<EmptyState title="No cashflow shared yet" description="Refresh each profile once to add its monthly aggregates."/>:<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={combinedCashflow} margin={{left:5,right:8,top:12,bottom:0}}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="month" tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={v=>`€${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Legend wrapperStyle={{fontSize:10}}/><Bar dataKey="income" name="Income" fill="var(--green)" radius={[3,3,0,0]}/><Bar dataKey="expenses" name="Expenses" fill="var(--accent)" radius={[3,3,0,0]}/></BarChart></ResponsiveContainer></div>}
      </Card>
      <Card title="Economic ownership" subtitle="Shared assets are allocated by the percentages you define.">
        {ownershipData.length===0?<EmptyState title="No ownership data yet"/>:<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={ownershipData} layout="vertical" margin={{left:10,right:20,top:20,bottom:20}}><CartesianGrid horizontal={false} stroke="var(--border)"/><XAxis type="number" tickFormatter={v=>`€${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={82} tick={{fontSize:10,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Bar dataKey="value" name="Economic wealth" radius={[0,5,5,0]}>{ownershipData.map(x=><Cell key={x.name} fill={x.fill}/>)}</Bar></BarChart></ResponsiveContainer></div>}
      </Card>
    </div>

    <div className="grid two" style={{marginBottom:16}}>
      <Card title="Household members" subtitle="The other profile must be explicitly unlocked before its aggregates are refreshed.">
        {[personal,partner].map((m,idx)=>m?<div className="household-member-row" key={m.profile_id}><div className={`household-member-icon ${idx===1?'partner':''}`}><UsersRound size={17}/></div><div className="household-member-copy"><strong>{m.profile_name}</strong><span>{m.profile_kind==='partner'?'Partner':'Personal'} · synced {fmtSync(m.synced_at)}</span></div><div className="household-member-value"><strong>{money(m.net_worth)}</strong><span>{money(m.monthly_savings)} saved this month</span></div></div>:<div className="household-member-row muted" key={idx}><div className="household-member-icon"><UsersRound size={17}/></div><div className="household-member-copy"><strong>{idx===0?'Personal':'Partner'}</strong><span>{idx===1?'Create/unlock the partner profile to include it.':'No household summary yet.'}</span></div></div>)}
        <div className="notice household-privacy"><ShieldCheck size={15}/><span>Privacy design: Household stores totals, monthly cashflow aggregates and saved net-worth snapshots. It does not copy the other profile's individual transactions, merchants or trade history.</span></div>
      </Card>
      <Card title="Current month" subtitle={currentMonth}>
        <div className="metric-row"><span>Household income</span><strong className="money-positive">{money(monthIncome)}</strong></div>
        <div className="metric-row"><span>Household expenses</span><strong className="money-negative">{money(monthExpenses)}</strong></div>
        <div className="metric-row"><span>Net savings</span><strong className={monthSavings>=0?'money-positive':'money-negative'}>{money(monthSavings)}</strong></div>
        <div className="metric-row"><span>Savings rate</span><strong>{percent(savingsRate)}</strong></div>
        <div className="metric-row"><span>Standalone liabilities</span><strong className="money-negative">{money((personal?.liabilities??0)+(partner?.liabilities??0)+shared.filter(a=>a.asset_class==='liability').reduce((s,a)=>s+Math.abs(sharedAssetNet(a)),0))}</strong></div>
      </Card>
    </div>

    <Card title="Shared assets & liabilities" subtitle="Use this for genuinely joint items that should not be duplicated in either individual ledger." actions={<button className="btn primary" onClick={openNewAsset}><Plus size={14}/>Add shared item</button>}>
      {!shared.length?<EmptyState title="No shared assets yet" description="Examples: a joint savings account, family home, shared mortgage or jointly owned investment account." action={<button className="btn" onClick={openNewAsset}><Plus size={14}/>Add first shared item</button>}/>:<div className="table-wrap"><table><thead><tr><th>Item</th><th>Class</th><th>Gross value</th><th>Debt</th><th>Net</th><th>Ownership</th><th></th></tr></thead><tbody>{shared.map(a=><tr key={a.id} onDoubleClick={()=>openEditAsset(a)}><td><strong>{a.name}</strong>{a.notes&&<div className="table-sub">{a.notes}</div>}</td><td><Badge tone={a.asset_class==='liability'?'red':a.asset_class==='real_estate'?'green':'blue'}>{assetClasses.find(x=>x.value===a.asset_class)?.label??a.asset_class}</Badge></td><td>{a.asset_class==='liability'?'—':money(a.current_value)}</td><td>{a.debt_value?money(a.debt_value):'—'}</td><td className={sharedAssetNet(a)<0?'money-negative':''}><strong>{money(sharedAssetNet(a))}</strong></td><td><span className="ownership-chip">{personal?.profile_name||'Personal'} {a.personal_pct.toFixed(0)}% · {partner?.profile_name||'Partner'} {a.partner_pct.toFixed(0)}%</span></td><td><div className="table-actions"><button className="icon-button small" onClick={()=>openEditAsset(a)}>Edit</button><button className="icon-button small danger" onClick={()=>removeAsset(a)} title="Delete"><Trash2 size={13}/></button></div></td></tr>)}</tbody></table></div>}
      <div className="notice warn" style={{marginTop:12}}>Avoid double counting: if an entire jointly owned asset is entered here, do not also enter the full value in Personal or Partner. If you keep it in an individual ledger, enter only that profile's economic share there instead.</div>
    </Card>

    <Modal open={!!authProfile} title={`Share ${authProfile?.name ?? 'profile'} with Household`} subtitle="Unlock once to refresh consolidated totals. Individual transactions are not copied." onClose={()=>{setAuthProfile(null);setAuthPassword('');setAuthError('')}} width={460}>
      <div className="profile-auth-stack"><div className="notice"><LockKeyhole size={14}/> This authorization only refreshes the household cache. It does not switch the active profile.</div><label className="profile-field"><span>{authProfile?.name} profile password</span><input autoFocus type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')syncWithPassword()}} placeholder="••••••••••••"/></label>{authError&&<div className="profile-error">{authError}</div>}<button className="btn primary" disabled={busy||!authPassword} onClick={syncWithPassword}>{busy?'Refreshing…':'Unlock & refresh totals'}</button>{authProfile?.biometricEnabled&&<button className="btn" disabled={busy} onClick={beginExternalSync}><Fingerprint size={16}/>Try Touch ID</button>}</div>
    </Modal>

    <Modal open={assetOpen} title={editing?'Edit shared item':'Add shared item'} subtitle="Shared items live in the household ledger, separate from both personal ledgers." onClose={()=>setAssetOpen(false)} width={620}>
      <div className="form-grid two">
        <Field label="Name"><input value={assetForm.name} onChange={e=>setAssetForm({...assetForm,name:e.target.value})} placeholder="Family home"/></Field>
        <Field label="Asset class"><select value={assetForm.asset_class} onChange={e=>{const cls=e.target.value as HouseholdAssetClass;setAssetForm({...assetForm,asset_class:cls,liquid:cls==='cash'||cls==='investments'?1:0})}}>{assetClasses.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></Field>
        <Field label={assetForm.asset_class==='liability'?'Liability amount':'Current/gross value'}><input type="number" min="0" step="0.01" value={assetForm.asset_class==='liability'?assetForm.debt_value:assetForm.current_value} onChange={e=>assetForm.asset_class==='liability'?setAssetForm({...assetForm,debt_value:Number(e.target.value)}):setAssetForm({...assetForm,current_value:Number(e.target.value)})}/></Field>
        {assetForm.asset_class!=='liability'&&<Field label="Associated debt"><input type="number" min="0" step="0.01" value={assetForm.debt_value} onChange={e=>setAssetForm({...assetForm,debt_value:Number(e.target.value)})}/></Field>}
        <Field label={`${personal?.profile_name||'Personal'} ownership %`}><input type="number" min="0" max="100" step="1" value={assetForm.personal_pct} onChange={e=>{const p=Number(e.target.value);setAssetForm({...assetForm,personal_pct:p,partner_pct:Math.max(0,100-p)})}}/></Field>
        <Field label={`${partner?.profile_name||'Partner'} ownership %`}><input type="number" min="0" max="100" step="1" value={assetForm.partner_pct} onChange={e=>{const p=Number(e.target.value);setAssetForm({...assetForm,partner_pct:p,personal_pct:Math.max(0,100-p)})}}/></Field>
        <Field label="Liquidity"><select value={assetForm.liquid} onChange={e=>setAssetForm({...assetForm,liquid:Number(e.target.value)})}><option value={1}>Liquid / readily available</option><option value={0}>Illiquid / long-term</option></select></Field>
        <Field label="Notes"><input value={assetForm.notes??''} onChange={e=>setAssetForm({...assetForm,notes:e.target.value})} placeholder="Optional"/></Field>
      </div>
      <div className="notice" style={{marginTop:12}}>Ownership must total 100%. Household net worth counts the shared item's full net value once; the ownership percentages are used only for the Personal vs Partner economic breakdown.</div>
      <div className="modal-actions"><button className="btn" onClick={()=>setAssetOpen(false)}>Cancel</button><button className="btn primary" disabled={busy} onClick={saveAsset}>{editing?'Save changes':'Add shared item'}</button></div>
    </Modal>
  </>;
}
