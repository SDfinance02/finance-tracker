import { useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProfileGate } from './components/ProfileGate';
import { ProfileSession } from './components/ProfileSession';
import { Dashboard } from './pages/Dashboard';
import { Household } from './pages/Household';
import { Future } from './pages/Future';
import { DecisionLab } from './pages/DecisionLab';
import { Accounts } from './pages/Accounts';
import { Transactions } from './pages/Transactions';
import { InboxPage } from './pages/Inbox';
import { BudgetPage } from './pages/Budget';
import { Planning } from './pages/Planning';
import { Investments } from './pages/Investments';
import { RealEstate } from './pages/RealEstate';
import { Pensions } from './pages/Pensions';
import { Protection } from './pages/Protection';
import { Analytics } from './pages/Analytics';
import { TaxPage } from './pages/Tax';
import { Connections } from './pages/Connections';
import { SettingsPage } from './pages/Settings';
import { getDb } from './lib/db';
import { getActiveProfile, type Profile } from './lib/profiles';

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(getActiveProfile());
  const [error, setError] = useState('');

  const openProfile = async (next: Profile) => {
    try {
      setError('');
      await getDb();
      setProfile(next);
    } catch (e) {
      setError(String(e));
    }
  };

  if (!profile) return <><ProfileGate onUnlocked={openProfile}/>{error&&<div className="boot-error">{error}</div>}</>;

  return <ProfileSession profile={profile}><HashRouter><AppShell><Routes>
    <Route path="/" element={<Dashboard/>}/>
    <Route path="/household" element={<Household/>}/>
    <Route path="/future" element={<Future/>}/>
    <Route path="/decision-lab" element={<DecisionLab/>}/>
    <Route path="/accounts" element={<Accounts/>}/>
    <Route path="/transactions" element={<Transactions/>}/>
    <Route path="/inbox" element={<InboxPage/>}/>
    <Route path="/budget" element={<BudgetPage/>}/>
    <Route path="/planning" element={<Planning/>}/>
    <Route path="/investments" element={<Investments/>}/>
    <Route path="/real-estate" element={<RealEstate/>}/>
    <Route path="/pensions" element={<Pensions/>}/>
    <Route path="/protection" element={<Protection/>}/>
    <Route path="/analytics" element={<Analytics/>}/>
    <Route path="/tax" element={<TaxPage/>}/>
    <Route path="/connections" element={<Connections/>}/>
    <Route path="/settings" element={<SettingsPage/>}/>
  </Routes></AppShell></HashRouter></ProfileSession>;
}
