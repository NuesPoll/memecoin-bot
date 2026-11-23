import { useState } from 'react';
import { Alert, AlertIcon, Box, Button, Checkbox, FormControl, FormLabel, Heading, HStack, Input, Link, Select, SimpleGrid, Table, Tbody, Td, Text, Th, Thead, Tr, VStack } from '@chakra-ui/react';
import type { SaleRecord, SellReview, TestProject, TokenHolding, TransactionAttempt } from '@/lib/solana/chain';
import { formatUnits } from '@/lib/solana/plan';

type Props = {
  project: TestProject | null; pool?: string; disabled: boolean; busy: boolean;
  holdings: TokenHolding[]; blockedWallets: string[]; sales: SaleRecord[];
  run: (label: string, task: () => Promise<void>) => Promise<void>;
  track: (pending: TransactionAttempt | undefined) => void;
  record: (sale: SaleRecord) => void; refresh: () => Promise<void>;
};
const explorer = (signature: string) => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;

export default function WalletTrading({ project, pool, disabled, busy, holdings, blockedWallets, sales, run, track, record, refresh }: Props) {
  const [walletIndex, setWalletIndex] = useState('0');
  const [percent, setPercent] = useState('25');
  const [slippage, setSlippage] = useState('1');
  const [review, setReview] = useState<SellReview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const selected = project?.wallets[Number(walletIndex)];
  const address = selected?.publicKey.toBase58();
  const holding = holdings.find(row => row.address === address);
  const unresolvedBuy = !!address && blockedWallets.includes(address);
  const unresolvedSale = sales.some(sale => sale.status === 'unknown' && sale.sale?.walletAddress === address);
  const unavailable = disabled || !project || !pool || unresolvedBuy || unresolvedSale;
  function invalidate() { setReview(null); setAccepted(false); setMessage(''); }

  async function preview() {
    if (!project || !pool) return;
    invalidate();
    const api = await import('@/lib/solana/chain');
    const next = await api.prepareSell(api.connection(), project, pool, Number(walletIndex), Number(percent), Math.round(Number(slippage) * 100));
    setReview(next);
  }
  async function submit() {
    if (!project || !review || !accepted) return;
    const api = await import('@/lib/solana/chain');
    let attempt: TransactionAttempt | undefined;
    let cleared = false;
    setAccepted(false);
    try {
      const signature = await api.submitSell(api.connection(), project, review, next => {
        if (next) { attempt = next; record({ ...next, status: 'unknown' }); }
        else cleared = true;
        track(next);
      });
      if (attempt) record({ ...attempt, status: 'confirmed' });
      setReview(null); setMessage(`Sale confirmed on devnet. Signature: ${signature}`);
    } catch (failure) {
      if (attempt) record({ ...attempt, status: cleared ? 'failed' : 'unknown' });
      setReview(null);
      throw failure;
    }
    // A failed balance refresh must not relabel a confirmed sale as failed.
    await refresh();
  }

  return <Box className="np-panel">
    <Heading size="md">Wallet holdings and selling</Heading>
    <Text mt={3}>Preview and confirm one devnet sale from a selected buying wallet. These controls submit test-network transactions; each sale requires a fresh review.</Text>
    {!project ? <Text mt={3}>Unlock your existing vault to view holdings and choose a wallet.</Text> : <>
      {!pool && <Text mt={3}>Create or recover your trading pool before previewing a sale.</Text>}
      <SimpleGrid mt={4} columns={{ base: 1, md: 3 }} spacing={4}>
        <FormControl><FormLabel htmlFor="sell-wallet">Buying wallet</FormLabel><Select id="sell-wallet" value={walletIndex} isDisabled={busy} onChange={event => { setWalletIndex(event.target.value); invalidate(); }}>{project.wallets.map((wallet, index) => <option key={wallet.publicKey.toBase58()} value={index}>Wallet {index + 1}</option>)}</Select></FormControl>
        <FormControl><FormLabel htmlFor="sell-percent">Tokens to sell (%)</FormLabel><Select id="sell-percent" value={percent} isDisabled={busy} onChange={event => { setPercent(event.target.value); invalidate(); }}><option value="25">25%</option><option value="50">50%</option><option value="100">100%</option></Select></FormControl>
        <FormControl><FormLabel htmlFor="sell-slippage">Sale slippage (%)</FormLabel><Input id="sell-slippage" type="number" min="0.01" max="5" step="0.01" value={slippage} isDisabled={busy} onChange={event => { setSlippage(event.target.value); invalidate(); }} /></FormControl>
      </SimpleGrid>
      <Text mt={3} overflowWrap="anywhere">Selected wallet: {address}</Text>
      <Text mt={2}>Project tokens: {holding ? formatUnits(holding.rawAmount, 6) : 'Refresh balances to check'}{holding?.frozen ? ' (frozen)' : ''}</Text>
      {unresolvedBuy && <Alert mt={3} status="warning"><AlertIcon />Check this wallet&apos;s buying-batch status before preparing a sale.</Alert>}
      {unresolvedSale && <Alert mt={3} status="warning"><AlertIcon />This wallet has an unresolved sale. Refresh sale history before preparing another.</Alert>}
      <HStack mt={4} flexWrap="wrap"><Button isDisabled={unavailable} onClick={() => run('Preparing sale review', preview)}>Preview sale</Button><Button variant="outline" isDisabled={busy} onClick={() => run('Refreshing wallet holdings', refresh)}>Refresh holdings</Button></HStack>
      {review && <VStack align="stretch" mt={4} spacing={3}>
        <Alert status="info"><AlertIcon /><Text>Wallet {review.walletIndex + 1}: sell exactly {formatUnits(review.tokenAmountRaw, 6)} project tokens ({review.percent}% at preview time). Estimated output: {formatUnits(review.expectedSolRaw, 9)} test SOL; minimum: {formatUnits(review.minimumSolRaw, 9)} test SOL before network fees. Slippage limit: {review.slippageBps / 100}%. This quote expires 30 seconds after preparation starts.</Text></Alert>
        <Checkbox isChecked={accepted} isDisabled={busy} onChange={event => setAccepted(event.target.checked)}>I reviewed the wallet, token amount, minimum received and fees for this devnet sale.</Checkbox>
        <Button className="np-primary" colorScheme="purple" isDisabled={unavailable || !accepted || review.used} onClick={() => run('Submitting reviewed sale', submit)}>Confirm devnet sale</Button>
      </VStack>}
    </>}
    {message && <Alert mt={3} status="success"><AlertIcon /><Text overflowWrap="anywhere">{message}</Text></Alert>}
    {sales.length > 0 && <Box mt={4} overflowX="auto"><Heading size="sm" mb={3}>Sale history</Heading><Button mb={3} variant="outline" isDisabled={busy || !project} onClick={() => run('Checking recorded sales', async () => { const api = await import('@/lib/solana/chain'); const checked = await api.checkSaleHistory(api.connection(), sales); checked.forEach(record); setMessage('Recorded sale signatures checked against devnet. Unknown results remain paused.'); })}>Refresh sale history</Button><Table size="sm"><Thead><Tr><Th>Wallet</Th><Th>Token amount</Th><Th>Minimum test SOL</Th><Th>Transaction status</Th></Tr></Thead><Tbody>{sales.slice().reverse().map(sale => <Tr key={sale.signature}><Td overflowWrap="anywhere">{sale.sale?.walletAddress}</Td><Td>{sale.sale ? formatUnits(sale.sale.tokenAmountRaw, 6) : '-'}</Td><Td>{sale.sale ? formatUnits(sale.sale.minimumSolRaw, 9) : '-'}</Td><Td><Link href={explorer(sale.signature)} isExternal>{sale.status}</Link></Td></Tr>)}</Tbody></Table><Text fontSize="sm" mt={3}>Refresh sale history to recheck imported or unknown results. No sale is automatically repeated. Only confirmed rows indicate completed sales; failed transactions may still use network fees.</Text></Box>}
  </Box>;
}
