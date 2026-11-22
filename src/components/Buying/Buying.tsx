import { useState, FormEvent } from 'react';
import { Alert, AlertIcon, Button, FormControl, FormLabel, Heading, Input, Text, VStack } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
type Pair = { baseToken?: { name?: string; symbol?: string }; priceUsd?: string; chainId?: string; dexId?: string };
export default function Buying() {
  const [input, setInput] = useState('');
  const [address, setAddress] = useState('');
  const [invalid, setInvalid] = useState(false);
  const query = useQuery({ queryKey: ['token', address], enabled: !!address, queryFn: () => getJson<{ pairs: Pair[] }>(`/api/token-info?tokenAddress=${encodeURIComponent(address)}`) });
  function lookup(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) { setInvalid(true); return; }
    setInvalid(false);
    if (value === address) void query.refetch(); else setAddress(value);
  }
  return <VStack align="stretch" spacing={5}><Heading size="lg">Memecoin Bot</Heading><Text>Look up public Ethereum token market data. No wallet or login is required.</Text>
    <form onSubmit={lookup}><FormControl isInvalid={invalid}><FormLabel htmlFor="token-address">Token contract address</FormLabel><Input id="token-address" value={input} onChange={event => setInput(event.target.value)} placeholder="0x..." /><Button mt={3} type="submit" isLoading={query.isFetching}>Look up token</Button></FormControl></form>
    {invalid && <Alert status="error"><AlertIcon />Enter a valid Ethereum contract address (0x and 40 hexadecimal characters).</Alert>}
    {query.isError && <Alert status="error"><AlertIcon />{(query.error as Error).message}<Button ml={3} onClick={() => query.refetch()}>Retry</Button></Alert>}
    {query.isSuccess && (query.data.pairs.length ? query.data.pairs.slice(0, 5).map((pair, i) => <VStack align="start" p={4} borderWidth="1px" borderRadius="md" key={i}><Heading size="sm">{pair.baseToken?.name || 'Unknown token'} ({pair.baseToken?.symbol || 'N/A'})</Heading><Text>Price: {pair.priceUsd ? `$${pair.priceUsd}` : 'Unavailable'}</Text><Text>{pair.chainId || 'Unknown chain'} / {pair.dexId || 'Unknown exchange'}</Text></VStack>) : <Alert status="info"><AlertIcon />No market pairs found for this address.</Alert>)}
    <Text fontSize="sm">Market data is informational and does not verify token safety. Live trading is disabled.</Text></VStack>;
}
