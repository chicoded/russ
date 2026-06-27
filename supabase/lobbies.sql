-- Run once in Supabase SQL editor (free tier at supabase.com)
create table if not exists public.lobbies (
  code text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.lobbies enable row level security;

drop policy if exists "lobbies_public_all" on public.lobbies;
create policy "lobbies_public_all" on public.lobbies
  for all using (true) with check (true);

create index if not exists lobbies_updated_at_idx on public.lobbies (updated_at desc);
