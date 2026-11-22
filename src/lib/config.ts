export function authConfigured(url?: string, key?: string) {
  if (!url || !key || key === 'your-anon-key') return false;
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
}
export const hasAuth = authConfigured(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
