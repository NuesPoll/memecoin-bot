import type { BatchRecord, LaunchInput, LiquidityRecord, SaleRecord, TransactionAttempt } from './chain';
import { WALLET_COUNT } from './plan';
import { CollectionRecord, readCollections, rememberCollection } from './treasury-plan';

export type ProjectProgress = { input: LaunchInput; tokenCreated?: boolean; pool?: string; poolCreated?: boolean; batch?: BatchRecord; pending?: TransactionAttempt; backupAcknowledged?: boolean; sales?: SaleRecord[]; recoveryRequired?: boolean; historyMissing?: boolean; receivingAddress?: string; collections?: CollectionRecord[]; liquidityRemovals?: LiquidityRecord[] };
export type ProjectIdentity = { mintAddress: string; walletAddresses: string[]; launchAddress?: string };
const FORMAT = 'novapulse-workspace-v2';
const invalid = () => new Error('The project history is damaged or belongs to different wallets. Restore a valid backup; nothing was submitted.');
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || value.length > max) throw invalid();
  return value;
}
function address(value: unknown) {
  const result = text(value, 44);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(result)) throw invalid();
  return result;
}
function signature(value: unknown) {
  const result = text(value, 88);
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(result)) throw invalid();
  return result;
}
function height(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw invalid();
  return value;
}
function amount(value: unknown) {
  const result = text(value, 20);
  if (!/^\d+$/.test(result) || BigInt(result) < BigInt(1) || BigInt(result) > BigInt('18446744073709551615')) throw invalid();
  return result;
}

// Copy only known public fields. Never spread an untrusted journal into storage or a backup.
export function readProgress(value: unknown, identity: ProjectIdentity): ProjectProgress {
  const source = object(value), input = object(source.input);
  const wallets = new Set(identity.walletAddresses);
  const wallet = (value: unknown) => { const result = address(value); if (!wallets.has(result)) throw invalid(); return result; };
  const attempt = (value: unknown): TransactionAttempt => {
    const row = object(value);
    if (!['token', 'pool', 'funding', 'sell', 'liquidity'].includes(row.action as string)) throw invalid();
    const result: TransactionAttempt = { action: row.action as TransactionAttempt['action'], signature: signature(row.signature), lastValidBlockHeight: height(row.lastValidBlockHeight) };
    if (result.action === 'sell') {
      const sale = object(row.sale);
      result.sale = { walletAddress: wallet(sale.walletAddress), tokenAmountRaw: amount(sale.tokenAmountRaw), minimumSolRaw: amount(sale.minimumSolRaw) };
    }
    if (result.action === 'liquidity') {
      const liquidity = object(row.liquidity);
      result.liquidity = { pool: address(liquidity.pool), lpAmountRaw: amount(liquidity.lpAmountRaw), minimumTokenRaw: amount(liquidity.minimumTokenRaw), minimumSolRaw: amount(liquidity.minimumSolRaw) };
    }
    return result;
  };
  const result: ProjectProgress = { input: { name: text(input.name, 128), symbol: text(input.symbol, 32), supply: text(input.supply, 64), poolTokens: text(input.poolTokens, 64), poolSol: text(input.poolSol, 64) } };
  for (const key of ['tokenCreated', 'poolCreated', 'backupAcknowledged', 'recoveryRequired', 'historyMissing'] as const) {
    const value = source[key];
    if (value !== undefined) { if (typeof value !== 'boolean') throw invalid(); result[key] = value; }
  }
  if (source.pool !== undefined) result.pool = address(source.pool);
  if (source.receivingAddress !== undefined) result.receivingAddress = address(source.receivingAddress);
  if (source.collections !== undefined) result.collections = readCollections(source.collections, identity.mintAddress, [...identity.walletAddresses, ...(identity.launchAddress ? [identity.launchAddress] : [])]);
  if (source.pending !== undefined) result.pending = attempt(source.pending);
  if (result.pending?.action === 'liquidity' && result.pending.liquidity?.pool !== result.pool) throw invalid();
  if (source.batch !== undefined) {
    const batch = object(source.batch);
    if (!Array.isArray(batch.rows) || batch.rows.length !== WALLET_COUNT) throw invalid();
    const rows = batch.rows.map(value => {
      const row = object(value);
      if (!['ready', 'submitted', 'confirmed', 'failed', 'unknown'].includes(row.status as string)) throw invalid();
      const parsed: BatchRecord['rows'][number] = { address: wallet(row.address), status: row.status as BatchRecord['rows'][number]['status'] };
      parsed.signature = signature(row.signature);
      if (row.message !== undefined) parsed.message = text(row.message, 500);
      return parsed;
    });
    const signatures = rows.flatMap(row => row.signature ? [row.signature] : []);
    if (new Set(rows.map(row => row.address)).size !== WALLET_COUNT || new Set(signatures).size !== signatures.length) throw invalid();
    result.batch = { rows, lastValidBlockHeight: height(batch.lastValidBlockHeight) };
  }
  if (source.sales !== undefined) {
    if (!Array.isArray(source.sales) || source.sales.length > 100) throw invalid();
    result.sales = source.sales.map(value => {
      const row = object(value), parsed = attempt(row);
      if (parsed.action !== 'sell' || !['unknown', 'confirmed', 'failed', 'expired'].includes(row.status as string)) throw invalid();
      return { ...parsed, status: row.status as SaleRecord['status'] };
    });
    if (new Set(result.sales.map(row => row.signature)).size !== result.sales.length) throw invalid();
  }
  if (source.liquidityRemovals !== undefined) {
    if (!Array.isArray(source.liquidityRemovals) || source.liquidityRemovals.length > 20) throw invalid();
    result.liquidityRemovals = source.liquidityRemovals.map(value => {
      const row = object(value), parsed = attempt(row);
      if (parsed.action !== 'liquidity' || !['unknown', 'confirmed', 'failed', 'expired'].includes(row.status as string) || parsed.liquidity?.pool !== result.pool) throw invalid();
      return { ...parsed, status: row.status as LiquidityRecord['status'] };
    });
    if (new Set(result.liquidityRemovals.map(row => row.signature)).size !== result.liquidityRemovals.length) throw invalid();
  }
  return result;
}

