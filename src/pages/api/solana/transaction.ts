import type { NextApiRequest, NextApiResponse } from 'next';
import { DEVNET_GENESIS } from '@/lib/solana/plan';
import { describeTransactionError } from '@/lib/solana/transaction';

// Public read-only support lookup. It cannot broadcast or receive private keys.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Use GET.' }); }
  const signature = req.query.signature;
  if (typeof signature !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(signature)) return res.status(400).json({ error: 'Provide a public transaction signature.' });
  const endpoint = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
  try {
    if (new URL(endpoint).protocol !== 'https:') throw new Error();
    const read = async (method: string, params: unknown[]) => {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error();
      return data.result;
    };
    if (await read('getGenesisHash', []) !== DEVNET_GENESIS) throw new Error();
    const result = await read('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
    const state = result.value[0];
    return res.status(200).json({ network: 'devnet', signature, status: !state ? 'not-found' : state.err ? 'failed' : state.confirmationStatus, message: !state ? 'No transaction record was found. This alone does not prove that a submission failed; check on-chain progress before retrying.' : state.err ? describeTransactionError(state.err) : 'Transaction status read from Solana devnet.' });
  } catch { return res.status(503).json({ error: 'Devnet transaction status is unavailable. No mainnet fallback is used.' }); }
}
