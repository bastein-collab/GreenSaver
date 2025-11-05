-- db/security_init.sql
-- GreenSaver: security baseline (idempotent)
-- Safe to re-run. Adjust object names if you add new tables/views.

begin;

--------------------------------------------------------------------------------
-- 0) Roles & extensions (defensive – Supabase usually creates these)
--------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit;
  end if;
end $$;

grant usage on schema public to anon, authenticated;

alter default privileges in schema public
  revoke insert, update, delete on tables from public;
alter default privileges in schema public
  grant select on tables to anon, authenticated;

--------------------------------------------------------------------------------
-- 1) Enable RLS on BASE TABLES ONLY
--------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='dispensaries')
  then execute 'alter table public.dispensaries enable row level security';
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='brands')
  then execute 'alter table public.brands enable row level security';
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='deals')
  then execute 'alter table public.deals enable row level security';
  end if;
end $$;

--------------------------------------------------------------------------------
-- 2) Public read policies on base tables
--------------------------------------------------------------------------------
-- dispensaries
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public'
             and tablename='dispensaries' and policyname='public read dispensaries')
  then
    execute 'drop policy "public read dispensaries" on public.dispensaries';
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='dispensaries')
  then
    execute $p$create policy "public read dispensaries"
      on public.dispensaries for select
      to anon, authenticated
      using (true)$p$;
  end if;
end $$;

-- brands
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public'
             and tablename='brands' and policyname='public read brands')
  then
    execute 'drop policy "public read brands" on public.brands';
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='brands')
  then
    execute $p$create policy "public read brands"
      on public.brands for select
      to anon, authenticated
      using (true)$p$;
  end if;
end $$;

-- deals
do $$
begin
  if exists (select 1 from pg_policies where schemaname='public'
             and tablename='deals' and policyname='public read deals')
  then
    execute 'drop policy "public read deals" on public.deals';
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='deals')
  then
    execute $p$create policy "public read deals"
      on public.deals for select
      to anon, authenticated
      using (true)$p$;
  end if;
end $$;

--------------------------------------------------------------------------------
-- 3) Views/materialized views: GRANT SELECT (RLS does not apply to views)
--------------------------------------------------------------------------------
do $$
declare v text;
begin
  foreach v in array array[
    'top_dispensaries_today',
    'top_brands_today',
    'deals_by_dispensary_today',
    'deals_norm'
  ]
  loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='public' and c.relname=v and c.relkind in ('v','m')
    ) then
      execute format('grant select on public.%I to anon, authenticated', v);
    end if;
  end loop;
end $$;

--------------------------------------------------------------------------------
-- 5) Revoke risky privileges from PUBLIC (defense-in-depth)
--------------------------------------------------------------------------------
revoke all on all tables    in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;

grant select on all tables in schema public to anon, authenticated;

commit;
