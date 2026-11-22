import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Box, Heading, Link, Text } from '@chakra-ui/react';
const Studio = dynamic(() => import('@/components/SolanaStudio'), { loading: () => <Text role="status">Loading Solana launch tools...</Text> });
export default function Home() {
  return <><Head><title>NovaPulse - Solana Launch Studio</title><meta name="description" content="Create a Solana devnet token and review a 40-wallet test purchase batch" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><Box bg="gray.900" color="gray.100" minH="100vh"><Box maxW="70rem" mx="auto" px={{ base: 4, md: 8 }} py={6}><Heading size="md" mb={6}>NovaPulse</Heading><Studio /><Link href="/dashboard">Open the previous read-only market dashboard</Link></Box></Box></>;
}
