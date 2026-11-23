import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { hasAuth } from './config';
export function onlyGet(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') return true;
  res.setHeader('Allow', 'GET'); res.status(405).json({ error: 'Method not allowed.' }); return false;
}
export function addressParam(value: unknown): value is string { return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value); }
export async function accountRows(req: NextApiRequest, res: NextApiResponse, kind: 'wallets' | 'transactions', active = false) {
  if (!onlyGet(req, res)) return;
  if (!hasAuth) return res.status(503).json({ error: 'Account data is not configured. See README for account setup.' });
  try {
    const supabase = createServerSupabaseClient({ req, res });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return res.status(401).json({ error: 'Please sign in to view account data.' });
    // Never trust caller-supplied usernames, or select secret columns.
    let query = supabase.from(kind === 'wallets' ? 'dashboard_wallets' : 'dashboard_transactions').select(kind === 'wallets' ? 'public_key,active' : 'hash,created_at').eq('user_id', user.id);
    if (active) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) return res.status(503).json({ error: 'Account storage is unavailable or needs the user_id/RLS setup described in README.' });
    return res.status(200).json(active ? data?.[0] ?? null : data ?? []);
  } catch { return res.status(503).json({ error: 'The account service is unavailable. Please try again later.' }); }
}
export async function upstream(url: string, headers?: HeadersInit) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Upstream failed');
  return response.json();
}
