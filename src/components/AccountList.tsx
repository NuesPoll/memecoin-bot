import { Alert, AlertIcon, Box, Button, Spinner, Text, VStack } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './Auth';
import { getJson } from '@/lib/api';
type Row = { public_key?: string; hash?: string; created_at?: string };
export default function AccountList({ kind }: { kind: 'wallets' | 'transactions' }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: [kind, user?.id], enabled: !!user, queryFn: async () => {
    const data = await getJson<Row[]>(`/api/wallet/${kind}`);
    if (!Array.isArray(data)) throw new Error('Unexpected response from the account service.');
    return data;
  } });
  if (query.isLoading) return <VStack role="status"><Spinner /><Text>Loading {kind}...</Text></VStack>;
  if (query.isError) return <Alert status="error"><AlertIcon />{(query.error as Error).message}<Button ml={3} onClick={() => query.refetch()}>Retry</Button></Alert>;
  if (!query.data?.length) return <Alert status="info"><AlertIcon />No saved {kind} yet.</Alert>;
  return <VStack align="stretch">{query.data.map((row, i) => <Box borderWidth="1px" borderRadius="md" p={4} key={i}><Text overflowWrap="anywhere">{kind === 'wallets' ? row.public_key : row.hash}</Text></Box>)}</VStack>;
}
