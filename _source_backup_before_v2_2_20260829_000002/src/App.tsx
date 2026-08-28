import { HashRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Accounts } from './pages/Accounts';
import { Transactions } from './pages/Transactions';
import { InboxPage } from './pages/Inbox';
import { BudgetPage } from './pages/Budget';
import { Planning } from './pages/Planning';
import { Investments } from './pages/Investments';
import { RealEstate } from './pages/RealEstate';
import { Pensions } from './pages/Pensions';
import { Analytics } from './pages/Analytics';
import { TaxPage } from './pages/Tax';
import { Connections } from './pages/Connections';
import { SettingsPage } from './pages/Settings';

export default function App() {
  return <HashRouter><AppShell><Routes>
    <Route path="/" element={<Dashboard/>}/>
    <Route path="/accounts" element={<Accounts/>}/>
    <Route path="/transactions" element={<Transactions/>}/>
    <Route path="/inbox" element={<InboxPage/>}/>
    <Route path="/budget" element={<BudgetPage/>}/>
    <Route path="/planning" element={<Planning/>}/>
    <Route path="/investments" element={<Investments/>}/>
    <Route path="/real-estate" element={<RealEstate/>}/>
    <Route path="/pensions" element={<Pensions/>}/>
    <Route path="/analytics" element={<Analytics/>}/>
    <Route path="/tax" element={<TaxPage/>}/>
    <Route path="/connections" element={<Connections/>}/>
    <Route path="/settings" element={<SettingsPage/>}/>
  </Routes></AppShell></HashRouter>;
}
