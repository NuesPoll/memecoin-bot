import type { NextApiRequest, NextApiResponse } from 'next';
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).end(); }
  const { name, symbol } = req.query;
  if (typeof name !== 'string' || !name.trim() || name.length > 32 || typeof symbol !== 'string' || !/^[A-Za-z0-9]{1,10}$/.test(symbol)) return res.status(400).json({ error: 'Invalid token metadata.' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ name, symbol, description: 'A NovaPulse Solana devnet test token. No real-money trading is enabled.' });
}
