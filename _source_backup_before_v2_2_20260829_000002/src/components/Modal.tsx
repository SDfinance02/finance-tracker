import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, title, subtitle, onClose, children, width = 620 }: {
  open: boolean; title: string; subtitle?: string; onClose: () => void; children: ReactNode; width?: number;
}) {
  if (!open) return null;
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <div className="modal-panel" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="modal-head">
        <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}
