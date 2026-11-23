import { Button, HStack, Text, useToast } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '@/components/Auth';
export default function NavBar() {
  const { client, user, configured, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const queries = useQueryClient();
  const toast = useToast();
  async function authenticate() {
    if (!client) return;
    setBusy(true);
    try {
      if (user) {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        queries.clear();
      } else {
        const { error } = await client.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: window.location.origin } });
        if (error) throw error;
      }
    } catch {
      toast({ title: 'Sign-in service unavailable', description: 'Please try again later or check the Discord sign-in setup.', status: 'error', isClosable: true });
    } finally { setBusy(false); }
  }
  return <HStack w="100%" p={4} justify="space-between" flexWrap="wrap"><Text fontSize="xl" fontWeight="bold">NovaPulse</Text><Button onClick={authenticate} isDisabled={!configured || loading} isLoading={busy}>{!configured ? 'Login unavailable' : user ? 'Logout' : 'Login Discord'}</Button></HStack>;
}
