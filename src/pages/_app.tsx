import { ChakraProvider } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import Auth from '@/components/Auth';
import theme from '../../theme';
export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={queryClient}><ChakraProvider theme={theme}><Auth><Component {...pageProps} /></Auth></ChakraProvider></QueryClientProvider>;
}
