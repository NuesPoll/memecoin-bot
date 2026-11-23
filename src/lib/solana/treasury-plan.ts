import { units } from './plan';

export type CollectionStatus = 'ready' | 'submitted' | 'confirmed' | 'failed' | 'unknown' | 'not_sent';
export type CollectionRow = { address: string; amountRaw: string; feeRaw: string; signature: string; status: CollectionStatus };
export type CollectionRecord = { mint: string; destination: string; reserveRaw: string; createdAt: number; lastValidBlockHeight: number; rows: CollectionRow[] };
export function collectionUnresolved(records: CollectionRecord[]) {
  return records.some(record => record.rows.some(row => ['ready', 'submitted', 'unknown'].includes(row.status)));
}
export function reserveAmount(value: string) {
  const raw = /^0(?:\.0{1,9})?$/.test(value.trim()) ? BigInt(0) : units(value, 9);
  if (raw > BigInt(10_000_000)) throw new Error('Leave between 0 and 0.01 test SOL per wallet.');
  return raw;
}
export function safeLamports(value: number | null): bigint {
  if (value === null || !Number.isSafeInteger(value) || value < 0) throw new Error('The network returned an invalid balance or fee. Nothing was submitted.');
  return BigInt(value);
}
export function readCollections(value: unknown, mint: string, addresses: string[]): CollectionRecord[] {
  const bad = () => new Error('The collection history is damaged or belongs to different wallets.');
  const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad(); return v as Record<string, unknown>; };
  const pub = (v: unknown) => { if (typeof v !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(v)) throw bad(); return v; };
  const raw = (v: unknown, zero = false) => { if (typeof v !== 'string' || !/^\d{1,20}$/.test(v) || BigInt(v) < BigInt(zero ? 0 : 1) || BigInt(v) > BigInt('18446744073709551615')) throw bad(); return v; };
  const integer = (v: unknown) => { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0) throw bad(); return v; };
  if (!Array.isArray(value) || value.length > 10) throw bad();
  const allowed = new Set(addresses), signatures = new Set<string>();
  return value.map(item => {
    const record = obj(item);
    if (record.mint !== mint || !Array.isArray(record.rows) || !record.rows.length || record.rows.length > 41) throw bad();
    const destination = pub(record.destination), reserveRaw = raw(record.reserveRaw, true);
    if (allowed.has(destination) || destination === mint || BigInt(reserveRaw) > BigInt(10_000_000)) throw bad();
    const rows: CollectionRow[] = record.rows.map(item => {
      const row = obj(item), address = pub(row.address);
      if (!allowed.has(address) || typeof row.signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(row.signature) || signatures.has(row.signature) || !['ready', 'submitted', 'confirmed', 'failed', 'unknown', 'not_sent'].includes(row.status as string)) throw bad();
      signatures.add(row.signature);
      return { address, amountRaw: raw(row.amountRaw), feeRaw: raw(row.feeRaw), signature: row.signature, status: row.status as CollectionStatus };
    });
    if (new Set(rows.map(row => row.address)).size !== rows.length) throw bad();
    return { mint, destination, reserveRaw, createdAt: integer(record.createdAt), lastValidBlockHeight: integer(record.lastValidBlockHeight), rows };
  });
}
export function rememberCollection(records: CollectionRecord[], next: CollectionRecord) {
  const id = next.rows[0]?.signature;
  const result = [...records.filter(record => record.rows[0]?.signature !== id), next];
  while (result.length > 10) {
    const index = result.findIndex(record => !collectionUnresolved([record]));
    if (index < 0) throw new Error('Check outstanding collections before preparing another.');
    result.splice(index, 1);
  }
  return result;
}
