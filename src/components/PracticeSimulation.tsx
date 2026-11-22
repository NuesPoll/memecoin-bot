import { useEffect, useRef, useState } from 'react';
import { Alert, AlertIcon, Badge, Box, Button, FormControl, FormLabel, Heading, HStack, Input, SimpleGrid, Table, Tbody, Td, Text, Th, Thead, Tr } from '@chakra-ui/react';
import { PracticeAction, practiceSchedule } from '@/lib/solana/simulation';

export default function PracticeSimulation() {
  const [minimum, setMinimum] = useState('2');
  const [maximum, setMaximum] = useState('5');
  const [actions, setActions] = useState<PracticeAction[]>([]);
  const [completed, setCompleted] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const finished = actions.length > 0 && completed === actions.length;

  useEffect(() => {
    if (!running || completed >= actions.length) return;
    const current = generation.current;
    const timer = setTimeout(() => {
      if (current !== generation.current) return;
      setCompleted(value => value + 1);
      if (completed + 1 === actions.length) setRunning(false);
    }, actions[completed].delayMs);
    return () => clearTimeout(timer);
  }, [running, completed, actions]);

  function preview() {
    generation.current++;
    setRunning(false); setCompleted(0); setError('');
    try { setActions(practiceSchedule({ minDelaySeconds: Number(minimum), maxDelaySeconds: Number(maximum) })); }
    catch (failure) { setActions([]); setError(failure instanceof Error ? failure.message : 'Check the practice delay settings.'); }
  }
  function pause() { generation.current++; setRunning(false); }
  function reset() { pause(); setCompleted(0); }
  const rows = actions.slice(Math.max(0, completed - 5), Math.min(actions.length, completed + 5));
  const buys = actions.slice(0, completed).filter(action => action.kind === 'buy').length;
  const next = actions[completed];

  return <Box borderWidth="1px" rounded="lg" p={5}>
    <HStack justify="space-between" flexWrap="wrap"><Heading size="md">Shuffled buy/sell practice</Heading><Badge colorScheme="cyan">SIMULATION - NO TRANSACTIONS</Badge></HStack>
    <Alert status="info" mt={4}><AlertIcon /><Text>This is a synthetic practice run using virtual wallets and tokens. It does not use your vault, SOL, token or trading pool, and never submits trades.</Text></Alert>
    <Text mt={3}>40 virtual wallets each make 3 simulated buys and 2 simulated sells: 200 actions in shuffled order, with 60% buys overall. Each sell uses 25% of that virtual wallet&apos;s holdings. A wallet must buy before it can sell.</Text>
    <SimpleGrid mt={4} columns={{ base: 1, md: 2 }} spacing={4}>
      <FormControl><FormLabel htmlFor="practice-min-delay">Minimum delay (seconds)</FormLabel><Input id="practice-min-delay" type="number" min={2} max={30} value={minimum} isDisabled={running} onChange={event => setMinimum(event.target.value)} /></FormControl>
      <FormControl><FormLabel htmlFor="practice-max-delay">Maximum delay (seconds)</FormLabel><Input id="practice-max-delay" type="number" min={2} max={30} value={maximum} isDisabled={running} onChange={event => setMaximum(event.target.value)} /></FormControl>
    </SimpleGrid>
    {error && <Alert mt={3} status="error"><AlertIcon />{error}</Alert>}
    <HStack mt={4} flexWrap="wrap"><Button variant="outline" onClick={preview} isDisabled={running}>Preview shuffled schedule</Button><Button onClick={() => setRunning(true)} isDisabled={!actions.length || running || finished}>{completed ? 'Resume practice' : 'Run practice'}</Button><Button onClick={pause} isDisabled={!running}>Pause practice</Button><Button variant="ghost" onClick={reset} isDisabled={!actions.length || (!running && completed === 0)}>Reset practice</Button></HStack>
    {actions.length > 0 && <>
      <Text mt={3} role="status">{finished ? 'Practice complete.' : running ? 'Practice running.' : 'Practice paused.'} {completed} of {actions.length} simulated actions complete: {buys} buys, {completed - buys} sells.</Text>
      <Text mt={2}>Planned duration: {Math.ceil(actions[actions.length - 1].atMs / 60000)} minutes. Delays are between consecutive actions; browser backgrounding may make them longer. Resuming waits the next action&apos;s full delay.</Text>
      {next && <Text mt={2}>Next: virtual wallet {next.wallet} simulates a {next.kind} after {next.delayMs / 1000} seconds of active playback.</Text>}
      <Box mt={4} overflowX="auto"><Table size="sm"><Thead><Tr><Th>Step</Th><Th>Virtual wallet</Th><Th>Simulated action</Th><Th>Virtual tokens</Th><Th>Delay</Th><Th>Status</Th></Tr></Thead><Tbody>{rows.map((action, i) => { const index = Math.max(0, completed - 5) + i; return <Tr key={index}><Td>{index + 1}</Td><Td>{action.wallet}</Td><Td>{action.kind}</Td><Td>{action.quantity.toLocaleString()}</Td><Td>{action.delayMs / 1000}s</Td><Td>{index < completed ? 'Simulated' : 'Planned'}</Td></Tr>; })}</Tbody></Table></Box>
      {finished && <Text mt={3}>Every virtual wallet completed 3 buys and 2 sells. No blockchain transactions were created.</Text>}
    </>}
  </Box>;
}
