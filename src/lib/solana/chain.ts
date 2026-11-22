import { Connection, Keypair, PublicKey, Signer, SystemProgram, Transaction } from '@solana/web3.js';
import { AuthorityType, ExtensionType, LENGTH_SIZE, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, TYPE_SIZE, createAssociatedTokenAccountIdempotentInstruction, createInitializeMetadataPointerInstruction, createInitializeMintInstruction, createMintToInstruction, createSetAuthorityInstruction, getAssociatedTokenAddressSync, getMintLen } from '@solana/spl-token';
import { createInitializeInstruction, pack } from '@solana/spl-token-metadata';
import { CurveCalculator, DEVNET_PROGRAM_ID, DEV_API_URLS, FeeOn, Raydium, TxVersion, getCpmmPdaAmmConfigId } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import bs58 from 'bs58';
import { DEVNET_GENESIS, WALLET_COUNT, WalletResult, batchBudget, submitWave, validateLaunch } from './plan';

export type TestProject = { treasury: Keypair; mint: Keypair; wallets: Keypair[] };
export type LaunchInput = { name: string; symbol: string; supply: string; poolTokens: string; poolSol: string };
export type BatchRecord = { rows: WalletResult[]; lastValidBlockHeight: number };
type BuiltTransaction = { transaction: Transaction; signers: Signer[] };

export function generateProject(): TestProject {
  return { treasury: Keypair.generate(), mint: Keypair.generate(), wallets: Array.from({ length: WALLET_COUNT }, () => Keypair.generate()) };
}
export function serializeProject(project: TestProject) {
  return JSON.stringify({ network: 'devnet', treasury: Array.from(project.treasury.secretKey), mint: Array.from(project.mint.secretKey), wallets: project.wallets.map(wallet => Array.from(wallet.secretKey)) });
}
export function restoreProject(plaintext: string): TestProject {
  const value = JSON.parse(plaintext);
  if (value.network !== 'devnet' || !Array.isArray(value.wallets) || value.wallets.length !== WALLET_COUNT) throw new Error('A devnet project with exactly 40 buying wallets is required.');
  const restore = (bytes: unknown) => {
    if (!Array.isArray(bytes) || bytes.length !== 64 || !bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('Invalid encrypted wallet record.');
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  };
  const project = { treasury: restore(value.treasury), mint: restore(value.mint), wallets: value.wallets.map(restore) };
  if (new Set([project.treasury, project.mint, ...project.wallets].map(wallet => wallet.publicKey.toBase58())).size !== 42) throw new Error('Wallet records must be distinct.');
  return project;
}

export function connection() {
  return new Connection(`${window.location.origin}/api/solana/rpc`, { commitment: 'confirmed', disableRetryOnRateLimit: true });
}
export async function assertDevnet(rpc: Connection) {
  if (await rpc.getGenesisHash() !== DEVNET_GENESIS) throw new Error('Devnet verification failed. Real-money networks are disabled.');
}

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitForSignature(rpc: Connection, signature: string) {
  for (let attempt = 0; attempt < 35; attempt++) {
    const result = (await rpc.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
    if (result?.err) throw new Error(`Transaction failed. Inspect ${signature} on the devnet explorer.`);
    if (result?.confirmationStatus === 'confirmed' || result?.confirmationStatus === 'finalized') return signature;
    await pause(2000);
  }
  throw new Error(`Confirmation is still unknown. Check ${signature} before trying again.`);
}

async function send(rpc: Connection, tx: Transaction, signers: Signer[]) {
  await assertDevnet(rpc);
  tx.feePayer ??= signers[0].publicKey;
  tx.recentBlockhash = (await rpc.getLatestBlockhash('confirmed')).blockhash;
  tx.sign(...signers);
  const signature = bs58.encode(tx.signature!);
  try { await rpc.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 }); }
  catch { throw new Error(`Submission may have failed. Check ${signature} on devnet before trying again.`); }
  return waitForSignature(rpc, signature);
}

export async function balances(rpc: Connection, project: TestProject) {
  await assertDevnet(rpc);
  const rows = await rpc.getMultipleAccountsInfo([project.treasury.publicKey, ...project.wallets.map(wallet => wallet.publicKey)]);
  return rows.map(account => account?.lamports || 0);
}

export async function requestTestSol(rpc: Connection, project: TestProject) {
  await assertDevnet(rpc);
  const signature = await rpc.requestAirdrop(project.treasury.publicKey, 2_000_000_000);
  return waitForSignature(rpc, signature);
}

