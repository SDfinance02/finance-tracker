import { useCallback, useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, BriefcaseBusiness, Landmark, RefreshCw, WalletCards } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '../components/Common';
import { KpiCard } from '../components/KpiCard';
import { execute, repo } from '../lib/db';
import { derivePositions, financeTotals, monthlyCashflow } from '../lib/finance';
import { currentBusinessProjectionContribution } from '../lib/consolidation';
import { updateMarketData } from '../lib/market';
import { money, monthIso, percent, todayIso } from '../lib/utils';
import type { Account, Debtor, Liability, Pension, Position, Property, Security, Snapshot, Transaction } from '../types';

export function Dashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [pensions, setPensions] = useState<Pension[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [debtors, setDebtors] = useState<Debtor[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [updating, setUpdating] = useState(false);
  const [status, setStatus] = useState('');
  const [businessEquity,setBusinessEquity]=useState(0);

  const load = useCallback(async () => {
    const [a, s, t, p, pe, l, d, tx, sn, business] = await Promise.all([
      repo.accounts(), repo.securities(), repo.trades(), repo.properties(), repo.pensions(), repo.liabilities(), repo.debtors(), repo.transactions(), repo.snapshots(), currentBusinessProjectionContribution('personal'),
    ]);
    setBusinessEquity(business.equity); setAccounts(a); setSecurities(s); setPositions(derivePositions(s, t)); setProperties(p); setPensions(pe); setLiabilities(l); setDebtors(d); setTransactions(tx); setSnapshots(sn);
  }, []);
  useEffect(() => { load(); }, [load]);

  const totals = useMemo(() => financeTotals(accounts, positions, properties, pensions, debtors, liabilities), [accounts, positions, properties, pensions, debtors, liabilities]);
  const cashflow = useMemo(() => monthlyCashflow(transactions, monthIso()), [transactions]);
  const ytd = useMemo(() => positions.reduce((s, p) => s + p.unrealized + p.realized, 0), [positions]);
  const allocation = useMemo(() => [
    { name: 'Cash', value: Math.max(0, totals.cash), color: 'var(--accent)' },
    { name: 'Investments', value: Math.max(0, totals.investments), color: 'var(--navy)' },
    { name: 'Real estate', value: Math.max(0, totals.realEstate), color: 'var(--green)' },
    { name: 'Pensions', value: Math.max(0, totals.pensions), color: 'var(--purple)' },
    { name: 'Receivables', value: Math.max(0, totals.debtors), color: 'var(--amber)' },
    { name: 'Business equity', value: Math.max(0, businessEquity), color: '#7c6ee6' },
  ].filter((x) => x.value > 0), [totals,businessEquity]);
  const allocationTotal = allocation.reduce((s, x) => s + x.value, 0);

  const saveSnapshot = async () => {
    await execute(`INSERT INTO snapshots(date,cash,investments,real_estate,pensions,debtors,liabilities,net_worth)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(date) DO UPDATE SET cash=excluded.cash,investments=excluded.investments,real_estate=excluded.real_estate,pensions=excluded.pensions,debtors=excluded.debtors,liabilities=excluded.liabilities,net_worth=excluded.net_worth`,
      [todayIso(), totals.cash, totals.investments, totals.realEstate, totals.pensions, totals.debtors, totals.liabilities, totals.netWorth]);
    setStatus('Snapshot saved for today.'); await load();
  };

  const refreshPrices = async () => {
    setUpdating(true); setStatus('');
    try {
      const results = await updateMarketData(securities);
      const ok = results.filter((q) => !q.error && q.price > 0).length;
      setStatus(`Updated ${ok}/${results.length} market symbols.`);
      await load();
    } catch (e) { setStatus(`Market update failed: ${String(e)}`); }
    finally { setUpdating(false); }
  };

  return <>
    <PageHeader title="Dashboard" subtitle="A private, local-first view of your complete financial position." actions={<>
      <button className="btn" onClick={refreshPrices} disabled={updating}><RefreshCw size={15} className={updating ? 'spin' : ''}/>{updating ? 'Updating…' : 'Update market data'}</button>
      <button className="btn primary" onClick={saveSnapshot}>Save snapshot</button>
    </>} />
    {status && <div className="notice info" style={{marginBottom: 14}}>{status}</div>}
    <div className="kpi-grid">
      <KpiCard label="Consolidated net worth" value={money(totals.netWorth+businessEquity)} sub={businessEquity?`Private ${money(totals.netWorth)} + owned BV equity`:'Assets minus liabilities'} icon={<Landmark size={16}/>} />
      <KpiCard label="Liquid net worth" value={money(totals.cash + totals.investments)} sub="Cash + marketable investments" icon={<WalletCards size={16}/>} />
      <KpiCard label="Portfolio value" value={money(totals.investments)} sub={`${positions.filter(p=>p.quantity>0).length} open positions`} icon={<BriefcaseBusiness size={16}/>} />
      <KpiCard label="Monthly cashflow" value={money(cashflow.savings)} sub={`${monthIso()} · ${percent(cashflow.savingsRate)} savings rate`} tone={cashflow.savings >= 0 ? 'positive':'negative'} icon={cashflow.savings >= 0 ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>} />
      <KpiCard label="Monthly expenses" value={money(cashflow.expenses)} sub={`${money(cashflow.income)} income this month`} />
      <KpiCard label="Investment P/L" value={money(ytd)} sub="Realized + unrealized (current book)" tone={ytd >= 0 ? 'positive':'negative'} />
    </div>

    <div className="grid" style={{gridTemplateColumns:'minmax(0,1.7fr) minmax(310px,.8fr)', marginBottom:16}}>
      <Card title="Private net worth evolution" subtitle="Saved personal-ledger snapshots; BV equity is shown separately in consolidated wealth.">
        {snapshots.length < 2 ? <EmptyState title="No history yet" description="Save snapshots periodically; V2 will turn them into a net-worth timeline."/> :
          <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={snapshots} margin={{left:5,right:10,top:10,bottom:0}}>
            <defs><linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.22}/><stop offset="100%" stopColor="var(--accent)" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={(v)=>`€${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false} tickLine={false}/><Tooltip formatter={(v)=>money(Number(v))}/><Area type="monotone" dataKey="net_worth" stroke="var(--accent)" strokeWidth={2} fill="url(#nwfill)"/></AreaChart></ResponsiveContainer></div>}
      </Card>
      <Card title="Asset allocation" subtitle="Current gross assets before liabilities.">
        {allocation.length === 0 ? <EmptyState title="No assets yet" description="Add accounts, investments, property or pensions."/> : <>
          <div className="chart-wrap small"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={allocation} dataKey="value" innerRadius={62} outerRadius={86} paddingAngle={2} stroke="none">{allocation.map((x)=><Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip formatter={(v)=>money(Number(v))}/></PieChart></ResponsiveContainer></div>
          <div className="asset-legend">{allocation.map((x)=><div className="asset-legend-row" key={x.name}><span className="legend-dot" style={{background:x.color}}/><span>{x.name}</span><strong>{allocationTotal ? `${(x.value/allocationTotal*100).toFixed(1)}%`:'0%'}</strong></div>)}</div>
        </>}
      </Card>
    </div>

    <div className="grid two">
      <Card title="Balance sheet">
        {[
          ['Cash', totals.cash], ['Investments', totals.investments], ['Real estate equity', totals.realEstate], ['Pensions', totals.pensions], ['Receivables', totals.debtors], ['Business equity', businessEquity], ['Liabilities', -totals.liabilities],
        ].map(([label,value])=><div className="metric-row" key={String(label)}><span>{label}</span><strong className={Number(value)<0?'money-negative':''}>{money(Number(value))}</strong></div>)}
      </Card>
      <Card title="Recent cashflow" actions={<span className="badge blue">{monthIso()}</span>}>
        {transactions.filter(t=>t.type==='expense'||t.type==='income').slice(0,6).map((t)=><div className="list-row" key={t.id}><div><strong>{t.merchant || t.description}</strong><p>{t.category_name || 'Uncategorised'} · {t.date}</p></div><strong className={t.type==='income'?'money-positive':'money-negative'}>{t.type==='income'?'+':'-'}{money(Math.abs(t.amount))}</strong></div>)}
        {!transactions.length && <EmptyState title="No transactions" description="Add them manually or import bank CSVs into the review inbox."/>}
      </Card>
    </div>
  </>;
}
