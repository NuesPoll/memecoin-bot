import { useEffect, useRef, useState } from 'react';
import { Alert, AlertIcon, Badge, Box, Button, Checkbox, FormControl, FormLabel, Heading, HStack, Input, Link, SimpleGrid, Table, Tbody, Td, Text, Th, Thead, Tr, VStack } from '@chakra-ui/react';
import type { LaunchInput, PreparedBatch, SaleRecord, TestProject, TokenHolding, TransactionAttempt } from '@/lib/solana/chain';
import { WALLET_COUNT, WalletResult, batchBudget, formatUnits, validateLaunch } from '@/lib/solana/plan';
import { EncryptedVault, VaultSession, createVaultSession, openVault } from '@/lib/solana/vault';
import { ProjectProgress as Progress, backupPayload, mergeRecoveredProgress, readProgress, recoveredProgress } from '@/lib/solana/backup';
import PracticeSimulation from './PracticeSimulation';
import WalletTrading from './WalletTrading';
import { ActivityExplorer, CopyAddress, LaunchChecklist } from './WorkspaceTools';
import StudioChrome, { StudioOverview, StudioIcon, studioViews, StudioView } from './StudioChrome';

const STORAGE = 'novapulse.devnet.encrypted-vault.v1';
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
  const [backupAt, setBackupAt] = useState('');
  const [backupCurrent, setBackupCurrent] = useState(false);

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
  const vaultSession = useRef<VaultSession | null>(null);

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
    setBackupCurrent(false);
    if (projectRef.current) localStorage.setItem(`${STORAGE}.public.${projectRef.current.mint.publicKey.toBase58()}`, JSON.stringify(next));
  }
  function editInput(next: LaunchInput) {
    setInput(next);
    if (projectRef.current) remember({ ...progressRef.current, input: next });
    else setBackupCurrent(false);
  }
  function install(next: TestProject, recovered?: Progress, restoring = false) {
    const identity = { mintAddress: next.mint.publicKey.toBase58(), walletAddresses: next.wallets.map(wallet => wallet.publicKey.toBase58()) };
    const saved = localStorage.getItem(`${STORAGE}.public.${next.mint.publicKey.toBase58()}`);
    // Existing local records may be newer than a downloaded snapshot; never replace them silently.
    let local: Progress | undefined;
    if (saved) { try { local = readProgress(JSON.parse(saved), identity); } catch { if (!recovered) throw new Error('This browser\'s project history is damaged. Restore a current complete project backup.'); } }
    const nextProgress: Progress = mergeRecoveredProgress(local, recovered) || { input: initialInput, ...(restoring ? { recoveryRequired: true, historyMissing: true } : {}) };
    projectRef.current = next;
    setProject(next);
    progressRef.current = nextProgress;
    setProgress(nextProgress); setInput(nextProgress.input); setPrepared(null); setReviewed(false); setBackupSaved(nextProgress.backupAcknowledged === true);
    setSolBalances([]); setHoldings([]); setBalancesAt('');
    setBackupCurrent(false);
    localStorage.setItem(`${STORAGE}.public.${identity.mintAddress}`, JSON.stringify(nextProgress));
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
    const session = await createVaultSession(password);
    const vault = await session.seal(api.serializeProject(next));
    // Only ciphertext is stored. Wallet keys never go into localStorage, logs or a request body.
    localStorage.setItem(STORAGE, JSON.stringify(vault));
    setEncrypted(vault); install(next); vaultSession.current = session; setPassword(''); setBackupSaved(false); setBackupAt('');
    setNotice('40 buying wallets and a separate launch wallet were created in your browser. Download the encrypted backup before proceeding.');
  }
  async function unlock() {
    if (!encrypted) throw new Error('Select an encrypted backup first.');
    const api = await chain();
    const opened = await openVault(encrypted, password);
    const next = api.restoreProject(opened.payload);
    const recovered = recoveredProgress(opened.payload, { mintAddress: next.mint.publicKey.toBase58(), walletAddresses: next.wallets.map(wallet => wallet.publicKey.toBase58()) });
    install(next, recovered?.progress, true);
    vaultSession.current = opened.session;
    localStorage.setItem(STORAGE, JSON.stringify(encrypted));
    setPassword(''); setBackupAt(recovered?.savedAt || '');
    setNotice('Vault unlocked. Existing browser history is kept when available. Check on-chain progress before continuing a restored project. Backups contain progress only up to the time they were downloaded.');
  }
  async function downloadBackup() {
    if (!project || !vaultSession.current) throw new Error('Unlock your vault before downloading a complete backup.');
    const api = await chain(), savedAt = new Date().toISOString();
    const nextProgress = { ...progressRef.current, input, backupAcknowledged: true };
    const payload = backupPayload(api.serializeProject(project), nextProgress, { mintAddress: project.mint.publicKey.toBase58(), walletAddresses: project.wallets.map(wallet => wallet.publicKey.toBase58()) }, savedAt);
    const vault = await vaultSession.current.seal(payload);
    const url = URL.createObjectURL(new Blob([JSON.stringify(vault)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `NovaPulse-devnet-project-${savedAt.slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    localStorage.setItem(STORAGE, JSON.stringify(vault)); setEncrypted(vault);
    setBackupSaved(true);
    remember(nextProgress); setBackupAt(savedAt); setBackupCurrent(true);
    setNotice('Complete encrypted backup downloaded: wallets, token settings and recorded transaction progress. Save a fresh copy after new transactions. Keep your password separately.');
  }
  function lock() {
    projectRef.current = null; vaultSession.current = null; setProject(null); setPrepared(null); setSolBalances([]); setHoldings([]); setBalancesAt(''); setBackupSaved(false); setPassword(''); setBackupCurrent(false);
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
  const disabled = !!busy || !project || !backupSaved || !!progress.pending || !!progress.recoveryRequired;
  const tradingPaused = disabled || !!progress.historyMissing;
  const batchRows = progress.batch?.rows;
  const settingsLocked = !!progress.tokenCreated || !!progress.poolCreated || !!progress.batch || !!progress.pending || !!progress.recoveryRequired;
  const confirmed = batchRows?.filter(row => row.status === 'confirmed').length || 0;
  const tokenGate = !project ? 'Unlock or create your wallets first.' : progress.recoveryRequired ? 'Check on-chain progress in Wallet manager to verify this restored project before continuing.' : !backupSaved ? 'Create token is paused until you save your encrypted backup. Use Download encrypted backup above, or confirm that you already saved it.' : progress.pending ? 'Check the pending transaction status before creating another transaction.' : busy ? 'Wait for the current step to finish.' : '';
  let totalSpend = '-';
  try { totalSpend = (Number(batchBudget(buyAmount, WALLET_COUNT, Math.round(Number(slippage) * 100)).total) / 1e9).toString(); } catch { /* Validation appears when the user prepares a batch. */ }

  const recordedTrades = confirmed + (progress.sales || []).filter(sale => sale.status === 'confirmed').length;
  return <StudioChrome view={view} navigate={navigate} unlocked={!!project} network={network} busy={!!busy} refresh={() => run('Refreshing wallet balances', refresh)} lock={lock}>
    <div className="np-global-notices">
    {error && <Alert status="error"><AlertIcon /><Text overflowWrap="anywhere">{error}</Text></Alert>}
    {notice && <Alert status="success"><AlertIcon /><Text>{notice}</Text></Alert>}
    {busy && <Alert status="info" role="status"><AlertIcon />{busy}{busy === 'Preparing purchases' ? ` (${done}/40)` : ''}...</Alert>}
    {project && progress.recoveryRequired && <Alert status="warning"><AlertIcon /><VStack align="stretch"><Text>Restore checkpoint: verify this project on devnet before creating or trading. Imported confirmations are rechecked rather than assumed.</Text><Button variant="link" alignSelf="start" onClick={() => navigate('wallets')}>Open recovery controls</Button></VStack></Alert>}
    {project && progress.historyMissing && !progress.recoveryRequired && <Alert status="warning"><AlertIcon /><Text>This wallet-only backup has no trading history in this browser. Trading stays paused to avoid repeating old transactions. Use the original browser or restore a recent complete project backup. If the token has not been created, an on-chain check can safely clear this pause.</Text></Alert>}
    {progress.pending && <Box borderWidth="1px" rounded="lg" p={5}><Text>One {progress.pending.action} transaction needs a status check. New submissions are paused to avoid repeating it.</Text><Link href={explorer(progress.pending.signature, 'tx')} isExternal overflowWrap="anywhere">View devnet transaction</Link><Button ml={3} isDisabled={!!busy || !project} onClick={() => run('Checking transaction', checkPending)}>Check transaction status</Button></Box>}

    </div>
    {view !== 'overview' && view !== 'practice' && <LaunchChecklist unlocked={!!project} backedUp={backupSaved} tokenCreated={!!progress.tokenCreated} poolCreated={!!progress.poolCreated} navigate={navigate} />}
    <section className="np-view" hidden={view !== 'overview'} aria-label="Overview workspace">
      <StudioOverview navigate={navigate} unlocked={!!project} backedUp={backupSaved} tokenCreated={!!progress.tokenCreated} poolCreated={!!progress.poolCreated} balance={solBalances.length ? solBalances[0] : undefined} confirmed={recordedTrades} />
    </section>
    <section className="np-view" hidden={view !== 'wallets'} aria-label="Wallet workspace">
    <Box className="np-panel"><Heading size="md" mb={3}>Wallets and backup</Heading>
      {!project ? <VStack align="stretch" spacing={3}>
        <Text>The vault holds 40 buying wallets and a launch wallet. Keys are generated here, encrypted with your password, and never sent to the server. Keep both the password and backup file.</Text>
        <FormControl><FormLabel htmlFor="vault-password">Vault password</FormLabel><Input id="vault-password" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" /></FormControl>
        <HStack flexWrap="wrap">{encrypted ? <Button onClick={() => run('Unlocking vault', unlock)} isDisabled={!!busy}>Unlock vault</Button> : <Button className="np-primary" onClick={() => run('Creating wallets', create)} isDisabled={!!busy}>Create 40 wallets</Button>}<Button variant="outline" onClick={() => fileInput.current?.click()} isDisabled={!!busy}>Restore encrypted backup</Button></HStack>
        <Input ref={fileInput} display="none" type="file" accept="application/json,.json" aria-label="Select encrypted project backup" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void run('Reading backup', async () => { if (file.size > 300_000) throw new Error('This file is too large for a project backup.'); const value = JSON.parse(await file.text()); if (value?.format !== 'novapulse-devnet-v1' || typeof value.ciphertext !== 'string') throw new Error('Choose a NovaPulse encrypted project or wallet backup.'); setEncrypted(value); setNotice('Enter the backup password, then unlock the vault. Your current saved vault is kept until the password and file are verified.'); }); }} />
        <Text fontSize="sm">The website cannot recover a forgotten password. These wallets are for devnet testing; do not send real SOL to them.</Text>
      </VStack> : <VStack align="stretch" spacing={3}>
        <Text>40 buying wallets are unlocked. Launch wallet: <Link href={explorer(project.treasury.publicKey.toBase58())} isExternal>{short(project.treasury.publicKey.toBase58())}</Link></Text>
        <Text>Launch wallet balance: {solBalances.length ? `${(solBalances[0] / 1e9).toFixed(6)} test SOL` : 'Not checked yet'}</Text>
        <Text>Launch wallet project tokens: {holdings.length ? formatUnits(holdings[0].rawAmount, 6) : 'Not checked yet'}</Text>
        {balancesAt && <Text fontSize="sm">Balances last checked at {balancesAt}. Refresh before making a new decision.</Text>}
        <Text fontSize="sm">Launch wallet address for the faucet:</Text><CopyAddress value={project.treasury.publicKey.toBase58()} />
        <HStack flexWrap="wrap"><Button onClick={() => run('Encrypting project backup', downloadBackup)} isDisabled={!!busy}>Download encrypted backup</Button><Button variant="outline" onClick={() => run('Checking balances', refresh)} isDisabled={!!busy}>Refresh balances</Button><Button variant="ghost" onClick={lock} isDisabled={!!busy}>Lock vault</Button></HStack>
        <div className="np-backup-status"><StudioIcon name="shield"/><div><strong>{backupCurrent ? 'Current project snapshot saved' : 'Keep a complete project backup'}</strong><p>Wallets, token settings and recorded transactions are encrypted together. {backupAt ? `Last snapshot: ${new Date(backupAt).toLocaleString()}. ` : ''}Download a fresh copy after new transactions. Older wallet-only backups still unlock your keys.</p></div><Badge>{backupCurrent ? 'Up to date' : 'Snapshot'}</Badge></div>
        {!backupSaved && <Alert status="warning"><AlertIcon /><VStack align="stretch"><Text>Save your encrypted backup to enable Create token. This protects access to your wallets; it is separate from your test SOL balance.</Text><Checkbox onChange={event => { setBackupSaved(event.target.checked); remember({ ...progressRef.current, backupAcknowledged: event.target.checked }); }}>I already saved this vault&apos;s encrypted backup and know its password.</Checkbox></VStack></Alert>}
        <Field label="Pool address for recovery (optional)" value={recoveryPool} disabled={!!busy} onChange={setRecoveryPool} />
        <Button variant="outline" isDisabled={!!busy} onClick={() => run('Checking existing token and pool', async () => { const api = await chain(); const pool = recoveryPool.trim() || progressRef.current.pool; const found = await api.inspectProject(api.connection(), project, pool); const recoveredInput = { ...progressRef.current.input, name: found.name || progressRef.current.input.name, symbol: found.symbol || progressRef.current.input.symbol }; setInput(recoveredInput); remember({ ...progressRef.current, ...found, input: recoveredInput, pool, recoveryRequired: false, historyMissing: found.tokenCreated ? progressRef.current.historyMissing : false }); await refresh(); setNotice(found.tokenCreated ? 'The existing token and pool progress were checked against devnet. Recheck any imported transaction results in Trading before making a new decision.' : 'No token exists for this project yet. You can save your backup and create it.'); })}>Check on-chain progress</Button>
        <Text>Get free test SOL from Solana&apos;s web faucet using the launch wallet address above, then refresh balances here. Its RPC faucet is closed; the web faucet may require sign-in or a challenge.</Text>
        <Link href="https://faucet.solana.com/" isExternal>Open Solana devnet faucet</Link>
      </VStack>}
    </Box>

    </section>
    <section className="np-view" hidden={view !== 'launch'} aria-label="Token launch workspace">
    <div className="np-launch-grid">
    <Box className="np-panel"><Heading size="md" mb={3}>Token and trading pool</Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Field label="Token name" value={input.name} disabled={settingsLocked || !!busy} onChange={name => editInput({ ...input, name })} />
        <Field label="Token symbol" value={input.symbol} disabled={settingsLocked || !!busy} onChange={symbol => editInput({ ...input, symbol })} />
        <Field label="Total token supply" value={input.supply} disabled={settingsLocked || !!busy} onChange={supply => editInput({ ...input, supply })} />
        <Field label="Tokens for initial liquidity" value={input.poolTokens} disabled={settingsLocked || !!busy} onChange={poolTokens => editInput({ ...input, poolTokens })} />
        <Field label="Test SOL for initial liquidity" value={input.poolSol} disabled={settingsLocked || !!busy} onChange={poolSol => editInput({ ...input, poolSol })} />
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
    {progress.historyMissing && <Alert status="warning"><AlertIcon /><Text>A complete trading history is needed here. Restore a recent project backup or return to the original browser before preparing buys or sales.</Text></Alert>}
    <Box className="np-panel"><Heading size="md" mb={3}>40-wallet buying batch</Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Field label="Test SOL per wallet" value={buyAmount} disabled={!!busy || !!progress.batch} onChange={value => { setBuyAmount(value); setPrepared(null); setReviewed(false); }} />
        <Field label="Maximum slippage (%)" value={slippage} disabled={!!busy || !!progress.batch} onChange={value => { setSlippage(value); setPrepared(null); setReviewed(false); }} />
      </SimpleGrid>
      <Text mt={3}>Purchase cap: {totalSpend} test SOL across 40 wallets, plus account rent and network fees. Each wallet gets a 0.01 test SOL reserve when funded; unused reserves stay in that wallet.</Text>
      <HStack mt={4} flexWrap="wrap">
        <Button variant="outline" isDisabled={tradingPaused || !progress.poolCreated || !!progress.batch} onClick={() => run('Funding buying wallets', async () => { if (!project) return; const api = await chain(); await api.fundWallets(api.connection(), project, buyAmount, trackTransaction); await refresh(); setNotice('All 40 wallets are funded for this test batch.'); })}>Fund 40 wallets</Button>
        <Button isDisabled={tradingPaused || !progress.poolCreated || !!progress.batch} onClick={() => run('Preparing purchases', async () => { if (!project || !progress.pool) return; setDone(0); setReviewed(false); const api = await chain(); setPrepared(await api.prepareBatch(api.connection(), project, progress.pool, buyAmount, Math.round(Number(slippage) * 100), setDone)); })}>Prepare batch for review</Button>
      </HStack>
      {prepared && !progress.batch && <VStack align="stretch" mt={4} spacing={3}><Alert status="info"><AlertIcon /><Text>40 purchases prepared. Each wallet&apos;s minimum is {(Number(prepared.minimumTokens) / 1e6).toLocaleString()} tokens, calculated conservatively for the whole batch. Review expires after 30 seconds; submission then refreshes the signing blockhash.</Text></Alert><Checkbox isChecked={reviewed} onChange={event => setReviewed(event.target.checked)}>I reviewed the total, per-wallet amount and minimum received. I understand individual purchases may fail.</Checkbox><Button className="np-primary" colorScheme="purple" isDisabled={!reviewed || disabled} onClick={() => run('Submitting 40 purchases', async () => { const api = await chain(); await api.submitBatch(api.connection(), prepared, batch => remember({ ...progressRef.current, batch }), updateRow); const record = progressRef.current.batch!; const rows = await api.checkBatch(api.connection(), record); remember({ ...progressRef.current, batch: { ...record, rows } }); setPrepared(null); setNotice('The batch was submitted. Refresh transaction status until results are confirmed.'); })}>Submit 40-wallet test batch</Button></VStack>}
      {progress.batch && <VStack align="stretch" mt={4} spacing={3}><Text>{confirmed} of 40 purchases confirmed. Each row is checked against the blockchain; submission is not a confirmation.</Text><Button variant="outline" isDisabled={!!busy} onClick={() => run('Checking batch results', async () => { const api = await chain(); const record = progressRef.current.batch!; remember({ ...progressRef.current, batch: { ...record, rows: await api.checkBatch(api.connection(), record) } }); await refresh(); })}>Refresh transaction status</Button><Text fontSize="sm">This test project submits one buying batch. It never automatically creates replacement purchases after an uncertain or failed result.</Text></VStack>}
    </Box>

    <WalletTrading key={(project?.mint.publicKey.toBase58() || 'locked') + ':' + (progress.pool || '')} project={project} pool={progress.poolCreated ? progress.pool : undefined} disabled={tradingPaused} busy={!!busy} holdings={holdings} blockedWallets={(batchRows || []).filter(row => row.status !== 'confirmed' && row.status !== 'failed').map(row => row.address)} sales={progress.sales || []} run={run} track={trackTransaction} record={recordSale} refresh={refresh} />
    </section>
    <section className="np-view" hidden={view !== 'wallets'} aria-label="Wallet balances">
    {project && <Box className="np-panel" overflowX="auto"><Heading size="md" mb={3}>Buying wallets</Heading><Table size="sm"><Thead><Tr><Th>Wallet</Th><Th>Address</Th><Th>Test SOL</Th><Th>Project tokens</Th><Th>Purchase status</Th></Tr></Thead><Tbody>{project.wallets.map((wallet, i) => { const address = wallet.publicKey.toBase58(); const row = batchRows?.find(item => item.address === address); const holding = holdings.find(item => item.address === address); return <Tr key={address}><Td>{i + 1}</Td><Td><Link href={explorer(address)} isExternal>{short(address)}</Link></Td><Td>{solBalances.length ? (solBalances[i + 1] / 1e9).toFixed(6) : 'Not checked'}</Td><Td>{holding ? formatUnits(holding.rawAmount, 6) : 'Not checked'}{holding?.frozen ? ' (frozen)' : ''}</Td><Td>{row?.signature ? <Link href={explorer(row.signature, 'tx')} isExternal>{row.status}</Link> : row?.status || 'Not submitted'}{row?.message && <Text fontSize="sm" mt={1}>{row.message}</Text>}</Td></Tr>; })}</Tbody></Table></Box>}
    {!project && <div className="np-panel np-empty"><StudioIcon name="wallets"/><h3>Your wallet group will appear here</h3><p>Create or restore your vault above to view your 40 buying wallets and balances.</p></div>}
    </section>
    <section className="np-view" hidden={view !== 'activity'} aria-label="Transaction activity">
      <ActivityExplorer rows={[...(batchRows || []).map(row => ({ ...row, kind: 'Buy' as const })), ...(progress.sales || []).map(sale => ({ address: sale.sale?.walletAddress || '', signature: sale.signature, status: sale.status, kind: 'Sell' as const }))]} navigate={navigate} />
    </section>
    <section className="np-view" hidden={view !== 'practice'} aria-label="Practice workspace"><PracticeSimulation active={view === 'practice'} /></section>
    <p className="np-network-note" role="status"><StudioIcon name="shield"/>{network}</p>
  </StudioChrome>;
}
