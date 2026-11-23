import type { NextApiRequest, NextApiResponse } from 'next';
import { addressParam, onlyGet, upstream } from '@/lib/server';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyGet(req, res)) return;
  if (!addressParam(req.query.address)) return res.status(400).json({ error: 'Enter a valid Ethereum public address.' });
  if (!process.env.ZERION_API_KEY) return res.status(503).json({ error: 'Portfolio data is not configured. Set the server-only ZERION_API_KEY; see README.' });
  try {
    const data = await upstream(`https://api.zerion.io/v1/wallets/${req.query.address}/positions/?filter[chain_ids]=ethereum`, { accept: 'application/json', authorization: `Basic ${process.env.ZERION_API_KEY}` });
    if (!Array.isArray(data.data)) throw new Error('Invalid response');
    return res.status(200).json({ data: data.data });
  } catch { return res.status(502).json({ error: 'Portfolio data is unavailable. Check the provider configuration or try again later.' }); }
}
