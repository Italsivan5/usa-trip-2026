-- USA Trip 2026 — Supabase schema
-- Run this entire file once in Supabase > SQL Editor.
-- This version intentionally uses ONE shared family Auth user for the simplest setup.

create table if not exists public.trip_state (
  trip_id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by_client text
);

create index if not exists trip_state_owner_idx on public.trip_state(owner_id);

create or replace function public.set_trip_state_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trip_state_set_updated_at on public.trip_state;
create trigger trip_state_set_updated_at
before update on public.trip_state
for each row execute function public.set_trip_state_updated_at();

alter table public.trip_state enable row level security;

-- Least privilege: signed-out visitors have no table access.
revoke all on table public.trip_state from anon, authenticated;
grant select, insert, update on table public.trip_state to authenticated;

drop policy if exists "trip_state_select_own" on public.trip_state;
create policy "trip_state_select_own"
on public.trip_state for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "trip_state_insert_own" on public.trip_state;
create policy "trip_state_insert_own"
on public.trip_state for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

drop policy if exists "trip_state_update_own" on public.trip_state;
create policy "trip_state_update_own"
on public.trip_state for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = owner_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = owner_id);

-- Realtime: add the table to Supabase's publication if it is not there already.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='trip_state'
  ) then
    alter publication supabase_realtime add table public.trip_state;
  end if;
end $$;

-- Optional verification query:
select tablename, rowsecurity from pg_tables where schemaname='public' and tablename='trip_state';
