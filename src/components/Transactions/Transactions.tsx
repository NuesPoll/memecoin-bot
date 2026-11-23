import { Heading, Text, VStack } from '@chakra-ui/react';
import AccountGate from '@/components/AccountGate';
import AccountList from '@/components/AccountList';
export default function Transactions() {
  return <VStack align="stretch" spacing={4}><Heading size="lg">Transactions</Heading><Text>View your saved transaction hashes. No transactions are submitted or cancelled here.</Text><AccountGate><AccountList kind="transactions" /></AccountGate></VStack>;
}
