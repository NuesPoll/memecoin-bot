import { useEffect, useRef, useState } from 'react';
import { Alert, AlertIcon, Badge, Box, Button, Checkbox, FormControl, FormLabel, Heading, HStack, Input, Link, SimpleGrid, Table, Tbody, Td, Text, Th, Thead, Tr, VStack } from '@chakra-ui/react';
import type { BatchRecord, LaunchInput, PreparedBatch, SaleRecord, TestProject, TokenHolding, TransactionAttempt } from '@/lib/solana/chain';
import { WALLET_COUNT, WalletResult, batchBudget, formatUnits, validateLaunch } from '@/lib/solana/plan';
import { EncryptedVault, decryptVault, encryptVault } from '@/lib/solana/vault';
import PracticeSimulation from './PracticeSimulation';
import WalletTrading from './WalletTrading';
import StudioChrome, { StudioOverview, StudioIcon, studioViews, StudioView } from './StudioChrome';

const STORAGE = 'novapulse.devnet.encrypted-vault.v1';
type Progress = { input: LaunchInput; tokenCreated?: boolean; pool?: string; poolCreated?: boolean; batch?: BatchRecord; pending?: TransactionAttempt; backupAcknowledged?: boolean; sales?: SaleRecord[] };
const initialInput: LaunchInput = { name: 'NovaPulse Test', symbol: 'NOVA', supply: '1000000', poolTokens: '100000', poolSol: '0.1' };
const chain = () => import('@/lib/solana/chain');
const short = (value: string) => `${value.slice(0, 6)}...${value.slice(-6)}`;
const explorer = (value: string, type = 'address') => `https://explorer.solana.com/${type}/${encodeURIComponent(value)}?cluster=devnet`;
function Field({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <FormControl><FormLabel>{label}</FormLabel><Input aria-label={label} value={value} onChange={event => onChange(event.target.value)} isDisabled={disabled} /></FormControl>;
}

export default function SolanaStudio() {
  const [project, setProject] = useState<TestProject | null>(null);
  const [encrypted, setEncrypted] = useState<EncryptedVault | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [backupSaved, setBackupSaved] = useState(false);
  const [input, setInput] = useState<LaunchInput>(initialInput);
  const [progress, setProgress] = useState<Progress>({ input: initialInput });
  const [solBalances, setSolBalances] = useState<number[]>([]);
  const [buyAmount, setBuyAmount] = useState('0.001');
  const [slippage, setSlippage] = useState('1');
  const [prepared, setPrepared] = useState<PreparedBatch | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [done, setDone] = useState(0);
  const [recoveryPool, setRecoveryPool] = useState('');
  const [network, setNetwork] = useState('Checking devnet connection…');
  const [holdings, setHoldings] = useState<TokenHolding[]>([]);
  const [balancesAt, setBalancesAt] = useState('');
  const [view, setView] = useState<StudioView>('overview');

  useEffect(() => {
    const sync = () => { const value = window.location.hash.slice(1); setView(studioViews.includes(value as StudioView) ? value as StudioView : 'overview'); };
    sync(); window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);
  function navigate(next: StudioView) {
    setView(next);
    if (window.location.hash !== `#${next}`) window.history.pushState(null, '', `#${next}`);
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  const projectRef = useRef<TestProject | null>(null);
  const progressRef = useRef<Progress>({ input: initialInput });
  const fileInput = useRef<HTMLInputElement | null>(null);
  const running = useRef(false);

  useEffect(() => {
    let active = true;
    fetch('/api/solana/status').then(async response => { const status = await response.json(); if (active) setNetwork(response.ok && status.verified ? 'Solana devnet connection verified. Mainnet is disabled.' : 'Devnet connection unavailable. Funding and on-chain actions may fail until it recovers.'); }).catch(() => { if (active) setNetwork('Could not check devnet. Please try again later.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try { const saved = localStorage.getItem(STORAGE); if (saved) setEncrypted(JSON.parse(saved)); }
    catch { setError('The saved encrypted vault could not be read. Restore your downloaded backup.'); }
  }, []);

  function remember(next: Progress) {
    progressRef.current = next;
    setProgress(next);
    if (projectRef.current) localStorage.setItem(`${STORAGE}.public.${projectRef.current.mint.publicKey.toBase58()}`, JSON.stringify(next));
  }
  function install(next: TestProject) {
    projectRef.current = next;
    setProject(next);
    const saved = localStorage.getItem(`${STORAGE}.public.${next.mint.publicKey.toBase58()}`);
    const nextProgress = saved ? JSON.parse(saved) as Progress : { input: initialInput };
    progressRef.current = nextProgress;
    setProgress(nextProgress); setInput(nextProgress.input); setPrepared(null); setReviewed(false); setBackupSaved(nextProgress.backupAcknowledged === true);
    setSolBalances([]); setHoldings([]); setBalancesAt('');
  }
  async function run(label: string, task: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setBusy(label); setError(''); setNotice('');
    try { await task(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'This step failed. Check the devnet status before retrying.'); }
    finally { running.current = false; setBusy(''); }
  }
  async function refresh() {
    if (!project) return;
    const api = await chain();
    const rpc = api.connection();
    const [native, tokens] = await Promise.all([api.balances(rpc, project), api.tokenHoldings(rpc, project)]);
    setSolBalances(native); setHoldings(tokens); setBalancesAt(new Date().toLocaleTimeString());
  }
  async function create() {
    if (password.length < 12) throw new Error('Choose a vault password with at least 12 characters.');
    const api = await chain();
    const next = api.generateProject();
    const vault = await encryptVault(api.serializeProject(next), password);
    // Only ciphertext is stored. Wallet keys never go into localStorage, logs or a request body.
    localStorage.setItem(STORAGE, JSON.stringify(vault));
    setEncrypted(vault); install(next); setPassword(''); setBackupSaved(false);
    setNotice('40 buying wallets and a separate launch wallet were created in your browser. Download the encrypted backup before proceeding.');
  }
  async function unlock() {
    if (!encrypted) throw new Error('Select an encrypted backup first.');
    const api = await chain();
    const next = api.restoreProject(await decryptVault(encrypted, password));
    localStorage.setItem(STORAGE, JSON.stringify(encrypted));
    install(next); setPassword('');
  }
  function downloadBackup() {
    if (!encrypted) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'NovaPulse-devnet-encrypted-vault.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupSaved(true);
    remember({ ...progressRef.current, backupAcknowledged: true });
  }
  function lock() {
    projectRef.current = null; setProject(null); setPrepared(null); setSolBalances([]); setHoldings([]); setBalancesAt(''); setBackupSaved(false); setPassword('');
  }
  function trackTransaction(pending: TransactionAttempt | undefined) {
    remember({ ...progressRef.current, pending });
  }
  function recordSale(sale: SaleRecord) {
    const sales = progressRef.current.sales || [];
    const found = sales.some(row => row.signature === sale.signature);
    remember({ ...progressRef.current, sales: (found ? sales.map(row => row.signature === sale.signature ? sale : row) : [...sales, sale]).slice(-100) });
  }
  async function checkPending() {
    const pending = progressRef.current.pending;
    if (!pending) return;
    const api = await chain();
    const status = await api.checkTransaction(api.connection(), pending);
    if (status === 'unknown') { setNotice('The transaction result is still unknown. New submissions remain paused; check again shortly.'); return; }
    if (pending.action === 'sell') recordSale({ ...pending, status });
    remember({ ...progressRef.current, pending: undefined, ...(status === 'confirmed' && pending.action === 'token' ? { tokenCreated: true } : {}), ...(status === 'confirmed' && pending.action === 'pool' ? { poolCreated: true } : {}) });
    await refresh();
    setNotice(status === 'confirmed' ? 'The transaction is confirmed on devnet. You can continue.' : status === 'expired' ? 'This signature was not found and its validity window has ended. Check on-chain progress before preparing this step again.' : 'The transaction failed on devnet. Check balances and on-chain progress before preparing this step again.');
  }
  function updateRow(row: WalletResult) {
    const current = progressRef.current;
    if (!current.batch) return;
    remember({ ...current, batch: { ...current.batch, rows: current.batch.rows.map(previous => previous.address === row.address ? row : previous) } });
  }
  const disabled = !!busy || !project || !backupSaved || !!progress.pending;
  const batchRows = progress.batch?.rows;
  const settingsLocked = !!progress.tokenCreated || !!progress.poolCreated || !!progress.batch || !!progress.pending;
  const confirmed = batchRows?.filter(row => row.status === 'confirmed').length || 0;
  const tokenGate = !project ? 'Unlock or create your wallets first.' : !backupSaved ? 'Create token is paused until you save your encrypted backup. Use Download encrypted backup above, or confirm that you already saved it.' : progress.pending ? 'Check the pending transaction status before creating another transaction.' : busy ? 'Wait for the current step to finish.' : '';
  let totalSpend = '-';
  try { totalSpend = (Number(batchBudget(buyAmount, WALLET_COUNT, Math.round(Number(slippage) * 100)).total) / 1e9).toString(); } catch { /* Validation appears when the user prepares a batch. */ }

  const recordedTrades = confirmed + (progress.sales || []).filter(sale => sale.status === 'confirmed').length;
  return <StudioChrome view={view} navigate={navigate} unlocked={!!project} network={network}>
    <div className="np-global-notices">
    {error && <Alert status="error"><AlertIcon /><Text overflowWrap="anywhere">{error}</Text></Alert>}
    {notice && <Alert status="success"><AlertIcon /><Text>{notice}</Text></Alert>}
    {busy && <Alert status="info" role="status"><AlertIcon />{busy}{busy === 'Preparing purchases' ? ` (${done}/40)` : ''}...</Alert>}
    {progress.pending && <Box borderWidth="1px" rounded="lg" p={5}><Text>One {progress.pending.action} transaction needs a status check. New submissions are paused to avoid repeating it.</Text><Link href={explorer(progress.pending.signature, 'tx')} isExternal overflowWrap="anywhere">View devnet transaction</Link><Button ml={3} isDisabled={!!busy || !project} onClick={() => run('Checking transaction', checkPending)}>Check transaction status</Button></Box>}

    </div>
    <section className="np-view" hidden={view !== 'overview'} aria-label="Overview workspace">
      <StudioOverview navigate={navigate} unlocked={!!project} backedUp={backupSaved} tokenCreated={!!progress.tokenCreated} poolCreated={!!progress.poolCreated} balance={solBalances.length ? solBalances[0] : undefined} confirmed={recordedTrades} />
    </section>
    <section className="np-view" hidden={view !== 'wallets'} aria-label="Wallet workspace">
    <Box className="np-panel"><Heading size="md" mb={3}>Wallets and backup</Heading>
      {!project ? <VStack align="stretch" spacing={3}>
        <Text>The vault holds 40 buying wallets and a launch wallet. Keys are generated here, encrypted with your password, and never sent to the server. Keep both the password and backup file.</Text>
        <FormControl><FormLabel htmlFor="vault-password">Vault password</FormLabel><Input id="vault-password" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" /></FormControl>
        <HStack flexWrap="wrap">{encrypted ? <Button onClick={() => run('Unlocking vault', unlock)} isDisabled={!!busy}>Unlock vault</Button> : <Button className="np-primary" onClick={() => run('Creating wallets', create)} isDisabled={!!busy}>Create 40 wallets</Button>}<Button variant="outline" onClick={() => fileInput.current?.click()} isDisabled={!!busy}>Restore encrypted backup</Button></HStack>
        <Input ref={fileInput} display="none" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (!file) return; void run('Reading backup', async () => { if (file.size > 100_000) throw new Error('This file is too large for a vault backup.'); setEncrypted(JSON.parse(await file.text())); setNotice('Enter the backup password, then unlock the vault.'); }); }} />
        <Text fontSize="sm">The website cannot recover a forgotten password. These wallets are for devnet testing; do not send real SOL to them.</Text>
      </VStack> : <VStack align="stretch" spacing={3}>
        <Text>40 buying wallets are unlocked. Launch wallet: <Link href={explorer(project.treasury.publicKey.toBase58())} isExternal>{short(project.treasury.publicKey.toBase58())}</Link></Text>
        <Text>Launch wallet balance: {solBalances.length ? `${(solBalances[0] / 1e9).toFixed(6)} test SOL` : 'Not checked yet'}</Text>
        <Text>Launch wallet project tokens: {holdings.length ? formatUnits(holdings[0].rawAmount, 6) : 'Not checked yet'}</Text>
        {balancesAt && <Text fontSize="sm">Balances last checked at {balancesAt}. Refresh before making a new decision.</Text>}
        <Text fontSize="sm" overflowWrap="anywhere">Launch wallet address for the faucet: {project.treasury.publicKey.toBase58()}</Text>
        <HStack flexWrap="wrap"><Button onClick={downloadBackup} isDisabled={!!busy}>Download encrypted backup</Button><Button variant="outline" onClick={() => run('Checking balances', refresh)} isDisabled={!!busy}>Refresh balances</Button><Button variant="ghost" onClick={lock} isDisabled={!!busy}>Lock vault</Button></HStack>
        {!backupSaved && <Alert status="warning"><AlertIcon /><VStack align="stretch"><Text>Save your encrypted backup to enable Create token. This protects access to your wallets; it is separate from your test SOL balance.</Text><Checkbox onChange={event => { setBackupSaved(event.target.checked); remember({ ...progressRef.current, backupAcknowledged: event.target.checked }); }}>I already saved this vault&apos;s encrypted backup and know its password.</Checkbox></VStack></Alert>}
        <Field label="Pool address for recovery (optional)" value={recoveryPool} disabled={!!busy} onChange={setRecoveryPool} />
        <Button variant="outline" isDisabled={!!busy} onClick={() => run('Checking existing token and pool', async () => { const api = await chain(); const pool = recoveryPool.trim() || progressRef.current.pool; const found = await api.inspectProject(api.connection(), project, pool); const recoveredInput = { ...progressRef.current.input, name: found.name || progressRef.current.input.name, symbol: found.symbol || progressRef.current.input.symbol }; setInput(recoveredInput); remember({ ...progressRef.current, ...found, input: recoveredInput, pool }); await refresh(); setNotice(found.tokenCreated ? 'The existing token and pool progress were checked against devnet.' : 'No token exists for this project yet.'); })}>Check on-chain progress</Button>
        <Text>Get free test SOL from Solana&apos;s web faucet using the launch wallet address above, then refresh balances here. Its RPC faucet is closed; the web faucet may require sign-in or a challenge.</Text>
        <Link href="https://faucet.solana.com/" isExternal>Open Solana devnet faucet</Link>
      </VStack>}
    </Box>

    </section>
    <section className="np-view" hidden={view !== 'launch'} aria-label="Token launch workspace">
    <div className="np-launch-grid">
    <Box className="np-panel"><Heading size="md" mb={3}>Token and trading pool</Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Field label="Token name" value={input.name} disabled={settingsLocked || !!busy} onChange={name => setInput({ ...input, name })} />
        <Field label="Token symbol" value={input.symbol} disabled={settingsLocked || !!busy} onChange={symbol => setInput({ ...input, symbol })} />
        <Field label="Total token supply" value={input.supply} disabled={settingsLocked || !!busy} onChange={supply => setInput({ ...input, supply })} />
        <Field label="Tokens for initial liquidity" value={input.poolTokens} disabled={settingsLocked || !!busy} onChange={poolTokens => setInput({ ...input, poolTokens })} />
        <Field label="Test SOL for initial liquidity" value={input.poolSol} disabled={settingsLocked || !!busy} onChange={poolSol => setInput({ ...input, poolSol })} />
      </SimpleGrid>
      <Text mt={3}>The token uses Solana Token-2022 with 6 decimals, a fixed supply, and no freeze authority. Creating the Raydium devnet pool also uses test SOL for rent and its pool-creation fee.</Text>
      {tokenGate && <Alert mt={3} status="warning"><AlertIcon /><Text>{tokenGate}</Text></Alert>}
      <HStack mt={4} flexWrap="wrap">
        <Button className="np-primary" isDisabled={disabled || !!progress.tokenCreated} onClick={() => run('Creating token', async () => { if (!project) return; validateLaunch(input.name, input.symbol, input.supply, input.poolTokens, input.poolSol); remember({ ...progressRef.current, input }); const api = await chain(); await refresh(); const signature = await api.createToken(api.connection(), project, input, trackTransaction); remember({ ...progressRef.current, tokenCreated: true }); await refresh(); setNotice(`Token confirmed on devnet. Transaction: ${signature}`); })}>{progress.tokenCreated ? 'Token created' : 'Create token'}</Button>
        <Button isDisabled={disabled || !progress.tokenCreated || !!progress.poolCreated} onClick={() => run('Creating trading pool', async () => { if (!project) return; const api = await chain(); const result = await api.createPool(api.connection(), project, progressRef.current.input, pool => remember({ ...progressRef.current, pool }), trackTransaction); remember({ ...progressRef.current, pool: result.pool, poolCreated: true }); await refresh(); setNotice('The devnet trading pool is confirmed.'); })}>{progress.poolCreated ? 'Pool created' : 'Create trading pool'}</Button>
      </HStack>
      {project && <Text mt={3}>Token mint: <Link href={explorer(project.mint.publicKey.toBase58())} isExternal>{short(project.mint.publicKey.toBase58())}</Link></Text>}
      {progress.pool && <Text mt={2}>Pool: <Link href={explorer(progress.pool)} isExternal>{short(progress.pool)}</Link></Text>}
    </Box>

    <aside className="np-token-preview"><span className="np-token-avatar">{input.symbol.slice(0, 2) || 'NP'}</span><h3>{input.name || 'Your token name'}</h3><p className="np-token-symbol">${input.symbol || 'SYMBOL'} / SOLANA</p><dl><div><dt>Total supply</dt><dd>{input.supply || 'Not set'}</dd></div><div><dt>Decimals</dt><dd>6 decimals</dd></div><div><dt>Mint authority</dt><dd>{progress.tokenCreated ? 'Revoked' : 'Revoked at creation'}</dd></div><div><dt>Freeze authority</dt><dd>None</dd></div><div><dt>Pool allocation</dt><dd>{input.poolTokens} tokens / {input.poolSol} test SOL</dd></div></dl><small>Preview of your current settings. Account rent and network fees also apply.</small></aside>
    </div><p className="np-safety-note">Test SOL only. Save your encrypted backup before you create a token. Transactions cannot be undone.</p>
    </section>
    <section className="np-view" hidden={view !== 'trading'} aria-label="Trading workspace">
    <Box className="np-panel"><Heading size="md" mb={3}>40-wallet buying batch</Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Field label="Test SOL per wallet" value={buyAmount} disabled={!!busy || !!progress.batch} onChange={value => { setBuyAmount(value); setPrepared(null); setReviewed(false); }} />
        <Field label="Maximum slippage (%)" value={slippage} disabled={!!busy || !!progress.batch} onChange={value => { setSlippage(value); setPrepared(null); setReviewed(false); }} />
      </SimpleGrid>
      <Text mt={3}>Purchase cap: {totalSpend} test SOL across 40 wallets, plus account rent and network fees. Each wallet gets a 0.01 test SOL reserve when funded; unused reserves stay in that wallet.</Text>
      <HStack mt={4} flexWrap="wrap">
        <Button variant="outline" isDisabled={disabled || !progress.poolCreated || !!progress.batch} onClick={() => run('Funding buying wallets', async () => { if (!project) return; const api = await chain(); await api.fundWallets(api.connection(), project, buyAmount, trackTransaction); await refresh(); setNotice('All 40 wallets are funded for this test batch.'); })}>Fund 40 wallets</Button>
        <Button isDisabled={disabled || !progress.poolCreated || !!progress.batch} onClick={() => run('Preparing purchases', async () => { if (!project || !progress.pool) return; setDone(0); setReviewed(false); const api = await chain(); setPrepared(await api.prepareBatch(api.connection(), project, progress.pool, buyAmount, Math.round(Number(slippage) * 100), setDone)); })}>Prepare batch for review</Button>
      </HStack>
      {prepared && !progress.batch && <VStack align="stretch" mt={4} spacing={3}><Alert status="info"><AlertIcon /><Text>40 purchases prepared. Each wallet&apos;s minimum is {(Number(prepared.minimumTokens) / 1e6).toLocaleString()} tokens, calculated conservatively for the whole batch. Review expires after 30 seconds; submission then refreshes the signing blockhash.</Text></Alert><Checkbox isChecked={reviewed} onChange={event => setReviewed(event.target.checked)}>I reviewed the total, per-wallet amount and minimum received. I understand individual purchases may fail.</Checkbox><Button className="np-primary" colorScheme="purple" isDisabled={!reviewed || disabled} onClick={() => run('Submitting 40 purchases', async () => { const api = await chain(); await api.submitBatch(api.connection(), prepared, batch => remember({ ...progressRef.current, batch }), updateRow); const record = progressRef.current.batch!; const rows = await api.checkBatch(api.connection(), record); remember({ ...progressRef.current, batch: { ...record, rows } }); setPrepared(null); setNotice('The batch was submitted. Refresh transaction status until results are confirmed.'); })}>Submit 40-wallet test batch</Button></VStack>}
      {progress.batch && <VStack align="stretch" mt={4} spacing={3}><Text>{confirmed} of 40 purchases confirmed. Each row is checked against the blockchain; submission is not a confirmation.</Text><Button variant="outline" isDisabled={!!busy} onClick={() => run('Checking batch results', async () => { const api = await chain(); const record = progressRef.current.batch!; remember({ ...progressRef.current, batch: { ...record, rows: await api.checkBatch(api.connection(), record) } }); await refresh(); })}>Refresh transaction status</Button><Text fontSize="sm">This test project submits one buying batch. It never automatically creates replacement purchases after an uncertain or failed result.</Text></VStack>}
    </Box>

    <WalletTrading key={(project?.mint.publicKey.toBase58() || 'locked') + ':' + (progress.pool || '')} project={project} pool={progress.poolCreated ? progress.pool : undefined} disabled={disabled} busy={!!busy} holdings={holdings} blockedWallets={(batchRows || []).filter(row => row.status !== 'confirmed' && row.status !== 'failed').map(row => row.address)} sales={progress.sales || []} run={run} track={trackTransaction} record={recordSale} refresh={refresh} />
    </section>
    <section className="np-view" hidden={view !== 'wallets'} aria-label="Wallet balances">
    {project && <Box className="np-panel" overflowX="auto"><Heading size="md" mb={3}>Buying wallets</Heading><Table size="sm"><Thead><Tr><Th>Wallet</Th><Th>Address</Th><Th>Test SOL</Th><Th>Project tokens</Th><Th>Purchase status</Th></Tr></Thead><Tbody>{project.wallets.map((wallet, i) => { const address = wallet.publicKey.toBase58(); const row = batchRows?.find(item => item.address === address); const holding = holdings.find(item => item.address === address); return <Tr key={address}><Td>{i + 1}</Td><Td><Link href={explorer(address)} isExternal>{short(address)}</Link></Td><Td>{solBalances.length ? (solBalances[i + 1] / 1e9).toFixed(6) : 'Not checked'}</Td><Td>{holding ? formatUnits(holding.rawAmount, 6) : 'Not checked'}{holding?.frozen ? ' (frozen)' : ''}</Td><Td>{row?.signature ? <Link href={explorer(row.signature, 'tx')} isExternal>{row.status}</Link> : row?.status || 'Not submitted'}{row?.message && <Text fontSize="sm" mt={1}>{row.message}</Text>}</Td></Tr>; })}</Tbody></Table></Box>}
    {!project && <div className="np-panel np-empty"><StudioIcon name="wallets"/><h3>Your wallet group will appear here</h3><p>Create or restore your vault above to view your 40 buying wallets and balances.</p></div>}
    </section>
    <section className="np-view" hidden={view !== 'activity'} aria-label="Transaction activity">
      <Box className="np-panel"><Heading size="md" mb={3}>Recorded buys and sales</Heading><Text fontSize="sm" color="gray.400" mb={5}>Your saved project signatures. Only confirmed results mean a completed trade.</Text>
      {!(batchRows?.length || progress.sales?.length) ? <div className="np-empty"><StudioIcon name="activity"/><h3>No transactions recorded yet</h3><p>Once you submit a devnet trade, its signature and status will appear here.</p><button className="np-action" onClick={() => navigate('trading')}>Open trading <StudioIcon name="arrow"/></button></div> : <Box overflowX="auto"><Table><Thead><Tr><Th>Action</Th><Th>Wallet</Th><Th>Signature</Th><Th>Status</Th></Tr></Thead><Tbody>{[...(batchRows || []).map(row => ({ ...row, kind: 'Buy' })), ...(progress.sales || []).map(sale => ({ address: sale.sale?.walletAddress || '', signature: sale.signature, status: sale.status, kind: 'Sell' }))].map((row, i) => <Tr key={row.signature || i}><Td>{row.kind}</Td><Td>{short(row.address)}</Td><Td>{row.signature ? <Link href={explorer(row.signature, 'tx')} isExternal>{short(row.signature)}</Link> : 'Not submitted'}</Td><Td><span className="np-status-badge" data-status={row.status}>{row.status}</span></Td></Tr>)}</Tbody></Table></Box>}
      </Box>
    </section>
    <section className="np-view" hidden={view !== 'practice'} aria-label="Practice workspace"><PracticeSimulation active={view === 'practice'} /></section>
    <p className="np-network-note" role="status"><StudioIcon name="shield"/>{network}</p>
  </StudioChrome>;
}
