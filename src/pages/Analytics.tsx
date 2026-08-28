import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, EmptyState, PageHeader } from '../components/Common';
import { repo } from '../lib/db';
import { monthlySeries } from '../lib/finance';
import { money } from '../lib/utils';
import type { Snapshot, Transaction } from '../types';

export function Analytics(){
  const [tx,setTx]=useState<Transaction[]>([]); const [snap,setSnap]=useState<Snapshot[]>([]);
  const load=useCallback(async()=>{const [t,s]=await Promise.all([repo.transactions(5000),repo.snapshots()]);setTx(t);setSnap(s)},[]); useEffect(()=>{load()},[load]);
  const cashflow=useMemo(()=>monthlySeries(tx),[tx]);
  return <><PageHeader title="Analytics" subtitle="Historical cashflow and net-worth composition, powered entirely by your local ledger."/>
    <div className="grid two">
      <Card title="Income vs expenses" subtitle="Transfers and investment flows are excluded from living expenses.">{cashflow.length<2?<EmptyState title="Not enough cashflow history" description="Add or import transactions across at least two months."/>:<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={cashflow}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="month" tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><YAxis tickFormatter={v=>`€${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Legend/><Bar dataKey="income" fill="var(--green)" radius={[4,4,0,0]}/><Bar dataKey="expenses" fill="var(--accent)" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer></div>}</Card>
      <Card title="Savings by month">{cashflow.length<2?<EmptyState title="No savings series yet"/>:<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={cashflow}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="month" tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><YAxis tickFormatter={v=>`€${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Line type="monotone" dataKey="savings" stroke="var(--green)" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>}</Card>
    </div><div style={{height:16}}/>
    <Card title="Net worth composition" subtitle="Saved snapshots retain each major asset class.">{snap.length<2?<EmptyState title="No snapshot history" description="Save snapshots from Dashboard to create this series."/>:<div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={snap}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="date" tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><YAxis tickFormatter={v=>`€${Math.round(v/1000)}k`} tick={{fontSize:9,fill:'var(--muted)'}} axisLine={false}/><Tooltip formatter={v=>money(Number(v))}/><Legend/><Line dataKey="cash" stroke="var(--accent)" dot={false}/><Line dataKey="investments" stroke="var(--navy)" dot={false}/><Line dataKey="real_estate" stroke="var(--green)" dot={false}/><Line dataKey="pensions" stroke="var(--purple)" dot={false}/><Line dataKey="net_worth" stroke="var(--amber)" strokeWidth={2.5} dot={false}/></LineChart></ResponsiveContainer></div>}</Card>
  </>;
}
