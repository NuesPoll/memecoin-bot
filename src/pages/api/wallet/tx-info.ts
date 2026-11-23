import type { NextApiRequest, NextApiResponse } from 'next';
import { onlyGet, upstream } from '@/lib/server';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!onlyGet(req, res)) return;
  if (typeof req.query.hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(req.query.hash)) return res.status(400).json({ error: 'Enter a valid transaction hash.' });
  try { return res.status(200).json(await upstream(`https://protect.flashbots.net/tx/${req.query.hash}`)); }
  catch { return res.status(502).json({ error: 'Transaction status is unavailable.' }); }
}
