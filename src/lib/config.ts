export function authConfigured(url?: string, key?: string) {
  if (!url || !key || key === 'your-anon-key') return false;
  if (key.startsWith('sb_secret_')) return false;
  try {
    const parsed = new URL(url);
    if (key.split('.').length === 3) {
      const payload = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      if (JSON.parse(atob(payload)).role !== 'anon') return false;
    }
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  } catch { return false; }
}
export const hasAuth = authConfigured(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
