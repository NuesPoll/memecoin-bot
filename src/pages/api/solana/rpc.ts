import type { NextApiRequest, NextApiResponse } from 'next';
import { DEVNET_GENESIS } from '@/lib/solana/plan';

const methods = new Set(['getGenesisHash', 'getVersion', 'getAccountInfo', 'getMultipleAccounts', 'getBalance', 'getTokenAccountsByOwner', 'getTokenAccountBalance', 'getTokenSupply', 'getLatestBlockhash', 'getBlockHeight', 'getEpochInfo', 'getMinimumBalanceForRentExemption', 'getFeeForMessage', 'getSignatureStatuses', 'simulateTransaction', 'sendTransaction', 'getProgramAccounts', 'getRecentPrioritizationFees']);
let verifiedEndpoint: string | undefined;
let verifiedAt = 0;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
  const body = req.body;
  if (!body || body.jsonrpc !== '2.0' || !methods.has(body.method) || !Array.isArray(body.params ?? []) || !['string', 'number'].includes(typeof body.id)) return res.status(400).json({ error: 'Unsupported devnet request.' });
  if (body.method === 'requestAirdrop' && (!Number.isSafeInteger(body.params[1]) || body.params[1] <= 0 || body.params[1] > 2_000_000_000)) return res.status(400).json({ error: 'Request at most 2 test SOL.' });
  if (body.method === 'sendTransaction' && (typeof body.params[0] !== 'string' || body.params[0].length > 6000 || body.params[1]?.skipPreflight === true)) return res.status(400).json({ error: 'A signed transaction with preflight is required.' });
  const endpoint = process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
  try {
    if (new URL(endpoint).protocol !== 'https:') throw new Error();
    if (verifiedEndpoint !== endpoint || Date.now() - verifiedAt > 60_000) {
      const check = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getGenesisHash', params: [] }), signal: AbortSignal.timeout(10_000) });
      const data = await check.json();
      if (!check.ok || data.result !== DEVNET_GENESIS) return res.status(503).json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'Devnet verification failed. Mainnet access is disabled.' } });
      verifiedEndpoint = endpoint; verifiedAt = Date.now();
    }
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: body.id, method: body.method, params: body.params || [] }), signal: AbortSignal.timeout(20_000) });
    const data = await response.json();
    if (!response.ok) return res.status(response.status === 429 ? 429 : 502).json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'Devnet RPC is busy or unavailable. Try again later.' } });
    // Keep provider URLs/tokens out of error messages. Preserve on-chain simulation detail only.
    if (data.error) return res.status(200).json({ jsonrpc: '2.0', id: body.id, error: { code: data.error.code, message: 'Devnet request failed. Check test SOL balance, transaction status or faucet limits.', data: body.method === 'sendTransaction' ? { err: data.error.data?.err } : undefined } });
    return res.status(200).json(data);
  } catch { return res.status(503).json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'Devnet RPC unavailable. No mainnet fallback is used.' } }); }
}
export const config = { api: { bodyParser: { sizeLimit: '128kb' } } };
