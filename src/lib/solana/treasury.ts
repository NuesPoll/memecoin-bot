import { Connection, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { assertDevnet, TestProject } from './chain';
import { CollectionRecord, CollectionStatus, reserveAmount, safeLamports } from './treasury-plan';
import { formatUnits } from './plan';

export type CollectionReview = { mint: string; destination: string; reserveRaw: string; createdAt: number; used: boolean; includeLaunch: boolean; skipped: number; rows: { address: string; amountRaw: string; feeRaw: string }[] };
const owners = (project: TestProject, includeLaunch: boolean) => includeLaunch ? [project.treasury, ...project.wallets] : project.wallets;
function recipient(project: TestProject, value: string) {
  let key: PublicKey;
  try { key = new PublicKey(value.trim()); } catch { throw new Error('Enter a valid Solana receiving wallet address.'); }
  if (!PublicKey.isOnCurve(key.toBytes()) || key.equals(PublicKey.default) || [project.mint, project.treasury, ...project.wallets].some(owner => owner.publicKey.equals(key))) throw new Error('Choose an external receiving wallet, not a program, mint or one of this project’s wallets.');
  return key;
}
function normalAccount(account: Awaited<ReturnType<Connection['getAccountInfo']>>) {
  if (account && (!account.owner.equals(SystemProgram.programId) || account.executable || account.data.length !== 0)) throw new Error('Collection supports ordinary SOL wallet accounts only. Nothing was submitted.');
  return safeLamports(account?.lamports ?? 0);
}
function transfer(from: PublicKey, to: PublicKey, amount: bigint, blockhash: string) {
  const tx = new Transaction({ feePayer: from, recentBlockhash: blockhash });
  tx.add(SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports: amount }));
  return tx;
}
async function snapshot(rpc: Connection, project: TestProject, destination: PublicKey, includeLaunch: boolean) {
  const sources = owners(project, includeLaunch);
  const [accounts, block, minimum] = await Promise.all([rpc.getMultipleAccountsInfo([...sources.map(owner => owner.publicKey), destination], 'confirmed'), rpc.getLatestBlockhash('confirmed'), rpc.getMinimumBalanceForRentExemption(0)]);
  if (accounts.length !== sources.length + 1) throw new Error('The balance response was incomplete. Nothing was submitted.');
  const balances = accounts.map(normalAccount);
  // All transfers have the same fee shape: one signature, one System Program instruction, no priority fee.
  const fee = safeLamports((await rpc.getFeeForMessage(transfer(sources[0].publicKey, destination, BigInt(1), block.blockhash).compileMessage(), 'confirmed')).value);
  if (fee <= BigInt(0)) throw new Error('The network could not estimate a positive transfer fee. Nothing was submitted.');
  return { sources, balances, block, fee, minimum: safeLamports(minimum) };
}
export async function prepareCollection(rpc: Connection, project: TestProject, destination: string, includeLaunch: boolean, reserveSol: string): Promise<CollectionReview> {
  await assertDevnet(rpc);
  const to = recipient(project, destination), reserve = reserveAmount(reserveSol);
  const state = await snapshot(rpc, project, to, includeLaunch);
  if (reserve > BigInt(0) && reserve < state.minimum) throw new Error(`Leave either 0 or at least ${formatUnits(state.minimum.toString(), 9)} test SOL per wallet to meet the account minimum.`);
  const rows = state.sources.flatMap((source, i) => {
    const amount = state.balances[i] - state.fee - reserve;
    return amount > BigInt(0) ? [{ address: source.publicKey.toBase58(), amountRaw: amount.toString(), feeRaw: state.fee.toString() }] : [];
  }).sort((a, b) => BigInt(a.amountRaw) > BigInt(b.amountRaw) ? -1 : 1);
  if (!rows.length) throw new Error('No wallet has spendable test SOL after the fee and chosen reserve. Refresh balances or lower the reserve.');
  if (state.balances[state.sources.length] + BigInt(rows[0].amountRaw) < state.minimum) throw new Error('The receiving wallet needs more devnet SOL to meet its account minimum. Fund that address with the devnet faucet, then preview again.');
  return { mint: project.mint.publicKey.toBase58(), destination: to.toBase58(), reserveRaw: reserve.toString(), createdAt: Date.now(), used: false, includeLaunch, skipped: state.sources.length - rows.length, rows };
}
export async function checkCollection(rpc: Connection, record: CollectionRecord): Promise<CollectionRecord> {
  await assertDevnet(rpc);
  const statuses = (await rpc.getSignatureStatuses(record.rows.map(row => row.signature), { searchTransactionHistory: true })).value;
  if (statuses.length !== record.rows.length) throw new Error('Collection status response was incomplete. Check again; nothing was repeated.');
  return { ...record, rows: record.rows.map((row, i) => ({ ...row, status: statuses[i]?.err ? 'failed' : statuses[i]?.confirmationStatus === 'confirmed' || statuses[i]?.confirmationStatus === 'finalized' ? 'confirmed' : row.status === 'not_sent' || row.status === 'ready' ? 'not_sent' : 'unknown' })) };
}
export async function submitCollection(rpc: Connection, project: TestProject, review: CollectionReview, persist: (record: CollectionRecord) => void) {
  await assertDevnet(rpc);
  if (review.used) throw new Error('This collection review was already used. Check its results before preparing another.');
  if (Date.now() - review.createdAt > 60_000) throw new Error('The collection review expired. Preview fresh balances and fees.');
  if (review.mint !== project.mint.publicKey.toBase58()) throw new Error('This collection belongs to a different project.');
  const to = recipient(project, review.destination);
  review.used = true; // Consume before awaiting balances; concurrent clicks cannot reuse the review.
  const state = await snapshot(rpc, project, to, review.includeLaunch);
  const reserve = reserveAmount(formatUnits(review.reserveRaw, 9));
  if (reserve > BigInt(0) && reserve < state.minimum) throw new Error('The account minimum changed. Preview the collection again.');
  if (!review.rows.length || new Set(review.rows.map(row => row.address)).size !== review.rows.length) throw new Error('Preview a collection with distinct source wallets.');
  const signed = review.rows.map(row => {
    const index = state.sources.findIndex(owner => owner.publicKey.toBase58() === row.address);
    if (index < 0 || !/^\d{1,20}$/.test(row.amountRaw) || BigInt(row.amountRaw) <= BigInt(0) || state.fee !== BigInt(row.feeRaw) || state.balances[index] < BigInt(row.amountRaw) + state.fee + reserve) throw new Error('A balance or fee changed. Preview the collection again; nothing was submitted.');
    const remainder = state.balances[index] - BigInt(row.amountRaw) - state.fee;
    if (remainder !== BigInt(0) && remainder < state.minimum) throw new Error('A wallet would be left below its account minimum. Preview again with a fee reserve.');
    const tx = transfer(state.sources[index].publicKey, to, BigInt(row.amountRaw), state.block.blockhash);
    tx.sign(state.sources[index]);
    return { address: row.address, amountRaw: row.amountRaw, feeRaw: state.fee.toString(), signature: bs58.encode(Uint8Array.from(tx.signature!)), bytes: tx.serialize() };
  }).sort((a, b) => BigInt(a.amountRaw) > BigInt(b.amountRaw) ? -1 : 1);
  const needsFirstConfirmation = state.balances[state.sources.length] < state.minimum;
  if (needsFirstConfirmation && state.balances[state.sources.length] + BigInt(signed[0].amountRaw) < state.minimum) throw new Error('The receiving wallet balance changed. Fund it with devnet SOL and preview again.');
  let record: CollectionRecord = { mint: review.mint, destination: to.toBase58(), reserveRaw: reserve.toString(), createdAt: Date.now(), lastValidBlockHeight: state.block.lastValidBlockHeight, rows: signed.map(({ bytes: _bytes, ...row }) => ({ ...row, status: 'ready' })) };
  persist(record); // Persist every signature before any broadcast. Persistence errors abort sending.
  const update = (i: number, status: CollectionStatus) => { record = { ...record, rows: record.rows.map((row, n) => n === i ? { ...row, status } : row) }; persist(record); };
  const send = async (i: number) => {
    update(i, 'unknown'); // A crash after this point is treated as potentially accepted.
    try {
      const signature = await rpc.sendRawTransaction(signed[i].bytes, { skipPreflight: false, maxRetries: 2 });
      if (signature !== signed[i].signature) throw new Error('Signature mismatch');
    } catch { return; /* Keep the known signature as unknown. Never create a replacement transfer. */ }
    update(i, 'submitted');
  };
  let start = 0;
  if (needsFirstConfirmation) {
    await send(0); start = 1;
    let confirmed = false;
    for (let n = 0; n < 15; n++) {
      const checked = await checkCollection(rpc, record); const first = checked.rows[0].status;
      if (first === 'confirmed' || first === 'failed') { update(0, first); confirmed = first === 'confirmed'; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!confirmed) { for (let i = 1; i < signed.length; i++) update(i, 'not_sent'); return record; }
  }
  // Bound parallel requests to avoid overwhelming the public devnet relay.
  for (let i = start; i < signed.length; i += 4) {
    const wave = await Promise.allSettled(signed.slice(i, i + 4).map((_, n) => send(i + n)));
    if (wave.some(result => result.status === 'rejected')) throw new Error('Saving collection progress failed. New sends stopped; keep this browser open and check the recorded signatures.');
  }
  record = await checkCollection(rpc, record); persist(record); return record;
}
