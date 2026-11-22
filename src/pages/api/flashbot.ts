import type { NextApiRequest, NextApiResponse } from 'next';
export default function handler(_req: NextApiRequest, res: NextApiResponse) { res.setHeader('Cache-Control', 'no-store'); return res.status(403).json({ error: 'Live transaction operations are disabled in read-only mode.' }); }