export function backupPayload(serializedKeys: string, progress: ProjectProgress, identity: ProjectIdentity, savedAt: string) {
  return JSON.stringify({ ...JSON.parse(serializedKeys), workspace: { format: FORMAT, mintAddress: identity.mintAddress, savedAt, progress: readProgress(progress, identity) } });
}

export function recoveredProgress(payload: string, identity: ProjectIdentity): { progress: ProjectProgress; savedAt: string } | null {
  const workspace = JSON.parse(payload).workspace;
  if (workspace === undefined) return null; // Existing wallet-only backups remain supported.
  const record = object(workspace);
  if (record.format !== FORMAT || record.mintAddress !== identity.mintAddress || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) throw invalid();
  const progress = readProgress(record.progress, identity);
  // Even authenticated snapshots are point-in-time records. Recheck accounts and signatures.
  progress.tokenCreated = false; progress.poolCreated = false; progress.recoveryRequired = true;
  if (progress.batch) progress.batch.rows = progress.batch.rows.map(row => ({ ...row, status: 'unknown' }));
  if (progress.sales) progress.sales = progress.sales.map(row => ({ ...row, status: 'unknown' }));
  if (progress.liquidityRemovals) progress.liquidityRemovals = progress.liquidityRemovals.map(row => ({ ...row, status: 'unknown' }));
  if (progress.collections) progress.collections = progress.collections.map(record => ({ ...record, rows: record.rows.map(row => ({ ...row, status: row.status === 'not_sent' ? 'not_sent' : 'unknown' })) }));
  return { progress, savedAt: record.savedAt };
}

export function mergeRecoveredProgress(local: ProjectProgress | undefined, snapshot: ProjectProgress | undefined): ProjectProgress | undefined {
  if (!local) return snapshot;
  if (!snapshot) return local;
  if (local.pending && snapshot.pending && local.pending.signature !== snapshot.pending.signature) throw new Error('Two different unfinished transactions were found. Check the transaction in the original browser before restoring this snapshot.');
  if (local.batch && snapshot.batch && local.batch.rows.map(row => row.signature).sort().join(',') !== snapshot.batch.rows.map(row => row.signature).sort().join(',')) throw new Error('The browser and backup contain different buying batches. Keep both records and resolve them in the original browser before continuing.');
  const sales = new Map((snapshot.sales || []).map(sale => [sale.signature, sale]));
  for (const sale of local.sales || []) sales.set(sale.signature, sale);
  if (sales.size > 100) throw new Error('Combined history exceeds 100 sales. Keep both backups and use the original browser to check outstanding records.');
  let collections = snapshot.collections || [];
  for (const record of local.collections || []) collections = rememberCollection(collections, record);
  const removals = new Map((snapshot.liquidityRemovals || []).map(row => [row.signature, row]));
  for (const row of local.liquidityRemovals || []) removals.set(row.signature, row);
  if (removals.size > 20) throw new Error('Keep both backups and resolve liquidity history in the original browser before continuing.');
  const added = (!local.batch && !!snapshot.batch) || (!local.pending && !!snapshot.pending) || sales.size > (local.sales?.length || 0) || removals.size > (local.liquidityRemovals?.length || 0) || collections.some(record => !(local.collections || []).some(previous => previous.rows[0].signature === record.rows[0].signature)) || (!!local.historyMissing && !snapshot.historyMissing);
  return { ...local, batch: local.batch || snapshot.batch, pending: local.pending || snapshot.pending, pool: local.pool || snapshot.pool, receivingAddress: local.receivingAddress || snapshot.receivingAddress, collections, sales: [...sales.values()], liquidityRemovals: [...removals.values()], historyMissing: local.historyMissing && snapshot.historyMissing, ...(added ? { tokenCreated: false, poolCreated: false, recoveryRequired: true } : {}) };
}
