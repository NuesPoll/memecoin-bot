import { Alert, AlertIcon, Spinner, Text, VStack } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import { useAuth } from './Auth';
export default function AccountGate({ children }: { children: ReactNode }) {
  const { configured, loading, user, error } = useAuth();
  if (!configured) return <Alert status="info"><AlertIcon />Account data is not configured. Token lookup works without login. See README for optional account setup.</Alert>;
  if (loading) return <VStack role="status"><Spinner /><Text>Checking your session...</Text></VStack>;
  if (error) return <Alert status="error"><AlertIcon />The account service is unavailable. Please try signing in again later.</Alert>;
  if (!user) return <Alert status="info"><AlertIcon />Sign in with Discord to view your saved account data.</Alert>;
  return <>{children}</>;
}
