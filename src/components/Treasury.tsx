import { useState } from 'react';
import { Alert, AlertIcon, Box, Button, Checkbox, FormControl, FormLabel, HStack, Input, Link, Table, Tbody, Td, Th, Thead, Tr, Text, VStack } from '@chakra-ui/react';
import type { TestProject } from '@/lib/solana/chain';
import type { CollectionReview } from '@/lib/solana/treasury';
import { CollectionRecord, collectionUnresolved } from '@/lib/solana/treasury-plan';
import { formatUnits } from '@/lib/solana/plan';
import { CopyAddress } from './WorkspaceTools';
import { StudioIcon, StudioView } from './StudioChrome';

type Props = { project: TestProject | null; destination?: string; disabled: boolean; busy: boolean; records: CollectionRecord[]; run: (label: string, task: () => Promise<void>) => Promise<void>; record: (next: CollectionRecord) => void; saveDestination: (address: string) => void; refresh: () => Promise<void>; navigate: (view: StudioView) => void };
const explorer = (signature: string) => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
export default function Treasury({ project, destination = '', disabled, busy, records, run, record, saveDestination, refresh, navigate }: Props) {
  const [address, setAddress] = useState(destination);
  const [includeLaunch, setIncludeLaunch] = useState(true);
  const [reserve, setReserve] = useState('0.001');
  const [review, setReview] = useState<CollectionReview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const unresolved = collectionUnresolved(records);
  const invalidate = () => { setReview(null); setAccepted(false); setMessage(''); };
  const total = review?.rows.reduce((sum, row) => sum + BigInt(row.amountRaw), BigInt(0));
  const fees = review?.rows.reduce((sum, row) => sum + BigInt(row.feeRaw), BigInt(0));
  async function preview() {
    if (!project) return;
    invalidate();
    const [api, chain] = await Promise.all([import('@/lib/solana/treasury'), import('@/lib/solana/chain')]);
    const next = await api.prepareCollection(chain.connection(), project, address, includeLaunch, reserve);
    saveDestination(next.destination); setAddress(next.destination); setReview(next);
  }
  async function submit() {
    if (!project || !review || !accepted) return;
    setAccepted(false);
    const [api, chain] = await Promise.all([import('@/lib/solana/treasury'), import('@/lib/solana/chain')]);
    try {
      const result = await api.submitCollection(chain.connection(), project, review, record);
      const confirmed = result.rows.filter(row => row.status === 'confirmed').length;
      setReview(null); setMessage(`${confirmed} of ${result.rows.length} collection transfers confirmed. Check results below; submitted or unknown is not confirmation.`);
    } catch (failure) { setReview(null); throw failure; }
    await refresh(); // A refresh failure cannot change the persisted transfer results.
  }
  return <div className="np-treasury">
    <section className="np-treasury-intro"><div><span className="np-overline">YOUR DESTINATION. YOUR CONTROL.</span><h2>Bring it back<br/><em>to one wallet.</em></h2><p>Review and collect available test SOL from your wallet group. You choose the receiving address and what stays behind.</p></div><div className="np-treasury-orb" aria-hidden="true"><StudioIcon name="treasury"/><span>41 → 1</span></div></section>
    <div className="np-treasury-layout"><Box className="np-panel"><div className="np-section-heading"><h2>Receiving wallet</h2><span>Devnet collection</span></div>
      <Text mb={5}>Paste your public Solana wallet address. No seed phrase, private key or wallet connection is needed for the receiving wallet.</Text>
      {!project && <Alert mb={4} status="info"><AlertIcon /><VStack align="stretch"><Text>Unlock your existing vault and save its backup to preview a collection.</Text><Button variant="link" alignSelf="start" onClick={() => navigate('wallets')}>Open Wallet manager</Button></VStack></Alert>}
      <VStack spacing={4} align="stretch"><FormControl><FormLabel htmlFor="collection-destination">Your receiving Solana wallet address</FormLabel><Input id="collection-destination" value={address} autoComplete="off" spellCheck={false} placeholder="Paste a public Solana address" isDisabled={busy} onChange={event => { setAddress(event.target.value); invalidate(); }}/></FormControl>
      <FormControl><FormLabel htmlFor="collection-reserve">Leave test SOL in each source wallet</FormLabel><Input id="collection-reserve" value={reserve} inputMode="decimal" isDisabled={busy} onChange={event => { setReserve(event.target.value); invalidate(); }}/><Text fontSize="sm" mt={2}>Default: 0.001 test SOL. Use 0 to collect the maximum after network fees; emptied wallets need test SOL before later transactions.</Text></FormControl>
      <Checkbox isChecked={includeLaunch} isDisabled={busy} onChange={event => { setIncludeLaunch(event.target.checked); invalidate(); }}>Include the launch wallet alongside the 40 buying wallets</Checkbox>
      {unresolved && <Alert status="warning"><AlertIcon /><Text>A previous collection needs a status check. Refresh its results below before creating another transfer.</Text></Alert>}
      <Button className="np-primary" isDisabled={!project || disabled || unresolved || !address.trim()} onClick={() => run('Previewing collection balances and fees', preview)}>Preview collection</Button>
      </VStack>
    </Box><aside className="np-panel np-treasury-summary"><StudioIcon name="shield"/><h3>Know what moves.</h3><dl><div><dt>Available test SOL</dt><dd>{total === undefined ? 'Preview to check' : formatUnits(total.toString(), 9)}</dd></div><div><dt>Estimated network fees</dt><dd>{fees === undefined ? 'Preview to check' : `${formatUnits(fees.toString(), 9)} test SOL`}</dd></div><div><dt>Source wallets</dt><dd>{review ? `${review.rows.length} transferable / ${review.skipped} skipped` : includeLaunch ? 'Up to 41 wallets' : 'Up to 40 wallets'}</dd></div></dl><p>Balances can include your original funding and sale proceeds. They are not a profit calculation.</p><p>Unsold project tokens, pool liquidity and token-account rent stay where they are. Sell tokens separately in Trading if you want their SOL proceeds included.</p><button className="np-text-action" onClick={() => navigate('trading')}>Open holdings and selling <StudioIcon name="arrow"/></button></aside></div>
    {review && <section className="np-panel np-collection-review"><span className="np-overline">CHECK BEFORE YOU CONFIRM</span><h2>Collection review</h2><Text mt={3}>Receiving wallet — verify the full address:</Text><CopyAddress value={review.destination}/><Text mt={3}>Collect {formatUnits(total!.toString(), 9)} test SOL across {review.rows.length} separate transfers. Estimated fees: {formatUnits(fees!.toString(), 9)} test SOL. Reserve: {formatUnits(review.reserveRaw, 9)} per source wallet. Review expires in 60 seconds.</Text><Box mt={4} overflowX="auto"><Table size="sm"><Thead><Tr><Th>Source wallet</Th><Th>Test SOL to send</Th><Th>Network fee</Th></Tr></Thead><Tbody>{review.rows.map(row => <Tr key={row.address}><Td><code>{row.address}</code></Td><Td>{formatUnits(row.amountRaw, 9)}</Td><Td>{formatUnits(row.feeRaw, 9)}</Td></Tr>)}</Tbody></Table></Box><VStack mt={5} align="stretch" spacing={4}><Checkbox isChecked={accepted} isDisabled={busy} onChange={event => setAccepted(event.target.checked)}>I checked the full receiving address and amounts. This sends devnet test SOL; transfers cannot be undone and may complete independently.</Checkbox><HStack flexWrap="wrap"><Button className="np-primary" isDisabled={disabled || unresolved || !accepted || review.used} onClick={() => run('Submitting reviewed collection', submit)}>Confirm test SOL collection</Button><Button variant="ghost" isDisabled={busy} onClick={invalidate}>Cancel review</Button></HStack></VStack></section>}
    {message && <Alert status="info"><AlertIcon /><Text>{message}</Text></Alert>}
    <section className="np-panel"><div className="np-section-heading"><h2>Collection history</h2><span>Verified signatures</span></div>{!records.length ? <div className="np-empty"><StudioIcon name="treasury"/><h3>Your collections will appear here</h3><p>Preview and confirm a transfer to record its destination, amount and blockchain result.</p></div> : records.slice().reverse().map(item => <div className="np-collection-record" key={item.rows[0].signature}><Text fontWeight="600">{new Date(item.createdAt).toLocaleString()} · {item.rows.filter(row => row.status === 'confirmed').length}/{item.rows.length} confirmed</Text><Text fontSize="sm" overflowWrap="anywhere">To: {item.destination}</Text><Button mt={3} mb={3} size="sm" variant="outline" isDisabled={busy || !project} onClick={() => run('Checking collection signatures', async () => { const [api, chain] = await Promise.all([import('@/lib/solana/treasury'), import('@/lib/solana/chain')]); record(await api.checkCollection(chain.connection(), item)); await refresh(); })}>Refresh collection results</Button><Box overflowX="auto"><Table size="sm"><Thead><Tr><Th>Source</Th><Th>Test SOL</Th><Th>Status</Th></Tr></Thead><Tbody>{item.rows.map(row => <Tr key={row.signature}><Td><code>{row.address}</code></Td><Td>{formatUnits(row.amountRaw, 9)}</Td><Td><Link href={explorer(row.signature)} isExternal>{row.status === 'not_sent' ? 'Not sent' : row.status}</Link></Td></Tr>)}</Tbody></Table></Box></div>)}<Text mt={4} fontSize="sm">Unknown results never trigger replacement transfers. Keep this browser and save a fresh encrypted project backup after collection. History keeps the latest 10 collection groups and preserves unresolved groups.</Text></section>
  </div>;
}
