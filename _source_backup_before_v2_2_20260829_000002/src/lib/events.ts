export const DATA_EVENT = 'finance-data-changed';
export function notifyDataChanged(detail = 'all') {
  window.dispatchEvent(new CustomEvent(DATA_EVENT, { detail }));
}
