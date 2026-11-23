import { Heading, Text, VStack } from '@chakra-ui/react';
import AccountGate from '@/components/AccountGate';
import AccountList from '@/components/AccountList';
export default function Wallet() {
  return <VStack align="stretch" spacing={4}><Heading size="lg">Wallet Manager</Heading><Text>View saved public wallet addresses. Creating wallets, displaying keys and moving funds are disabled.</Text><AccountGate><AccountList kind="wallets" /></AccountGate></VStack>;
}
