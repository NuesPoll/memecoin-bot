import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '@/components/Auth';
export default function AuthCallback() {
  const { client, configured } = useAuth(); const router = useRouter(); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!configured || !client) return;
    let active = true;
    void (async () => { try { const session = await client.auth.getSession(); if (session.error || !session.data.session) throw new Error(); const verified = await client.auth.getUser(); if (verified.error || !verified.data.user) throw new Error(); if (active) await router.replace('/#account'); } catch { if (active) setFailed(true); } })();
    return () => { active = false; };
  }, [client, configured, router]);
  return <main className="nova-app np-callback"><h1>{!configured ? 'Email sign-in needs setup' : failed ? 'This sign-in link could not be verified' : 'Checking your sign-in link…'}</h1><p>{failed ? 'The link may have expired or already been used. Request a new one from Account.' : 'Wallet keys stay encrypted in your browser.'}</p><Link href="/#account">Return to NovaPulse Account</Link></main>;
}
