import { useEffect, useRef, useState } from 'react';
import { Alert, AlertIcon, Badge, Box, Button, Checkbox, FormControl, FormLabel, Heading, HStack, Input, Link, SimpleGrid, Table, Tbody, Td, Text, Th, Thead, Tr, VStack } from '@chakra-ui/react';
import type { BatchRecord, LaunchInput, PreparedBatch, TestProject } from '@/lib/solana/chain';
import { WALLET_COUNT, WalletResult, batchBudget, validateLaunch } from '@/lib/solana/plan';
import { EncryptedVault, decryptVault, encryptVault } from '@/lib/solana/vault';

const STORAGE = 'novapulse.devnet.encrypted-vault.v1';
type Progress = { input: LaunchInput; tokenCreated?: boolean; pool?: string; poolCreated?: boolean; batch?: BatchRecord };
const initialInput: LaunchInput = { name: 'NovaPulse Test', symbol: 'NOVA', supply: '1000000', poolTokens: '100000', poolSol: '0.1' };
const chain = () => import('@/lib/solana/chain');
const short = (value: string) => `${value.slice(0, 6)}â€¦${value.slice(-6)}`;
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
  const projectRef = useRef<TestProject | null>(null);
  const progressRef = useRef<Progress>({ input: initialInput });
  const fileInput = useRef<HTMLInputElement | null>(null);
  const running = useRef(false);

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
    setProgress(nextProgress); setInput(nextProgress.input); setPrepared(null); setReviewed(false);
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
    setSolBalances(await api.balances(api.connection(), project));
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
    install(next); setPassword(''); setBackupSaved(false);
  }
  function downloadBackup() {
    if (!encrypted) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(encrypted)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'NovaPulse-devnet-encrypted-vault.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupSaved(true);
  }
  function lock() {
    projectRef.current = null; setProject(null); setPrepared(null); setSolBalances([]); setBackupSaved(false); setPassword('');
  }
  function updateRow(row: WalletResult) {
    const current = progressRef.current;
    if (!current.batch) return;
    remember({ ...current, batch: { ...current.batch, rows: current.batch.rows.map(previous => previous.address === row.address ? row : previous) } });
  }
  const disabled = !!busy || !project || !backupSaved;
  const batchRows = progress.batch?.rows;
  const settingsLocked = !!progress.tokenCreated || !!progress.poolCreated || !!progress.batch;
  const confirmed = batchRows?.filter(row => row.status === 'confirmed').length || 0;
  let totalSpend = 'â€”';
  try { totalSpend = (Number(batchBudget(buyAmount, WALLET_COUNT, Math.round(Number(slippage) * 100)).total) / 1e9).toString(); } catch { /* Validation appears when the user prepares a batch. */ }

  return <VStack align="stretch" spacing={6} pb={12}>
    <HStack justify="space-between" flexWrap="wrap"><Heading size="xl">Solana Launch Studio</Heading><Badge colorScheme="purple" px={3} py={1}>DEVNET Â· TEST SOL ONLY</Badge></HStack>
    <Text>Create a standard Solana token, seed its trading pool, and submit purchases from 40 new wallets in one coordinated batch.</Text>
    <Alert status="info"><AlertIcon /><Text>This online test version cannot access mainnet. Forty purchases use separate transactions; the same block and all-or-nothing execution are not guaranteed.</Text></Alert>
    {error && <Alert status="error"><AlertIcon /><Text overflowWrap="anywhere">{error}</Text></Alert>}
    {notice && <Alert status="success"><AlertIcon /><Text>{notice}</Text></Alert>}
    {busy && <Alert status="info" role="status"><AlertIcon />{busy}{busy === 'Preparing purchases' ? ` (${done}/40)` : ''}â€¦</Alert>}

    <Box borderWidth="1px" rounded="lg" p={5}><Heading size="md" mb={3}>Wallets and backup</Heading>
      {!project ? <VStack align="stretch" spacing={3}>
        <Text>The vault holds 40 buying wallets and a launch wallet. Keys are generated here, encrypted with your password, and never sent to the server. Keep both the password and backup file.</Text>
        <FormControl><FormLabel htmlFor="vault-password">Vault password</FormLabel><Input id="vault-password" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 12 characters" /></FormControl>
        <HStack flexWrap="wrap">{encrypted ? <Button onClick={() => run('Unlocking vault', unlock)} isDisabled={!!busy}>Unlock vault</Button> : <Button onClick={() => run('Creating wallets', create)} isDisabled={!!busy}>Create 40 wallets</Button>}<Button variant="outline" onClick={() => fileInput.current?.click()} isDisabled={!!busy}>Restore encrypted backup</Button></HStack>
        <Input ref={fileInput} display="none" type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (!file) return; void run('Reading backup', async () => { if (file.size > 100_000) throw new Error('This file is too large for a vault backup.'); setEncrypted(JSON.parse(await file.text())); setNotice('Enter the backup password, then unlock the vault.'); }); }} />
        <Text fontSize="sm">The website cannot recover a forgotten password. These wallets are for devnet testing; do not send real SOL to them.</Text>
      </VStack> : <VStack align="stretch" spacing={3}>
        <Text>40 buying wallets are unlocked. Launch wallet: <Link href={explorer(project.treasury.publicKey.toBase58())} isExternal>{short(project.treasury.publicKey.toBase58())}</Link></Text>
        <Text>Launch wallet balance: {solBalances.length ? `${(solBalances[0] / 1e9).toFixed(6)} test SOL` : 'Not checked yet'}</Text>
        <HStack flexWrap="wrap"><Button onClick={downloadBackup} isDisabled={!!busy}>Download encrypted backup</Button><Button variant="outline" onClick={() => run('Checking balances', refresh)} isDisabled={!!busy}>Refresh balances</Button><Button variant="ghost" onClick={lock} isDisabled={!!busy}>Lock vault</Button></HStack>
        {!backupSaved && <Text>Download the encrypted backup to unlock the next steps.</Text>}
        <Field label="Pool address for recovery (optional)" value={recoveryPool} disabled={!!busy} onChange={setRecoveryPool} />
        <Button variant="outline" isDisabled={!!busy} onClick={() => run('Checking existing token and pool', async () => { const api = await chain(); const pool = recoveryPool.trim() || progressRef.current.pool; const found = await api.inspectProject(api.connection(), project, pool); const recoveredInput = { ...progressRef.current.input, name: found.name || progressRef.current.input.name, symbol: found.symbol || progressRef.current.input.symbol }; setInput(recoveredInput); remember({ ...progressRef.current, ...found, input: recoveredInput, pool }); await refresh(); setNotice(found.tokenCreated ? 'The existing token and pool progress were checked against devnet.' : 'No token exists for this project yet.'); })}>Check on-chain progress</Button>
        <HStack flexWrap="wrap"><Button variant="outline" isDisabled={disabled} onClick={() => run('Requesting test SOL', async () => { const api = await chain(); const signature = await api.requestTestSol(api.connection(), project); await refresh(); setNotice(`Test SOL received. Transaction: ${signature}`); })}>Request 2 test SOL</Button><Link href="https://faucet.solana.com/" isExternal>Open Solana devnet faucet</Link></HStack>
      </VStack>}
    </Box>

    <Box borderWidth="1px" rounded="lg" p={5}><Heading size="md" mb={3}>Token and trading pool</Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Field label="Token name" value={input.name} disabled={settingsLocked || !!busy} onChange={name => setInput({ ...input, name })} />
        <Field label="Token symbol" value={input.symbol} disabled={settingsLocked || !!busy} onChange={symbol => setInput({ ...input, symbol })} />
        <Field label="Total token supply" value={input.supply} disabled={settingsLocked || !!busy} onChange={supply => setInput({ ...input, supply })} />
        <Field label="Tokens for initial liquidity" value={input.poolTokens} disabled={settingsLocked || !!busy} onChange={poolTokens => setInput({ ...input, poolTokens })} />
        <Field label="Test SOL for initial liquidity" value={input.poolSol} disabled={settingsLocked || !!busy} onChange={poolSol => setInput({ ...input, poolSol })} />
      </SimpleGrid>
      <Text mt={3}>The token uses Solana Token-2022 with 6 decimals, a fixed supply, and no freeze authority. Creating the Raydium devnet pool also uses test SOL for rent and its pool-creation fee.</Text>
      <HStack mt={4} flexWrap="wrap">
        <Button isDisabled={disabled || !!progress.tokenCreated} onClick={() => run('Creating token', async () => { if (!project) return; validateLaunch(input.name, input.symbol, input.supply, input.poolTokens, input.poolSol); remember({ ...progressRef.current, input }); const api = await chain(); const signature = await api.createToken(api.connection(), project, input); remember({ ...progressRef.current, tokenCreated: true }); await refresh(); setNotice(`Token confirmed on devnet. Transaction: ${signature}`); })}>{progress.tokenCreated ? 'Token created' : 'Create token'}</Button>
        <Button isDisabled={disabled || !progress.tokenCreated || !!progress.poolCreated} onClick={() => run('Creating trading pool', async () => { if (!project) return; const api = await chain(); const result = await api.createPool(api.connection(), project, progressRef.current.input, pool => remember({ ...progressRef.current, pool })); remember({ ...progressRef.current, pool: result.pool, poolCreated: true }); await refresh(); setNotice('The devnet trading pool is confirmed.'); })}>{progress.poolCreated ? 'Pool created' : 'Create trading pool'}</Button>
      </HStack>
      {project && <Text mt={3}>Token mint: <Link href={explorer(project.mint.publicKey.toBase58())} isExternal>{short(project.mint.publicKey.toBase58())}</Link></Text>}
      {progress.pool && <Text mt={2}>Pool: <Link href={explorer(progress.pool)} isExternal>{short(progress.pool)}</Link></Text>}
    </Box>

    <Box borderWidth="1px" rounded="lg" p={5}><Heading size="md" mb={3}>40-wallet buying batch</Heading>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        <Field label="Test SOL per wallet" value={buyAmount} disabled={!!busy || !!progress.batch} onChange={value => { setBuyAmount(value); setPrepared(null); setReviewed(false); }} />
        <Field label="Maximum slippage (%)" value={slippage} disabled={!!busy || !!progress.batch} onChange={value => { setSlippage(value); setPrepared(null); setReviewed(false); }} />
      </SimpleGrid>
      <Text mt={3}>Purchase cap: {totalSpend} test SOL across 40 wallets, plus account rent and network fees. Each wallet gets a 0.01 test SOL reserve when funded; unused reserves stay in that wallet.</Text>
      <HStack mt={4} flexWrap="wrap">
        <Button variant="outline" isDisabled={disabled || !progress.poolCreated || !!progress.batch} onClick={() => run('Funding buying wallets', async () => { if (!project) return; const api = await chain(); await api.fundWallets(api.connection(), project, buyAmount); await refresh(); setNotice('All 40 wallets are funded for this test batch.'); })}>Fund 40 wallets</Button>
        <Button isDisabled={disabled || !progress.poolCreated || !!progress.batch} onClick={() => run('Preparing purchases', async () => { if (!project || !progress.pool) return; setDone(0); setReviewed(false); const api = await chain(); setPrepared(await api.prepareBatch(api.connection(), project, progress.pool, buyAmount, Math.round(Number(slippage) * 100), setDone)); })}>Prepare batch for review</Button>
      </HStack>
      {prepared && !progress.batch && <VStack align="stretch" mt={4} spacing={3}><Alert status="info"><AlertIcon /><Text>40 purchases prepared. Each wallet&apos;s minimum is {(Number(prepared.minimumTokens) / 1e6).toLocaleString()} tokens, calculated conservatively for the whole batch. Review expires after 30 seconds; submission then refreshes the signing blockhash.</Text></Alert><Checkbox isChecked={reviewed} onChange={event => setReviewed(event.target.checked)}>I reviewed the total, per-wallet amount and minimum received. I understand individual purchases may fail.</Checkbox><Button colorScheme="purple" isDisabled={!reviewed || disabled} onClick={() => run('Submitting 40 purchases', async () => { const api = await chain(); await api.submitBatch(api.connection(), prepared, batch => remember({ ...progressRef.current, batch }), updateRow); const record = progressRef.current.batch!; const rows = await api.checkBatch(api.connection(), record); remember({ ...progressRef.current, batch: { ...record, rows } }); setPrepared(null); setNotice('The batch was submitted. Refresh transaction status until results are confirmed.'); })}>Submit 40-wallet test batch</Button></VStack>}
      {progress.batch && <VStack align="stretch" mt={4} spacing={3}><Text>{confirmed} of 40 purchases confirmed. Each row is checked against the blockchain; submission is not a confirmation.</Text><Button variant="outline" isDisabled={!!busy} onClick={() => run('Checking batch results', async () => { const api = await chain(); const record = progressRef.current.batch!; remember({ ...progressRef.current, batch: { ...record, rows: await api.checkBatch(api.connection(), record) } }); await refresh(); })}>Refresh transaction status</Button><Text fontSize="sm">This test project submits one buying batch. It never automatically creates replacement purchases after an uncertain or failed result.</Text></VStack>}
    </Box>

    {project && <Box overflowX="auto"><Heading size="md" mb={3}>Buying wallets</Heading><Table size="sm"><Thead><Tr><Th>Wallet</Th><Th>Address</Th><Th>Test SOL</Th><Th>Purchase status</Th></Tr></Thead><Tbody>{project.wallets.map((wallet, i) => { const address = wallet.publicKey.toBase58(); const row = batchRows?.find(item => item.address === address); return <Tr key={address}><Td>{i + 1}</Td><Td><Link href={explorer(address)} isExternal>{short(address)}</Link></Td><Td>{solBalances.length ? (solBalances[i + 1] / 1e9).toFixed(6) : 'Not checked'}</Td><Td>{row?.signature ? <Link href={explorer(row.signature, 'tx')} isExternal>{row.status}</Link> : row?.status || 'Not submitted'}{row?.message && <Text fontSize="sm" mt={1}>{row.message}</Text>}</Td></Tr>; })}</Tbody></Table></Box>}
    <Text fontSize="sm">Public launch progress and transaction signatures are saved in this browser. The encrypted backup restores keys; keep the public mint and pool addresses too when moving to another device. This version is for devnet testing and has no mainnet switch.</Text>
  </VStack>;
}
