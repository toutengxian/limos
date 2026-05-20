create table if not exists public.fat_battle_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.fat_battle_state enable row level security;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'fat_battle_state'
  loop
    execute format('drop policy if exists %I on public.fat_battle_state', policy_name);
  end loop;
end $$;

create policy "limos read state"
  on public.fat_battle_state
  for select
  to anon
  using (true);

create policy "limos write state"
  on public.fat_battle_state
  for insert
  to anon
  with check (true);

create policy "limos update state"
  on public.fat_battle_state
  for update
  to anon
  using (true)
  with check (true);

create table if not exists public.limos_weight_entries (
  state_id text not null,
  participant_id text not null,
  entry_date date not null,
  weight numeric(5, 1) not null,
  mutation_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (state_id, participant_id, entry_date),
  constraint limos_weight_entries_weight_check check (weight >= 30 and weight <= 250)
);

alter table public.limos_weight_entries enable row level security;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'limos_weight_entries'
  loop
    execute format('drop policy if exists %I on public.limos_weight_entries', policy_name);
  end loop;
end $$;

create policy "limos read weight entries"
  on public.limos_weight_entries
  for select
  to anon
  using (true);

create policy "limos insert weight entries"
  on public.limos_weight_entries
  for insert
  to anon
  with check (true);

create policy "limos update weight entries"
  on public.limos_weight_entries
  for update
  to anon
  using (true)
  with check (true);

create table if not exists public.limos_state_backups (
  id bigint generated always as identity primary key,
  state_id text not null,
  source text not null default 'manual',
  payload jsonb not null,
  weight_entries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists limos_state_backups_state_created_idx
  on public.limos_state_backups (state_id, created_at desc);

alter table public.limos_state_backups enable row level security;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'limos_state_backups'
  loop
    execute format('drop policy if exists %I on public.limos_state_backups', policy_name);
  end loop;
end $$;

create policy "limos insert backups"
  on public.limos_state_backups
  for insert
  to anon
  with check (true);

create policy "limos read backups"
  on public.limos_state_backups
  for select
  to anon
  using (true);
