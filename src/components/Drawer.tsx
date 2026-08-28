import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Drawer({ open, title, subtitle, onClose, children }: { open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="drawer-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="drawer-head">
        <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-button" onClick={onClose}><X size={18}/></button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  </div>;
}
