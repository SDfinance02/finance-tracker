import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { CheckCircle2, DatabaseBackup, Download, HardDrive, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Card, EmptyState, Field, PageHeader } from '../components/Common';
import { Modal } from '../components/Modal';
import { execute, exportAllData, repo } from '../lib/db';
import { downloadText } from '../lib/utils';
import { checkForUpdate, getStorageInfo, installAvailableUpdate, saveUpdaterConfig, type StorageInfo, type UpdateStatus } from '../lib/updater';
import type { Category } from '../types';

export function SettingsPage(){
  const [categories,setCategories]=useState<Category[]>([]);
  const [currency,setCurrency]=useState('EUR');
  const [open,setOpen]=useState(false);
  const [status,setStatus]=useState('');
  const [locations,setLocations]=useState<string[]>([]);
  const [storage,setStorage]=useState<StorageInfo|null>(null);
  const [schemaVersion,setSchemaVersion]=useState(0);
  const [update,setUpdate]=useState<UpdateStatus|null>(null);
  const [checking,setChecking]=useState(false);
  const [installing,setInstalling]=useState(false);
  const [updaterOpen,setUpdaterOpen]=useState(false);
  const [updaterForm,setUpdaterForm]=useState({endpoint:'',pubkey:''});
  const [form,setForm]=useState({name:'',type:'expense' as 'income'|'expense',color:'#6b7b93'});

  const load=useCallback(async()=>{
    setCategories(await repo.categories());
    setCurrency(await repo.setting('base_currency','EUR'));
    setSchemaVersion(await repo.schemaVersion());
    try{setLocations(await invoke<string[]>('database_locations'));}catch{}
    try{setStorage(await getStorageInfo());}catch{}
  },[]);
  useEffect(()=>{load()},[load]);

  const saveCurrency=async()=>{
    await repo.setSetting('base_currency',currency.toUpperCase());
    setStatus('Base currency saved. Currency conversion is not automatic yet; keep assets in their recorded currencies until FX support is added.');
  };
  const addCategory=async()=>{
    if(!form.name)return;
    await execute('INSERT OR IGNORE INTO categories(name,type,color,is_system) VALUES($1,$2,$3,0)',[form.name,form.type,form.color]);
    setOpen(false); await load();
  };
  const remove=async(c:Category)=>{
    if(c.is_system){setStatus('System categories are protected. Add your own category instead.');return;}
    await execute('DELETE FROM categories WHERE id=$1',[c.id]); await load();
  };
  const backup=async()=>{
    try{const path=await invoke<string>('create_database_backup');setStatus(`SQLite backup created: ${path}`);}catch(e){setStatus(`Backup failed: ${String(e)}`)}
  };
  const exportJson=async()=>{
    const data=await exportAllData();
    downloadText(`finance-v2-export-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:2,exportedAt:new Date().toISOString(),data},null,2));
    setStatus('Full JSON export prepared. Your SQLite database remains unchanged.');
  };
  const checkUpdates=async()=>{
    setChecking(true); setStatus('');
    try{
      const result=await checkForUpdate(); setUpdate(result);
      if(result.error)setStatus(result.error);
      else if(!result.configured)setStatus('The in-app updater is installed, but this development build is not linked to a release channel yet. Configure the GitHub release channel once; after that future versions can install themselves.');
      else if(result.available)setStatus(`Finance Tracker ${result.version} is available.`);
      else setStatus(`Finance Tracker ${result.currentVersion} is up to date.`);
    }catch(e){setStatus(`Update check failed: ${String(e)}`)}finally{setChecking(false)}
  };
  const installUpdate=async()=>{
    setInstalling(true); setStatus('Downloading and installing the update. Finance Tracker will restart automatically…');
    try{await installAvailableUpdate();}catch(e){setStatus(`Update installation failed: ${String(e)}`);setInstalling(false)}
  };
  const configureUpdater=async()=>{
    try{
      await saveUpdaterConfig(updaterForm.endpoint,updaterForm.pubkey);
      setUpdaterOpen(false);
      setStatus('Signed release channel saved. Future updates can now be checked from inside Finance Tracker.');
      const result=await checkForUpdate(); setUpdate(result);
    }catch(e){setStatus(`Could not save release channel: ${String(e)}`)}
  };

  return <>
    <PageHeader title="Settings & backup" subtitle="Updates, local storage and portability are managed here. Your financial database is kept outside the app bundle."/>
    {status&&<div className="notice info" style={{marginBottom:14,wordBreak:'break-word'}}>{status}</div>}

    <div className="grid two" style={{marginBottom:16}}>
      <Card title="App updates" subtitle="V2.1 introduces the signed update foundation so future releases can install without replacing your database.">
        <div className="settings-update-row">
          <div className="settings-update-icon"><RefreshCw size={20}/></div>
          <div style={{flex:1}}>
            <div className="strong">Finance Tracker {storage?.appVersion ? `v${storage.appVersion}` : ''}</div>
            <div className="mini" style={{marginTop:4}}>{update?.configured ? 'Signed release channel configured' : 'Release channel ready to configure'}</div>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
            {(!update || !update.configured) && <button className="btn" onClick={()=>setUpdaterOpen(true)}>Configure channel</button>}
            {update?.available ? <button className="btn primary" disabled={installing} onClick={installUpdate}><Download size={15}/>{installing?'Installing…':`Install v${update.version}`}</button> : <button className="btn" disabled={checking} onClick={checkUpdates}><RefreshCw size={15}/>{checking?'Checking…':'Check for updates'}</button>}
          </div>
        </div>
        {update?.configured && !update.available && !update.error && <div className="update-ok"><CheckCircle2 size={15}/>You are on the latest published version.</div>}
        {update?.notes&&<div className="notice" style={{marginTop:12,whiteSpace:'pre-wrap'}}>{update.notes}</div>}
      </Card>

      <Card title="Local data vault" subtitle="The app bundle can be replaced or updated without replacing this folder.">
        <div className="storage-summary"><HardDrive size={18}/><div><div className="strong">Persistent SQLite storage</div><div className="mini">Schema v{schemaVersion || '—'} · {storage?.databaseExists?'database detected':'new database'}</div></div></div>
        {storage&&<div className="path-stack">
          <div><span>Database</span><code>{storage.databasePath}</code></div>
          <div><span>Backups</span><code>{storage.backupsDir}</code></div>
          <div><span>Documents</span><code>{storage.documentsDir}</code></div>
        </div>}
      </Card>
    </div>

    <div className="grid two" style={{marginBottom:16}}>
      <Card title="General"><div className="form-grid"><Field label="Base currency"><input className="input" value={currency} maxLength={3} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></Field><div className="field"><span className="field-label">Save</span><button className="btn" onClick={saveCurrency}>Save currency</button></div></div><div style={{height:14}}/><div className="notice">V2 currently assumes the main dashboard can display recorded values together. For a multi-currency portfolio, use EUR-denominated values until the FX conversion module is added.</div></Card>
      <Card title="Backups & portability"><div className="grid two"><button className="btn primary" onClick={backup}><DatabaseBackup size={15}/>Create SQLite backup</button><button className="btn" onClick={exportJson}><Download size={15}/>Export all data JSON</button></div><div style={{height:12}}/><div className="mini"><ShieldCheck size={13} style={{verticalAlign:'-2px',marginRight:5}}/>A pre-upgrade backup is also created automatically once per app version before database migrations run.</div>{locations.map(x=><div className="mini" style={{marginTop:4,wordBreak:'break-all'}} key={x}>{x}</div>)}</Card>
    </div>

    <Card title="Categories" subtitle="The review inbox learns merchant rules separately; categories are the clean reporting layer." actions={<button className="btn" onClick={()=>setOpen(true)}><Plus size={14}/>Category</button>}>
      {!categories.length?<EmptyState title="No categories"/>:<div className="table-shell"><table><thead><tr><th>Name</th><th>Type</th><th>Source</th><th></th></tr></thead><tbody>{categories.map(c=><tr key={c.id}><td><span className="legend-dot" style={{background:c.color,display:'inline-block',marginRight:8}}/>{c.name}</td><td><Badge tone={c.type==='income'?'green':'blue'}>{c.type}</Badge></td><td>{c.is_system?<Badge>System</Badge>:<Badge tone="purple">Custom</Badge>}</td><td className="numeric"><button className="icon-button" disabled={!!c.is_system} onClick={()=>remove(c)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
    </Card>
    <Modal open={updaterOpen} title="Configure signed release channel" subtitle="One-time setup. Store only the public updater key here; never paste the private signing key into Finance Tracker." onClose={()=>setUpdaterOpen(false)} width={650}>
      <div className="form-grid one">
        <Field label="HTTPS update endpoint"><input className="input" value={updaterForm.endpoint} onChange={e=>setUpdaterForm({...updaterForm,endpoint:e.target.value})} placeholder="https://github.com/OWNER/REPO/releases/latest/download/latest.json"/></Field>
        <Field label="Tauri updater public key"><textarea className="textarea" rows={5} value={updaterForm.pubkey} onChange={e=>setUpdaterForm({...updaterForm,pubkey:e.target.value})} placeholder="Paste the contents of your .pub key file"/></Field>
      </div>
      <div className="notice" style={{marginTop:12}}>The private signing key must stay outside the app and belongs in your release pipeline secret store only.</div>
      <div className="form-actions"><button className="btn" onClick={()=>setUpdaterOpen(false)}>Cancel</button><button className="btn primary" onClick={configureUpdater}>Save release channel</button></div>
    </Modal>
    <Modal open={open} title="Add category" onClose={()=>setOpen(false)}><div className="form-grid"><Field label="Name"><input className="input" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></Field><Field label="Type"><select className="select" value={form.type} onChange={e=>setForm({...form,type:e.target.value as 'income'|'expense'})}><option value="expense">Expense</option><option value="income">Income</option></select></Field><Field label="Colour"><input className="input" type="color" value={form.color} onChange={e=>setForm({...form,color:e.target.value})}/></Field></div><div className="form-actions"><button className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn primary" onClick={addCategory}>Add category</button></div></Modal>
  </>;
}