export async function createToken(rpc: Connection, project: TestProject, input: LaunchInput) {
  await assertDevnet(rpc);
  const amounts = validateLaunch(input.name, input.symbol, input.supply, input.poolTokens, input.poolSol);
  if (await rpc.getAccountInfo(project.mint.publicKey)) throw new Error('This project mint already exists. Restore its public progress instead of creating it again.');
  const uri = `${window.location.origin}/api/solana/metadata?name=${encodeURIComponent(input.name.trim())}&symbol=${encodeURIComponent(input.symbol)}`;
  if (uri.length > 200) throw new Error('The metadata URL is too long; use a shorter token name.');
  const metadata = { updateAuthority: project.treasury.publicKey, mint: project.mint.publicKey, name: input.name.trim(), symbol: input.symbol, uri, additionalMetadata: [] };
  const mintSpace = getMintLen([ExtensionType.MetadataPointer]);
  const rent = await rpc.getMinimumBalanceForRentExemption(mintSpace + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length);
  const owner = project.treasury.publicKey;
  const mint = project.mint.publicKey;
  const ata = getAssociatedTokenAddressSync(mint, owner, false, TOKEN_2022_PROGRAM_ID);
  const tx = new Transaction().add(
    SystemProgram.createAccount({ fromPubkey: owner, newAccountPubkey: mint, space: mintSpace, lamports: rent, programId: TOKEN_2022_PROGRAM_ID }),
    createInitializeMetadataPointerInstruction(mint, owner, mint, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, 6, owner, null, TOKEN_2022_PROGRAM_ID),
    createInitializeInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: owner, mint, mintAuthority: owner, name: metadata.name, symbol: metadata.symbol, uri }),
    createAssociatedTokenAccountIdempotentInstruction(owner, ata, owner, mint, TOKEN_2022_PROGRAM_ID),
    createMintToInstruction(mint, ata, owner, amounts.total, [], TOKEN_2022_PROGRAM_ID),
    createSetAuthorityInstruction(mint, owner, AuthorityType.MintTokens, null, [], TOKEN_2022_PROGRAM_ID),
  );
  return send(rpc, tx, [project.treasury, project.mint]);
}

async function sdk(rpc: Connection, owner: Keypair) {
  return Raydium.load({ owner, connection: rpc, cluster: 'devnet', disableLoadToken: true, disableFeatureCheck: true, blockhashCommitment: 'confirmed', urlConfigs: { ...DEV_API_URLS, BASE_HOST: 'https://api-v3-devnet.raydium.io', OWNER_BASE_HOST: 'https://owner-v1-devnet.raydium.io', SWAP_HOST: 'https://transaction-v1-devnet.raydium.io' } });
}

export async function createPool(rpc: Connection, project: TestProject, input: LaunchInput, rememberPool: (address: string) => void) {
  await assertDevnet(rpc);
  const amounts = validateLaunch(input.name, input.symbol, input.supply, input.poolTokens, input.poolSol);
  const raydium = await sdk(rpc, project.treasury);
  const configs = await raydium.api.getCpmmConfigs();
  if (!configs.length) throw new Error('Raydium devnet fee configuration is unavailable.');
  const feeConfig = { ...configs[0], id: getCpmmPdaAmmConfigId(DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM, configs[0].index).publicKey.toBase58() };
  const built = await raydium.cpmm.createPool({
    programId: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_FEE_ACC,
    mintA: { address: project.mint.publicKey.toBase58(), programId: TOKEN_2022_PROGRAM_ID.toBase58(), decimals: 6 },
    mintB: { address: NATIVE_MINT.toBase58(), programId: TOKEN_PROGRAM_ID.toBase58(), decimals: 9 },
    mintAAmount: new BN(amounts.liquidity.toString()), mintBAmount: new BN(amounts.sol.toString()),
    startTime: new BN(0), feeConfig, associatedOnly: false, ownerInfo: { useSOLBalance: true }, txVersion: TxVersion.LEGACY,
  });
  const pool = built.extInfo.address.poolId.toBase58();
  rememberPool(pool);
  if (await rpc.getAccountInfo(new PublicKey(pool))) throw new Error('This pool already exists. Verify its state and continue to funding.');
  const signature = await send(rpc, built.transaction, built.signers);
  return { pool, signature };
}

export async function fundWallets(rpc: Connection, project: TestProject, amount: string) {
  await assertDevnet(rpc);
  const { perWallet } = batchBudget(amount, project.wallets.length, 100);
  // Reserve covers WSOL/token account rent and fees; unused test SOL stays in each wallet.
  const target = perWallet + BigInt(10_000_000);
  const current = (await balances(rpc, project)).slice(1);
  const transfers = project.wallets.map((wallet, i) => ({ wallet, needed: target - BigInt(current[i]) })).filter(row => row.needed > BigInt(0));
  const required = transfers.reduce((sum, row) => sum + row.needed, BigInt(0));
  const treasuryBalance = await rpc.getBalance(project.treasury.publicKey);
  if (required + BigInt(100_000) > BigInt(treasuryBalance)) throw new Error('The launch wallet needs more test SOL to fund all 40 buying wallets.');
  for (let i = 0; i < transfers.length; i += 8) {
    const tx = new Transaction();
    for (const { wallet, needed } of transfers.slice(i, i + 8)) tx.add(SystemProgram.transfer({ fromPubkey: project.treasury.publicKey, toPubkey: wallet.publicKey, lamports: needed }));
    await send(rpc, tx, [project.treasury]);
  }
}

