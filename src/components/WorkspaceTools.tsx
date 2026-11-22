import { useEffect, useRef, useState } from 'react';
import { Input, Modal, ModalBody, ModalCloseButton, ModalContent, ModalHeader, ModalOverlay } from '@chakra-ui/react';
import type { ActivityRow, ActivityFilter } from '@/lib/workspace';
import { filterActivity } from '@/lib/workspace';
import type { StudioView } from './StudioChrome';

const destinations: { view: StudioView; title: string; detail: string }[] = [
  { view: 'overview', title: 'Workspace overview', detail: 'Progress, balance and launch shortcuts' },
  { view: 'launch', title: 'Launch a token', detail: 'Token settings, supply and liquidity pool' },
  { view: 'wallets', title: 'Manage wallets', detail: 'Unlock, restore, back up and view balances' },
  { view: 'trading', title: 'Review a trade', detail: 'Buying batch and individual sales' },
  { view: 'treasury', title: 'Collect to your wallet', detail: 'Treasury, receiving address and reviewed test SOL withdrawals' },
  { view: 'activity', title: 'Find a transaction', detail: 'Search signatures and filter recorded results' },
  { view: 'practice', title: 'Open practice lab', detail: 'Virtual wallets; no transactions' },
];
export function WorkspaceCommand({ navigate }: { navigate: (view: StudioView) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen(value => !value); setQuery(''); } };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);
  const matches = destinations.filter(item => `${item.title} ${item.detail}`.toLowerCase().includes(query.trim().toLowerCase()));
  function select(view: StudioView) { setOpen(false); navigate(view); }
  return <><button className="np-command-trigger" onClick={() => { setQuery(''); setOpen(true); }} aria-label="Search workspace (Control or Command K)"><span>⌕</span><span>Quick navigation</span><kbd>⌘ / Ctrl K</kbd></button>
    <Modal isOpen={open} onClose={() => setOpen(false)} initialFocusRef={searchInput} isCentered size="lg"><ModalOverlay backdropFilter="blur(8px)"/><ModalContent className="np-command-dialog"><ModalHeader>Where would you like to go?</ModalHeader><ModalCloseButton aria-label="Close workspace search"/><ModalBody pb={5}><Input ref={searchInput} aria-label="Search workspace destinations" placeholder="Search launch, wallets, trading..." value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && matches[0]) select(matches[0].view); }}/><div className="np-command-results">{matches.map((item, i) => <button key={item.view} onClick={() => select(item.view)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><span>{i === 0 ? '↵' : '↗'}</span></button>)}{!matches.length && <p>No destination found. Try “wallets” or “trade”.</p>}</div><p className="np-command-hint">Enter opens the first result. Tab moves through results. Escape closes.</p></ModalBody></ModalContent></Modal>
  </>;
}

export function CopyAddress({ value }: { value: string }) {
  const [state, setState] = useState('');
  return <span className="np-address-copy"><code>{value}</code><button onClick={async () => { try { await navigator.clipboard.writeText(value); setState('Copied'); } catch { setState('Select and copy the address'); } }} aria-label="Copy public wallet address">{state === 'Copied' ? 'Copied ✓' : 'Copy'}</button><span className="np-copy-message" role="status">{state}</span></span>;
}

export function LaunchChecklist({ unlocked, backedUp, tokenCreated, poolCreated, navigate }: { unlocked: boolean; backedUp: boolean; tokenCreated: boolean; poolCreated: boolean; navigate: (view: StudioView) => void }) {
  const steps: { title: string; done: boolean; view: StudioView }[] = [{ title: 'Unlock vault', done: unlocked, view: 'wallets' }, { title: 'Save backup', done: unlocked && backedUp, view: 'wallets' }, { title: 'Create token', done: tokenCreated, view: 'launch' }, { title: 'Create pool', done: poolCreated, view: 'launch' }];
  const completed = steps.filter(step => step.done).length;
  return <section className="np-checklist" aria-label="Launch readiness"><div><span className="np-eyebrow">LAUNCH READINESS</span><strong>{completed} of 4 ready</strong></div><div className="np-checklist-steps">{steps.map((step, index) => <button key={step.title} data-complete={step.done} onClick={() => navigate(step.view)}><span>{step.done ? '✓' : index + 1}</span>{step.title}</button>)}</div></section>;
}

export function ActivityExplorer({ rows, navigate }: { rows: ActivityRow[]; navigate: (view: StudioView) => void }) {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [query, setQuery] = useState('');
  const visible = filterActivity(rows, filter, query);
  const filters: { id: ActivityFilter; label: string }[] = [{ id: 'all', label: 'All results' }, { id: 'confirmed', label: 'Confirmed' }, { id: 'unresolved', label: 'Unresolved' }, { id: 'failed', label: 'Failed / expired' }];
  return <div className="np-panel"><div className="np-activity-heading"><div><h2>Transaction explorer</h2><p>Your recorded buys and sales. Submission is not confirmation.</p></div><span className="np-count-chip">{rows.length} records</span></div>
    <div className="np-filter-tabs" role="group" aria-label="Filter transaction status">{filters.map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}<span>{filterActivity(rows, item.id, '').length}</span></button>)}</div>
    <Input aria-label="Search transactions" placeholder="Search wallet address, signature or action..." value={query} onChange={event => setQuery(event.target.value)}/>
    {!visible.length ? <div className="np-empty"><h3>{rows.length ? 'No matching transactions' : 'No transactions recorded yet'}</h3><p>{rows.length ? 'Try another status or clear your search.' : 'Submit a reviewed devnet trade to start your transaction history.'}</p>{rows.length ? <button className="np-action" onClick={() => { setFilter('all'); setQuery(''); }}>Clear filters</button> : <button className="np-action" onClick={() => navigate('trading')}>Open trading →</button>}</div> : <div className="np-activity-table"><table><thead><tr><th>Action</th><th>Wallet</th><th>Signature</th><th>Status</th></tr></thead><tbody>{visible.map((row, i) => <tr key={row.signature || `${row.address}-${i}`}><td><span className={`np-trade-kind ${row.kind.toLowerCase()}`}>{row.kind === 'Buy' ? '↙' : '↗'} {row.kind}</span></td><td><code title={row.address}>{row.address.slice(0, 6)}...{row.address.slice(-6)}</code></td><td>{row.signature ? <a href={`https://explorer.solana.com/tx/${encodeURIComponent(row.signature)}?cluster=devnet`} target="_blank" rel="noreferrer">{row.signature.slice(0, 8)}...{row.signature.slice(-6)} ↗</a> : 'Not submitted'}</td><td><span className="np-status-badge" data-status={row.status}>{row.status}</span></td></tr>)}</tbody></table></div>}
    <p className="np-command-hint" role="status">Showing {visible.length} of {rows.length} recorded transactions. Unknown results must be checked before another submission.</p>
  </div>;
}
