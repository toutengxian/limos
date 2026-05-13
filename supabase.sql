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
