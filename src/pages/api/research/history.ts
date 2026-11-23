import type { NextApiRequest, NextApiResponse } from 'next';
import { Performance, hourlyPerformance, solanaAddress } from '@/lib/research';
const cache = new Map<string, { value: Performance; checkedAt: number }>();
const inFlight = new Map<string, Promise<Performance>>();
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'public, s-maxage=90');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET.' }); }
  if (!solanaAddress(req.query.pool)) return res.status(400).json({ error: 'Provide a Solana pool address.' });
  const pool = req.query.pool;
  try {
    let saved = cache.get(pool);
    if (!saved || Date.now() - saved.checkedAt > 90_000) {
      if (!inFlight.has(pool)) inFlight.set(pool, (async () => {
        const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/hour?aggregate=1&limit=10&currency=usd&token=base&include_empty_intervals=true`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
        if (!response.ok) throw new Error(); return hourlyPerformance(await response.json());
      })());
      try { saved = { value: await inFlight.get(pool)!, checkedAt: Date.now() }; if (cache.size >= 120) cache.delete(cache.keys().next().value!); cache.set(pool, saved); } finally { inFlight.delete(pool); }
    }
    return res.status(200).json({ ...saved.value, pool, checkedAt: saved.checkedAt, provider: 'GeckoTerminal', method: 'Complete UTC hourly candles: first open to last close. No interpolation; missing/stale windows are unavailable.' });
  } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'Historical prices are unavailable or rate limited. This pool cannot be ranked until real candles are available.' }); }
}
