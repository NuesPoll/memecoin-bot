-- Run only in a Supabase project you own, using its SQL editor.
-- New tables intentionally contain no private-key column. No legacy rows are copied.
create table if not exists public.dashboard_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null check (public_key ~ '^0x[0-9a-fA-F]{40}$'),
  active boolean not null default false
);
create table if not exists public.dashboard_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  hash text not null check (hash ~ '^0x[0-9a-fA-F]{64}$'),
  created_at timestamptz not null default now()
);
alter table public.dashboard_wallets enable row level security;
alter table public.dashboard_transactions enable row level security;
revoke all on public.dashboard_wallets, public.dashboard_transactions from anon, authenticated;
grant select on public.dashboard_wallets, public.dashboard_transactions to authenticated;
create policy "Read own public wallet records" on public.dashboard_wallets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Read own transaction records" on public.dashboard_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
