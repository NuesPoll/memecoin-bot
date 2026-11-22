import { Alert, AlertIcon, Tab, TabList, TabPanel, TabPanels, Tabs, Text } from '@chakra-ui/react';
import Head from 'next/head';
import Buying from '@/components/Buying/Buying';
import Wallet from '@/components/Wallet/Wallet';
import Portfolio from '@/components/Portfolio/Portfolio';
import Transactions from '@/components/Transactions/Transactions';
import Layout from '@/components/Layout/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
export default function Home() {
  return <><Head><title>NovaPulse</title><meta name="description" content="NovaPulse read-only memecoin dashboard" /><meta name="viewport" content="width=device-width, initial-scale=1" /></Head><Layout>
    <Alert status="info" mt={4}><AlertIcon /><Text>Read-only mode. Trading, wallet creation, key display, transfers and cancellations are disabled.</Text></Alert>
    <Tabs isLazy pt={6} w="full"><TabList overflowX="auto">{['Memecoin Bot', 'Wallet Manager', 'Portfolio', 'Transactions'].map(label => <Tab key={label} flexShrink={0}>{label}</Tab>)}</TabList><TabPanels>
      {[<Buying key="bot" />, <Wallet key="wallet" />, <Portfolio key="portfolio" />, <Transactions key="transactions" />].map((panel, index) => <TabPanel px={{ base: 0, md: 4 }} py={8} key={index}><ErrorBoundary>{panel}</ErrorBoundary></TabPanel>)}
    </TabPanels></Tabs>
  </Layout></>;
}
