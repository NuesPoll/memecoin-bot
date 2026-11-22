import { createBrowserSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { SessionContextProvider, useSessionContext } from '@supabase/auth-helpers-react';
import { createContext, ReactNode, useContext, useState } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { hasAuth } from '@/lib/config';
const AuthContext = createContext<{ configured: boolean; loading: boolean; user: User | null; client: SupabaseClient | null; error: boolean }>({ configured: false, loading: false, user: null, client: null, error: false });
export const useAuth = () => useContext(AuthContext);
function ConnectedAuth({ children }: { children: ReactNode }) {
  const { isLoading, session, supabaseClient, error } = useSessionContext();
  return <AuthContext.Provider value={{ configured: true, loading: isLoading, user: session?.user ?? null, client: supabaseClient, error: !!error }}>{children}</AuthContext.Provider>;
}
function Session({ children }: { children: ReactNode }) {
  const [client] = useState(() => createBrowserSupabaseClient());
  return <SessionContextProvider supabaseClient={client}><ConnectedAuth>{children}</ConnectedAuth></SessionContextProvider>;
}
export default function Auth({ children }: { children: ReactNode }) {
  return hasAuth ? <Session>{children}</Session> : <>{children}</>;
}
