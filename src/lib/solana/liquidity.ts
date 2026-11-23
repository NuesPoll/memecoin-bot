import { Connection, PublicKey, Signer, Transaction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, unpackAccount } from '@solana/spl-token';
import { DEVNET_PROGRAM_ID, Percent, TxVersion } from '@raydium-io/raydium-sdk-v2';
import BN from 'bn.js';
import { LiquidityIntent, TestProject, TransactionAttempt, assertDevnet, sdk, send } from './chain';
import { percentageAmount } from './plan';
import { safeLamports } from './treasury-plan';

export type LiquidityReview = LiquidityIntent & { mint: string; owner: string; lpMint: string; lpAccount: string; lpBalanceRaw: string; feeRaw: string; rentAllowanceRaw: string; percent: number; createdAt: number; used: boolean; built: { transaction: Transaction; signers: Signer[] } };
async function holding(rpc: Connection, project: TestProject, lpMint: PublicKey) {
  const account = getAssociatedTokenAddressSync(lpMint, project.treasury.publicKey);
  const data = await rpc.getAccountInfo(account, 'confirmed');
  if (!data) throw new Error('No unlocked LP tokens were found in the launch wallet’s associated account. Locked, burned or other-wallet LP cannot be removed here.');
  const value = unpackAccount(account, data, TOKEN_PROGRAM_ID);
  if (!value.owner.equals(project.treasury.publicKey) || !value.mint.equals(lpMint) || !value.isInitialized || value.isFrozen) throw new Error('The launch wallet LP holding could not be verified.');
  return { account, raw: value.amount.toString() };
}
export async function prepareLiquidityRemoval(rpc: Connection, project: TestProject, pool: string, percent: number, slippageBps: number): Promise<LiquidityReview> {
  await assertDevnet(rpc);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500) throw new Error('Choose slippage from 0.01% to 5%.');
  const program = DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM;
  const poolAccount = await rpc.getAccountInfo(new PublicKey(pool), 'confirmed');
  if (!poolAccount?.owner.equals(program)) throw new Error('Choose this project’s Raydium devnet CPMM pool.');
  const raydium = await sdk(rpc, project.treasury);
  const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(pool);
  const tokenIsA = poolInfo.mintA.address === project.mint.publicKey.toBase58();
  if (poolInfo.id !== pool || poolInfo.programId !== program.toBase58() || (tokenIsA ? poolInfo.mintA.address : poolInfo.mintB.address) !== project.mint.publicKey.toBase58() || (tokenIsA ? poolInfo.mintB.address : poolInfo.mintA.address) !== NATIVE_MINT.toBase58()) throw new Error('The pool must match your devnet project token/SOL pair.');
  const lpMint = new PublicKey(poolInfo.lpMint.address), balance = await holding(rpc, project, lpMint);
  const amount = percentageAmount(balance.raw, percent);
  await raydium.account.fetchWalletTokenAccounts();
  const built = await raydium.cpmm.withdrawLiquidity({ poolInfo, poolKeys, lpAmount: new BN(amount.toString()), slippage: new Percent(slippageBps, 10_000), closeWsol: true, txVersion: TxVersion.LEGACY });
  const discriminator = [183, 18, 70, 156, 148, 109, 161, 34];
  const withdrawals = built.transaction.instructions.filter(ix => ix.programId.equals(program) && ix.data.length >= 8 && ix.data.subarray(0, 8).every((byte, index) => byte === discriminator[index]));
  const ix = withdrawals[0];
  if (withdrawals.length !== 1 || ix.data.length !== 32 || !ix.keys[0]?.pubkey.equals(project.treasury.publicKey) || !ix.keys[2]?.pubkey.equals(new PublicKey(pool)) || !ix.keys[3]?.pubkey.equals(balance.account) || !ix.keys[10]?.pubkey.equals(new PublicKey(poolInfo.mintA.address)) || !ix.keys[11]?.pubkey.equals(new PublicKey(poolInfo.mintB.address)) || !ix.keys[12]?.pubkey.equals(lpMint) || ix.data.readBigUInt64LE(8) !== amount) throw new Error('The prepared liquidity instructions did not match your selected LP holding.');
  const a = ix.data.readBigUInt64LE(16), b = ix.data.readBigUInt64LE(24);
  if (a <= BigInt(0) || b <= BigInt(0)) throw new Error('This removal is too small to protect both returned amounts.');
  const signers = [...new Map([project.treasury, ...built.signers].map(signer => [signer.publicKey.toBase58(), signer])).values()];
  if (built.transaction.feePayer && !built.transaction.feePayer.equals(project.treasury.publicKey)) throw new Error('The removal must use your launch wallet as fee payer.');
  built.transaction.feePayer = project.treasury.publicKey;
  built.transaction.recentBlockhash = (await rpc.getLatestBlockhash('confirmed')).blockhash;
  const feeRaw = safeLamports((await rpc.getFeeForMessage(built.transaction.compileMessage(), 'confirmed')).value).toString();
  const rentAllowanceRaw = (safeLamports(await rpc.getMinimumBalanceForRentExemption(165)) * BigInt(2)).toString();
  return { pool, mint: project.mint.publicKey.toBase58(), owner: project.treasury.publicKey.toBase58(), lpMint: lpMint.toBase58(), lpAccount: balance.account.toBase58(), lpBalanceRaw: balance.raw, feeRaw, rentAllowanceRaw, lpAmountRaw: amount.toString(), minimumTokenRaw: (tokenIsA ? a : b).toString(), minimumSolRaw: (tokenIsA ? b : a).toString(), percent, createdAt: Date.now(), used: false, built: { transaction: built.transaction, signers } };
}
export async function submitLiquidityRemoval(rpc: Connection, project: TestProject, review: LiquidityReview, track: (attempt: TransactionAttempt | undefined) => void) {
  await assertDevnet(rpc);
  if (review.used) throw new Error('This liquidity review was already used. Check its signature before preparing another.');
  if (Date.now() - review.createdAt > 30_000) throw new Error('The liquidity review expired. Preview fresh amounts.');
  if (review.owner !== project.treasury.publicKey.toBase58() || review.mint !== project.mint.publicKey.toBase58()) throw new Error('This liquidity review belongs to another project.');
  review.used = true;
  const balance = await holding(rpc, project, new PublicKey(review.lpMint));
  if (balance.account.toBase58() !== review.lpAccount || BigInt(balance.raw) < BigInt(review.lpAmountRaw)) throw new Error('Your LP balance changed. Preview the removal again.');
  const rent = await rpc.getMinimumBalanceForRentExemption(165);
  const intent: LiquidityIntent = { pool: review.pool, lpAmountRaw: review.lpAmountRaw, minimumTokenRaw: review.minimumTokenRaw, minimumSolRaw: review.minimumSolRaw };
  return send(rpc, review.built.transaction, review.built.signers, rent * 2, 'liquidity', attempt => track(attempt ? { ...attempt, liquidity: intent } : undefined));
}
