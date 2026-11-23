export type ActivityRow = { address: string; signature?: string; destination?: string; status: string; kind: 'Buy' | 'Sell' | 'Collect' | 'Remove LP' };
export type ActivityFilter = 'all' | 'confirmed' | 'unresolved' | 'failed';
export function filterActivity(rows: ActivityRow[], filter: ActivityFilter, query: string) {
  const term = query.trim().toLowerCase();
  return rows.filter(row => {
    const state = filter === 'all' || (filter === 'confirmed' ? row.status === 'confirmed' : filter === 'failed' ? ['failed', 'expired'].includes(row.status) : ['ready', 'submitted', 'unknown'].includes(row.status));
    return state && (!term || `${row.kind} ${row.address} ${row.destination || ''} ${row.signature || ''} ${row.status}`.toLowerCase().includes(term));
  });
}