export async function prepareBatch(rpc: Connection, project: TestProject, poolId: string, amount: string, slippageBps: number, onProgress: (done: number) => void) {
  await assertDevnet(rpc);
  const budget = batchBudget(amount, project.wallets.length, slippageBps);
  const raydium = await sdk(rpc, project.treasury);
  const { poolInfo, poolKeys, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  if (poolInfo.programId !== DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM.toBase58()) throw new Error('Choose a Raydium devnet CPMM pool.');
  const baseIn = poolInfo.mintA.address === NATIVE_MINT.toBase58();
  if ((baseIn ? poolInfo.mintB.address : poolInfo.mintA.address) !== project.mint.publicKey.toBase58() || (baseIn ? poolInfo.mintA.address : poolInfo.mintB.address) !== NATIVE_MINT.toBase58()) throw new Error('The pool must pair this project token with wrapped SOL.');
  const current = (await balances(rpc, project)).slice(1);
  if (current.some(value => BigInt(value) < budget.perWallet + BigInt(10_000_000))) throw new Error('Fund all 40 wallets before preparing a batch.');
  if (!rpcData.configInfo) throw new Error('Pool fee information is unavailable.');
  const config = rpcData.configInfo;
  const quote = (input: BN, inputReserve: BN, outputReserve: BN) => CurveCalculator.swapBaseInput(input, inputReserve, outputReserve, config.tradeFeeRate, config.creatorFeeRate, config.protocolFeeRate, config.fundFeeRate, rpcData.feeOn === FeeOn.BothToken || rpcData.feeOn === FeeOn.OnlyTokenB);
  const reserveIn = baseIn ? rpcData.baseReserve : rpcData.quoteReserve;
  const reserveOut = baseIn ? rpcData.quoteReserve : rpcData.baseReserve;
  // Each wallet is quoted conservatively as if the other 39 buys happened first.
  const otherBuys = quote(new BN((budget.total - budget.perWallet).toString()), reserveIn, reserveOut);
  const conservative = quote(new BN(budget.perWallet.toString()), otherBuys.newInputVaultAmount, otherBuys.newOutputVaultAmount);
  if (conservative.outputAmount.isZero()) throw new Error('The batch is too small for this pool.');
  const prepared: { address: string; built: BuiltTransaction }[] = [];
  for (const wallet of project.wallets) {
    raydium.setOwner(wallet);
    // Refresh account ownership after switching between independent signers.
    await raydium.account.fetchWalletTokenAccounts({ forceUpdate: true });
    const built = await raydium.cpmm.swap({ poolInfo, poolKeys, inputAmount: new BN(budget.perWallet.toString()), swapResult: conservative, baseIn, slippage: slippageBps / 10_000, txVersion: TxVersion.LEGACY, config: { associatedOnly: false } });
    prepared.push({ address: wallet.publicKey.toBase58(), built });
    onProgress(prepared.length);
  }
  return { prepared, minimumTokens: conservative.outputAmount.muln(10_000 - slippageBps).divn(10_000).toString(), amount, poolId, slippageBps, createdAt: Date.now() };
}
export type PreparedBatch = Awaited<ReturnType<typeof prepareBatch>>;

export async function submitBatch(rpc: Connection, batch: PreparedBatch, remember: (record: BatchRecord) => void, update: (result: WalletResult) => void) {
  await assertDevnet(rpc);
  if (Date.now() - batch.createdAt > 30_000) throw new Error('The reviewed quote expired. Prepare a fresh batch.');
  const block = await rpc.getLatestBlockhash('confirmed');
  const signed = batch.prepared.map(({ address, built }) => {
    built.transaction.recentBlockhash = block.blockhash;
    built.transaction.sign(...built.signers);
    return { address, bytes: built.transaction.serialize(), signature: bs58.encode(built.transaction.signature!) };
  });
  // Persist known signatures before broadcasting: uncertain responses must not cause duplicate buys.
  const rows: WalletResult[] = signed.map(item => ({ address: item.address, signature: item.signature, status: 'ready' }));
  remember({ rows, lastValidBlockHeight: block.lastValidBlockHeight });
  await submitWave(signed, async item => {
    const signature = await rpc.sendRawTransaction(item.bytes, { skipPreflight: false, maxRetries: 2 });
    if (signature !== item.signature) throw new Error('Signature mismatch');
    return signature;
  }, result => update({ ...result, signature: signed.find(item => item.address === result.address)!.signature }));
  return rows;
}

export async function checkBatch(rpc: Connection, record: BatchRecord) {
  await assertDevnet(rpc);
  const statuses = (await rpc.getSignatureStatuses(record.rows.map(row => row.signature!), { searchTransactionHistory: true })).value;
  const height = await rpc.getBlockHeight('confirmed');
  return record.rows.map((row, i): WalletResult => {
    const state = statuses[i];
    if (state?.err) return { ...row, status: 'failed', message: 'On-chain execution failed. No automatic resubmission.' };
    if (state?.confirmationStatus === 'confirmed' || state?.confirmationStatus === 'finalized') return { ...row, status: 'confirmed', message: undefined };
    return { ...row, status: 'unknown', message: height > record.lastValidBlockHeight ? 'Validity window ended. Inspect the explorer before any new purchase.' : 'Waiting for a confirmed on-chain result.' };
  });
}
