export const todayIso = () => new Date().toISOString().slice(0, 10);
export const monthIso = () => new Date().toISOString().slice(0, 7);

export function money(value: number, currency = 'EUR', digits = 0): string {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function numberFmt(value: number, digits = 2): string {
  return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
}

export function percent(value: number, digits = 1): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${numberFmt(value, digits)}%`;
}

export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function stableId(text: string, prefix = 'id'): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_${(hash >>> 0).toString(16)}`;
}

export function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  let raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const negativeByParens = raw.startsWith('(') && raw.endsWith(')');
  raw = raw.replace(/[^0-9,.-]/g, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
  } else if (lastComma >= 0) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = (raw.match(/\./g) || []).length;
    if (dots > 1) {
      const parts = raw.split('.');
      raw = `${parts.slice(0, -1).join('')}.${parts.at(-1)}`;
    }
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return negativeByParens ? -Math.abs(n) : n;
}

export function downloadText(filename: string, text: string, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
