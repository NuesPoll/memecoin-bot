import dynamic from 'next/dynamic';
import Head from 'next/head';
import { Text } from '@chakra-ui/react';
const Studio = dynamic(() => import('@/components/SolanaStudio'), { loading: () => <Text role="status">Loading Solana launch tools...</Text> });
export default function Home() {
  return <><Head><title>NovaPulse - Solana Launch Studio</title><meta name="description" content="Your Solana launch workspace. Create tokens, manage 40 wallets and review devnet trades." /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><Studio /></>;
}
