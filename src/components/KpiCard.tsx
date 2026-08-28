import type { ReactNode } from 'react';

export function KpiCard({ label, value, sub, icon, tone = 'neutral' }: { label: string; value: string; sub?: ReactNode; icon?: ReactNode; tone?: 'neutral'|'positive'|'negative' }) {
  return <div className="kpi-card">
    <div className="kpi-top"><span>{label}</span>{icon && <span className="kpi-icon">{icon}</span>}</div>
    <div className={`kpi-value ${tone}`}>{value}</div>
    {sub && <div className="kpi-sub">{sub}</div>}
  </div>;
}
