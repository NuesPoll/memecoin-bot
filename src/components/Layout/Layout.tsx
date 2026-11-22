import { Box } from '@chakra-ui/react';
import type { ReactNode } from 'react';
import NavBar from '../NavBar/NavBar';
export default function Layout({ children }: { children: ReactNode }) {
  return <Box minH="100vh" bg="gray.900" color="gray.100"><Box maxW="64rem" mx="auto" px={{ base: 3, md: 6 }}><NavBar />{children}</Box></Box>;
}
