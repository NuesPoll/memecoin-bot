import type { NextApiRequest, NextApiResponse } from 'next';
import { accountRows } from '@/lib/server';
export default function handler(req: NextApiRequest, res: NextApiResponse) { return accountRows(req, res, 'wallets', true); }
