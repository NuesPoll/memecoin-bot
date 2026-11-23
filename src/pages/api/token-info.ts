import type { NextApiRequest, NextApiResponse } from 'next';
import { addressParam, onlyGet, upstream } from '@/lib/server';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyGet(req, res)) return;
  if (!addressParam(req.query.tokenAddress)) return res.status(400).json({ error: 'Enter a valid Ethereum token address.' });
  try {
    const data = await upstream(`https://api.dexscreener.com/latest/dex/tokens/${req.query.tokenAddress}`);
    if (data.pairs !== null && !Array.isArray(data.pairs)) throw new Error('Invalid response');
    return res.status(200).json({ pairs: (data.pairs ?? []).filter((pair: { chainId?: string } | null) => pair?.chainId === 'ethereum') });
  } catch { return res.status(502).json({ error: 'Token data is unavailable. Please try again later.' }); }
}
