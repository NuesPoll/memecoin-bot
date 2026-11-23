import type { NextApiRequest, NextApiResponse } from 'next';
import { DEVNET_GENESIS } from '@/lib/solana/plan';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET.' }); }
  const endpoint = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
  try {
    if (new URL(endpoint).protocol !== 'https:') throw new Error();
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash', params: [] }), signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    if (!response.ok || data.result !== DEVNET_GENESIS) return res.status(503).json({ network: 'unverified', mainnetEnabled: false, error: 'The configured connection could not be verified as Solana devnet.' });
    return res.status(200).json({ network: 'devnet', verified: true, mainnetEnabled: false, funding: 'https://faucet.solana.com', rpcFaucetAvailable: false });
  } catch { return res.status(503).json({ network: 'unavailable', mainnetEnabled: false, error: 'Solana devnet is unavailable. Try again later.' }); }
}
