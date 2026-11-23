export const researchHours = [2, 3, 6, 7] as const;
export type Market = { pool: string; token: string; name: string; symbol: string; createdAt: number | null; liquidityUsd: number | null; volume24hUsd: number | null; priceUsd: number | null };
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type Performance = { asOf: number; candles: Candle[]; windows: Record<number, { changePct: number; volumeUsd: number } | null> };
export const solanaAddress = (value: unknown): value is string => typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
function number(v: unknown) { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; }
export function parseMarkets(payload: unknown): Market[] {
  const source = obj(payload), included = new Map<string, Record<string, unknown>>((Array.isArray(source.included) ? source.included : []).map((item: unknown): [string, Record<string, unknown>] => { const row = obj(item); return [String(row.id || ''), obj(row.attributes)]; }));
  if (!Array.isArray(source.data)) throw new Error('The market provider returned an invalid pool list.');
  return source.data.slice(0, 40).flatMap((value: unknown) => {
    const row = obj(value), a = obj(row.attributes), relation = obj(obj(obj(row.relationships).base_token).data), tokenId = String(relation.id || ''), token = tokenId.replace(/^solana_/, ''), metadata = obj(included.get(tokenId));
    if (!solanaAddress(a.address) || !solanaAddress(token)) return [];
    const created = Date.parse(String(a.pool_created_at)), fallback = String(a.name || 'Unknown token').split(' / ')[0];
    return [{ pool: a.address, token, name: String(metadata.name || fallback).slice(0, 80), symbol: String(metadata.symbol || fallback).slice(0, 24), createdAt: Number.isFinite(created) ? created : null, liquidityUsd: number(a.reserve_in_usd), volume24hUsd: number(obj(a.volume_usd).h24), priceUsd: number(a.base_token_price_usd) }];
  });
}
export function uniqueMarkets(rows: Market[]) {
  const tokens = new Map<string, Market>();
  for (const row of rows) if (!tokens.has(row.token) || (row.liquidityUsd || 0) > (tokens.get(row.token)!.liquidityUsd || 0)) tokens.set(row.token, row);
  return [...tokens.values()];
}
export function hourlyPerformance(payload: unknown, now = Date.now()): Performance {
  const raw = obj(obj(obj(payload).data).attributes).ohlcv_list;
  if (!Array.isArray(raw)) throw new Error('The market provider returned invalid historical candles.');
  const candles: Candle[] = raw.slice(0, 24).map((item: unknown) => {
    if (!Array.isArray(item) || item.length < 6 || item.slice(0, 6).some(v => typeof v !== 'number' || !Number.isFinite(v) || v < 0) || !Number.isInteger(item[0]) || item[0] % 3600 !== 0 || item[1] <= 0 || item[4] <= 0 || item[2] < Math.max(item[1], item[4]) || item[3] > Math.min(item[1], item[4])) throw new Error('Historical prices could not be verified.');
    return { time: item[0] * 1000, open: item[1], high: item[2], low: item[3], close: item[4], volume: item[5] };
  }).filter(row => row.time + 3_600_000 <= now).sort((a, b) => a.time - b.time);
  if (new Set(candles.map(row => row.time)).size !== candles.length) throw new Error('Historical prices contain duplicate candles.');
  const latest = candles[candles.length - 1], asOf = latest ? latest.time + 3_600_000 : 0;
  const windows: Performance['windows'] = {};
  for (const hours of researchHours) {
    const start = asOf - hours * 3_600_000;
    const selected = candles.filter(row => row.time >= start && row.time < asOf);
    const continuous = selected.length === hours && selected.every((row, i) => row.time === start + i * 3_600_000);
    // N complete hourly candles: first open to last close. Never interpolate missing hours.
    const change = continuous ? (selected[selected.length - 1].close / selected[0].open - 1) * 100 : NaN;
    const volume = selected.reduce((sum, row) => sum + row.volume, 0);
    windows[hours] = continuous && Number.isFinite(change) && Number.isFinite(volume) && now - asOf < 3_600_000 ? { changePct: change, volumeUsd: volume } : null;
  }
  return { asOf, candles, windows };
}
export function selectMarkets(rows: Market[], history: Record<string, Performance>, ageHours: number, performanceHours: number, minimumLiquidity: number, now = Date.now()) {
  return rows.filter(row => (!ageHours || row.createdAt !== null && now >= row.createdAt && now - row.createdAt <= ageHours * 3_600_000) && (row.liquidityUsd || 0) >= minimumLiquidity).sort((a, b) => (history[b.pool]?.windows[performanceHours]?.changePct ?? -Infinity) - (history[a.pool]?.windows[performanceHours]?.changePct ?? -Infinity) || (b.liquidityUsd || 0) - (a.liquidityUsd || 0));
}
export function validateOriginalDraft(name: string, symbol: string, source?: Market) {
  if (!name.trim() || new TextEncoder().encode(name.trim()).length > 32 || !/^[A-Za-z0-9]{1,10}$/.test(symbol)) throw new Error('Use an original name of 1–32 bytes and a symbol of 1–10 letters or numbers.');
  if (source && (name.trim().toLowerCase() === source.name.toLowerCase() || symbol.toLowerCase() === source.symbol.toLowerCase())) throw new Error('Choose your own name and symbol for this new token.');
  return { name: name.trim(), symbol: symbol.toUpperCase() };
}
