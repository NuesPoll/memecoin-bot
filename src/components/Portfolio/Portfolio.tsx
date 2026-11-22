import { useState, FormEvent } from 'react';
import { Alert, AlertIcon, Button, FormControl, FormLabel, Heading, Input, Text, VStack } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { getJson } from '@/lib/api';
type Position = { id?: string; attributes?: { fungible_info?: { name?: string; symbol?: string }; quantity?: { numeric?: string } } };
export default function Portfolio() {
  const [input, setInput] = useState('');
  const [address, setAddress] = useState('');
  const [invalid, setInvalid] = useState(false);
  const query = useQuery({ queryKey: ['portfolio', address], enabled: !!address, queryFn: () => getJson<{ data: Position[] }>(`/api/wallet/portfolio?address=${encodeURIComponent(address)}`) });
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(value)) { setInvalid(true); return; }
    setInvalid(false);
    if (address === value) void query.refetch(); else setAddress(value);
  }
  return <VStack align="stretch" spacing={4}><Heading size="lg">Portfolio</Heading><Text>Look up holdings using a public Ethereum wallet address. Never enter a private key or seed phrase.</Text>
    <form onSubmit={submit}><FormControl isInvalid={invalid}><FormLabel htmlFor="portfolio-address">Public wallet address</FormLabel><Input id="portfolio-address" placeholder="0x..." value={input} onChange={event => setInput(event.target.value)} /><Button type="submit" mt={3} isLoading={query.isFetching}>View portfolio</Button></FormControl></form>
    {!address && <Alert status="info"><AlertIcon />Enter a public address to view holdings. Portfolio lookup requires the optional data provider setup.</Alert>}
    {invalid && <Alert status="error"><AlertIcon />Enter a valid Ethereum public address.</Alert>}
    {query.isError && <Alert status="error"><AlertIcon />{(query.error as Error).message}<Button ml={3} onClick={() => query.refetch()}>Retry</Button></Alert>}
    {query.isSuccess && (query.data.data.length ? query.data.data.map((position, i) => <VStack align="start" borderWidth="1px" borderRadius="md" p={4} key={position.id || i}><Text>{position.attributes?.fungible_info?.name || 'Unknown asset'} ({position.attributes?.fungible_info?.symbol || 'N/A'})</Text><Text>Amount: {position.attributes?.quantity?.numeric ?? 'Unavailable'}</Text></VStack>) : <Alert status="info"><AlertIcon />No holdings found for this address.</Alert>)}
  </VStack>;
}
