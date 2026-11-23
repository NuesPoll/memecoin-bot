import type { NextApiRequest, NextApiResponse } from 'next';
import { Market, parseMarkets, uniqueMarkets } from '@/lib/research';
let cache: { rows: Market[]; checkedAt: number; partial: boolean } | undefined;
let pending: Promise<NonNullable<typeof cache>> | undefined;
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'public, s-maxage=90, stale-while-revalidate=30');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET.' }); }
  try {
    if (!cache || Date.now() - cache.checkedAt > 90_000) {
      pending ||= (async () => {
        const routes = ['trending_pools?include=base_token&page=1', 'trending_pools?include=base_token&duration=1h&page=1', 'trending_pools?include=base_token&duration=1h&page=2', 'new_pools?include=base_token&page=1'];
        const results = await Promise.allSettled(routes.map(async route => {
          const response = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/${route}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
          if (!response.ok) throw new Error(); return parseMarkets(await response.json());
        }));
        const good = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
        if (!good.length) throw new Error();
        return { rows: uniqueMarkets(good), checkedAt: Date.now(), partial: results.some(result => result.status === 'rejected') };
      })();
      try { cache = await pending; } finally { pending = undefined; }
    }
    return res.status(200).json({ ...cache, provider: 'GeckoTerminal', network: 'solana', readOnly: true, scope: 'Sampled trending and new pools; not the entire market. Age is pool creation time, not token mint time.' });
  } catch { res.setHeader('Cache-Control', 'no-store'); return res.status(503).json({ error: 'Live market research is temporarily unavailable or rate limited. No sample winners are substituted. Try again later.' }); }
}
