import { useEffect, useState } from 'react';
import { Alert, AlertIcon, Box, Button, FormControl, FormLabel, Input, Text, VStack } from '@chakra-ui/react';
import { useAuth } from './Auth';
export default function AccountPanel({ busy, lock }: { busy: boolean; lock: () => void }) {
  const { configured, loading, user, client, error: serviceError } = useAuth();
  const [email, setEmail] = useState(''), [sending, setSending] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState(''), [cooldown, setCooldown] = useState(0);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000); return () => clearTimeout(timer); }, [cooldown]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault(); if (!configured || !client || sending || cooldown) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) { setError('Enter a valid email address.'); return; }
    setSending(true); setError(''); setMessage('');
    try {
      const result = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (result.error) throw new Error();
      setCooldown(60); setMessage('Sign-in link requested. Check your email and open the newest link in this browser. Delivery depends on the connected email service.');
    } catch { setError('The email link could not be requested. Check account setup or try again later.'); }
    finally { setSending(false); }
  }
  async function signOut() {
    if (!client || busy) return;
    lock(); setSending(true); setError(''); setMessage('');
    try { const result = await client.auth.signOut(); if (result.error) throw new Error(); setMessage('Vault locked and account signed out.'); }
    catch { setError('Your vault is locked, but account sign-out could not be confirmed. Try again.'); }
    finally { setSending(false); }
  }
  return <div className="np-account-grid"><Box className="np-panel"><span className="np-overline">YOUR NOVAPULSE ACCOUNT</span><h2 className="np-feature-title">Sign in.<br/><em>Keep control.</em></h2><Text mb={5}>Use an email link to sign in or create your account. Your account and encrypted wallet vault are separate.</Text>
    {(error || serviceError) && <Alert mb={4} status="error"><AlertIcon />{error || 'The account service is unavailable.'}</Alert>}
    {message && <Alert mb={4} status="info"><AlertIcon />{message}</Alert>}
    {loading ? <Text role="status">Checking your account session…</Text> : user ? <VStack align="stretch" spacing={4}><Text>Signed in as {user.email || 'your account'}</Text><Button isDisabled={busy || sending} onClick={signOut}>Sign out &amp; lock vault</Button></VStack> : <form onSubmit={signIn}><VStack align="stretch" spacing={4}><FormControl><FormLabel htmlFor="account-email">Email address</FormLabel><Input id="account-email" type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" isDisabled={!configured || sending}/></FormControl><Button className="np-primary" type="submit" isDisabled={!configured || sending || busy || !!cooldown}>{sending ? 'Requesting link…' : cooldown ? `Request another link in ${cooldown}s` : 'Email me a sign-in link'}</Button></VStack></form>}
    {!configured && <Alert mt={5} status="warning"><AlertIcon />Email sign-in is prepared but not connected yet. Complete the account-service setup below to activate it. No sign-in link can be sent until then.</Alert>}
    </Box><aside className="np-panel"><h3>One-time email sign-in setup</h3><ol className="np-setup-steps"><li>Create your own Supabase project and enable Email authentication.</li><li>Add this website and its <code>/auth/callback</code> address to the allowed redirect URLs.</li><li>Add the project URL and public publishable/anon key to NovaPulse’s Vercel settings, then redeploy.</li><li>Configure email delivery and test a real sign-in link.</li></ol><a className="np-text-action" href="/NovaPulse-email-sign-in-setup.txt" target="_blank" rel="noreferrer">Open email sign-in setup guide ↗</a><p>Only the public client key belongs in browser configuration; never use a service-role or secret key.</p><div className="np-bottom-note"><p>Signing in does not unlock wallets or upload their keys. Keep your encrypted project backup and vault password. Moving to another browser still requires that backup.</p></div></aside></div>;
}
