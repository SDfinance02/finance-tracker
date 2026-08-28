import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Fingerprint, LockKeyhole, Plus, RotateCcw, ShieldCheck, Sparkles, UserRound, UsersRound, WalletCards } from 'lucide-react';
import { Modal } from './Modal';
import {
  activateProfile, authenticateBiometry, createPartnerProfile, getBiometryStatus, listProfiles, resetDemoProfile,
  setProfileSecurity, unlockWithBiometry, verifyProfilePassword,
  type BiometryStatus, type Profile,
} from '../lib/profiles';

export function ProfileGate({ onUnlocked }: { onUnlocked: (profile: Profile) => Promise<void> | void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [mode, setMode] = useState<'unlock'|'setup'|'partner'|null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [partnerName, setPartnerName] = useState('Partner');
  const [useBiometry, setUseBiometry] = useState(true);
  const [biometry, setBiometry] = useState<BiometryStatus>({isAvailable:false,type:'Unavailable'});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setProfiles(await listProfiles()); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    getBiometryStatus().then(setBiometry);
  }, []);

  const personal = useMemo(() => profiles.find(p => p.kind === 'personal'), [profiles]);
  const partner = useMemo(() => profiles.find(p => p.kind === 'partner'), [profiles]);
  const demo = useMemo(() => profiles.find(p => p.kind === 'demo'), [profiles]);

  const enter = async (profile: Profile) => {
    activateProfile(profile);
    await onUnlocked(profile);
  };

  const choose = async (profile: Profile) => {
    setStatus('');
    if (profile.kind === 'demo') { await enter(profile); return; }
    setSelected(profile);
    if (!profile.hasPassword) {
      setPassword(''); setConfirm(''); setUseBiometry(biometry.isAvailable); setMode('setup');
      return;
    }
    if (profile.biometricEnabled && biometry.isAvailable) {
      setBusy(true);
      const ok = await unlockWithBiometry(profile);
      setBusy(false);
      if (ok) { await enter(profile); return; }
    }
    setPassword(''); setMode('unlock');
  };

  const unlockPassword = async () => {
    if (!selected || !password) return;
    setBusy(true); setStatus('');
    try {
      const ok = await verifyProfilePassword(selected.id, password);
      if (!ok) { setStatus('Incorrect password.'); return; }
      setMode(null); await enter(selected);
    } catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };

  const setupSecurity = async () => {
    if (!selected) return;
    if (password.length < 10) { setStatus('Use at least 10 characters for the profile password.'); return; }
    if (password !== confirm) { setStatus('Passwords do not match.'); return; }
    setBusy(true); setStatus('');
    try {
      const enableBiometry = !!(useBiometry && biometry.isAvailable);
      if (enableBiometry) {
        const ok = await authenticateBiometry(`Enable ${biometry.type} for ${selected.name}`);
        if (!ok) { setStatus(`${biometry.type} setup was cancelled or failed. You can disable it and continue with password only.`); return; }
      }
      const secured = await setProfileSecurity(selected.id, password, enableBiometry);
      setMode(null); await enter(secured);
    } catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };

  const createPartner = async () => {
    if (!partnerName.trim()) { setStatus('Enter a profile name.'); return; }
    if (password.length < 10) { setStatus('Use at least 10 characters for the profile password.'); return; }
    if (password !== confirm) { setStatus('Passwords do not match.'); return; }
    setBusy(true); setStatus('');
    try {
      const enableBiometry = !!(useBiometry && biometry.isAvailable);
      if (enableBiometry) {
        const ok = await authenticateBiometry(`Enable ${biometry.type} for ${partnerName.trim()}`);
        if (!ok) { setStatus(`${biometry.type} setup was cancelled or failed. You can disable it and continue with password only.`); return; }
      }
      const p = await createPartnerProfile(partnerName.trim(), password, enableBiometry);
      setMode(null); await enter(p);
    } catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };

  const resetDemo = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!confirmDialog('Reset the demo profile to the original fictional data?')) return;
    setBusy(true);
    try { await resetDemoProfile(); await load(); setStatus('Demo profile reset.'); }
    catch (error) { setStatus(String(error)); }
    finally { setBusy(false); }
  };

  const confirmDialog = (message: string) => window.confirm(message);

  if (loading) return <div className="profile-gate"><div className="profile-loading">Loading Finance Tracker…</div></div>;

  const securityFields = <>
    <label className="profile-field"><span>Password</span><input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&mode==='unlock')unlockPassword();}} placeholder="••••••••••••"/></label>
    {mode !== 'unlock' && <label className="profile-field"><span>Confirm password</span><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="••••••••••••"/></label>}
    {mode !== 'unlock' && <label className={`biometry-choice ${!biometry.isAvailable?'disabled':''}`}>
      <input type="checkbox" checked={useBiometry && biometry.isAvailable} disabled={!biometry.isAvailable} onChange={e=>setUseBiometry(e.target.checked)}/>
      <Fingerprint size={18}/><div><strong>Use {biometry.type === 'Unavailable' ? 'Touch ID' : biometry.type}</strong><span>{biometry.isAvailable?'Fast unlock on this Mac. Password always remains available.':'Touch ID is not available or not enrolled on this Mac.'}</span></div>
    </label>}
    {status && <div className="profile-error">{status}</div>}
  </>;

  return <div className="profile-gate">
    <div className="profile-gate-top"><div className="profile-gate-brand"><div className="profile-gate-logo"><WalletCards size={22}/></div><div><strong>Finance Tracker</strong><span>Private · local-first</span></div></div><div className="profile-security-badge"><ShieldCheck size={14}/>Local profiles</div></div>
    <div className="profile-gate-center">
      <div className="profile-intro"><span className="eyebrow">WELCOME BACK</span><h1>Choose a profile</h1><p>Your personal and partner finances stay separated. Demo data is fictional and safe to show.</p></div>
      <div className="profile-grid">
        {personal && <button className="profile-card personal" disabled={busy} onClick={()=>choose(personal)}><div className="profile-avatar"><UserRound size={28}/></div><div className="profile-copy"><strong>{personal.name}</strong><span>Personal finances</span></div><div className="profile-card-meta"><LockKeyhole size={14}/>{personal.hasPassword?'Protected':'Set up security'}</div></button>}
        {partner ? <button className="profile-card partner" disabled={busy} onClick={()=>choose(partner)}><div className="profile-avatar"><UsersRound size={28}/></div><div className="profile-copy"><strong>{partner.name}</strong><span>Partner profile</span></div><div className="profile-card-meta"><LockKeyhole size={14}/>Protected</div></button>
        : <button className="profile-card add-profile" disabled={busy} onClick={()=>{setPassword('');setConfirm('');setPartnerName('Partner');setUseBiometry(biometry.isAvailable);setStatus('');setMode('partner')}}><div className="profile-avatar"><Plus size={27}/></div><div className="profile-copy"><strong>Add partner</strong><span>Create a separate protected ledger</span></div><div className="profile-card-meta">Optional</div></button>}
        {demo && <div className={`profile-card demo ${busy?'disabled':''}`} role="button" tabIndex={0} onClick={()=>{if(!busy)choose(demo)}} onKeyDown={e=>{if((e.key==='Enter'||e.key===' ')&&!busy)choose(demo)}}><div className="profile-avatar"><Sparkles size={28}/></div><div className="profile-copy"><strong>Demo</strong><span>Fictional showcase portfolio</span></div><div className="profile-card-meta demo-meta"><span>Safe to present</span><button type="button" className="profile-reset" onClick={resetDemo} title="Reset demo"><RotateCcw size={13}/></button></div></div>}
      </div>
      <div className="profile-footnote"><ShieldCheck size={14}/><span>Finance Tracker does not send your financial database to a server. Touch ID is handled by macOS.</span></div>
    </div>

    <Modal open={mode==='unlock'} title={`Unlock ${selected?.name ?? 'profile'}`} subtitle="Use your Finance Tracker profile password." onClose={()=>{setMode(null);setStatus('')}} width={440}>
      <div className="profile-auth-stack">{securityFields}
        {selected?.biometricEnabled && biometry.isAvailable && <button className="btn profile-touchid" disabled={busy} onClick={async()=>{if(!selected)return;setBusy(true);const ok=await unlockWithBiometry(selected);setBusy(false);if(ok){setMode(null);await enter(selected)}}}><Fingerprint size={17}/>Try Touch ID again</button>}
        <button className="btn primary" disabled={busy||!password} onClick={unlockPassword}>{busy?'Unlocking…':'Unlock with password'}</button>
      </div>
    </Modal>

    <Modal open={mode==='setup'} title={`Secure ${selected?.name ?? 'profile'}`} subtitle="Your existing V2.1 data will remain in this personal profile." onClose={()=>{setMode(null);setStatus('')}} width={500}>
      <div className="profile-auth-stack">{securityFields}<div className="notice">The password is stored only as a strong Argon2id hash. Finance Tracker never stores the plaintext password.</div><button className="btn primary" disabled={busy} onClick={setupSecurity}>{busy?'Securing…':'Secure & open profile'}</button></div>
    </Modal>

    <Modal open={mode==='partner'} title="Create partner profile" subtitle="A separate SQLite ledger is created; no personal transactions are copied." onClose={()=>{setMode(null);setStatus('')}} width={500}>
      <div className="profile-auth-stack"><label className="profile-field"><span>Profile name</span><input autoFocus value={partnerName} onChange={e=>setPartnerName(e.target.value)} placeholder="Partner"/></label>{securityFields}<button className="btn primary" disabled={busy} onClick={createPartner}>{busy?'Creating…':'Create partner profile'}</button></div>
    </Modal>
  </div>;
}
