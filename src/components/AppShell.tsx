import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Landmark, ReceiptText, Inbox, PiggyBank, LineChart, Building2, ShieldCheck, UsersRound,
  BarChart3, Calculator, PlugZap, Settings, Search, Moon, Sun, RefreshCw, WalletCards, Target, DownloadCloud, Umbrella,
  LockKeyhole, UserRound, Sparkles, Rocket, Dices, BriefcaseBusiness, Layers3,
} from 'lucide-react';
import { Modal } from './Modal';
import { repo } from '../lib/db';
import { checkForUpdate } from '../lib/updater';
import { useProfileSession } from './ProfileSession';

const nav = [
  ['Dashboard', '/', LayoutDashboard],
  ['Household', '/household', UsersRound],
  ['Future', '/future', Rocket],
  ['Decision Lab', '/decision-lab', Dices],
  ['My BV', '/business', BriefcaseBusiness],
  ['Consolidated wealth', '/consolidation', Layers3],
  ['Accounts', '/accounts', WalletCards],
  ['Transactions', '/transactions', ReceiptText],
  ['Inbox', '/inbox', Inbox],
  ['Budget', '/budget', PiggyBank],
  ['Planning', '/planning', Target],
  ['Investments', '/investments', LineChart],
  ['Real estate', '/real-estate', Building2],
  ['Pensions & debt', '/pensions', ShieldCheck],
  ['Protection', '/protection', Umbrella],
  ['Analytics', '/analytics', BarChart3],
  ['CGT planner', '/tax', Calculator],
  ['Connections', '/connections', PlugZap],
  ['Settings', '/settings', Settings],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { profile, lock } = useProfileSession();
  const [dark, setDark] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [version, setVersion] = useState('2.8.0');
  const [updateVersion, setUpdateVersion] = useState<string|null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    repo.setting('theme', 'light').then((theme) => {
      const isDark = theme === 'dark'; setDark(isDark); document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    });
  }, []);

  useEffect(() => {
    const key='finance-last-update-check';
    const last=Number(localStorage.getItem(key)||0);
    if(Date.now()-last < 12*60*60*1000) return;
    const timer=window.setTimeout(()=>{
      checkForUpdate().then(result=>{
        localStorage.setItem(key,String(Date.now()));
        if(result.configured&&result.available&&result.version)setUpdateVersion(result.version);
      }).catch(()=>{});
    },1800);
    return()=>window.clearTimeout(timer);
  },[]);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCommandOpen(true); }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    if (profile.kind === 'demo') return;
    let timer = window.setTimeout(lock, 15 * 60 * 1000);
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(lock, 15 * 60 * 1000); };
    const events = ['pointerdown','keydown','scroll'] as const;
    events.forEach(event => window.addEventListener(event, reset, {passive:true}));
    return () => { window.clearTimeout(timer); events.forEach(event => window.removeEventListener(event, reset)); };
  }, [profile.kind, lock]);

  const toggleTheme = async () => {
    const next = !dark; setDark(next); document.documentElement.dataset.theme = next ? 'dark' : 'light';
    await repo.setSetting('theme', next ? 'dark' : 'light');
  };

  const matches = useMemo(() => nav.filter(([label]) => label.toLowerCase().includes(query.toLowerCase())), [query]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Landmark size={19}/></div><div><strong>Finance</strong><span>{profile.kind === 'demo' ? 'Demo ledger' : 'Private ledger'}</span></div></div>
      <nav>{nav.map(([label, path, Icon]) => <NavLink key={path} to={path} end={path === '/'} className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
      <div className="sidebar-footer"><span className="status-dot"/> Local SQLite · v{version}</div>
    </aside>
    <div className="app-main">
      <header className="topbar">
        <button className="command-trigger" onClick={() => setCommandOpen(true)}><Search size={16}/><span>Search or jump to…</span><kbd>⌘ K</kbd></button>
        <div className="topbar-actions">{updateVersion&&<button className="update-pill" onClick={()=>navigate('/settings')}><DownloadCloud size={14}/>Update v{updateVersion}</button>}<span className="privacy-pill"><ShieldCheck size={14}/> local-first</span><button className={`profile-pill ${profile.kind}`} onClick={lock} title={profile.kind === 'demo' ? 'Leave demo profile' : 'Lock and switch profile'}>{profile.kind === 'demo' ? <Sparkles size={14}/> : <UserRound size={14}/>}<span>{profile.name}</span><LockKeyhole size={12}/></button><button className="icon-button" onClick={toggleTheme}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button></div>
      </header>
      <main className="content">{children}</main>
    </div>
    <Modal open={commandOpen} title="Quick navigation" subtitle="Jump anywhere in the app." onClose={() => setCommandOpen(false)} width={520}>
      <div className="command-box"><Search size={18}/><input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type a page name…"/></div>
      <div className="command-list">{matches.map(([label,path,Icon]) => <button key={path} onClick={() => { navigate(path); setCommandOpen(false); setQuery(''); }}><Icon size={17}/><span>{label}</span><RefreshCw size={12} className="muted-icon"/></button>)}</div>
    </Modal>
  </div>;
}
