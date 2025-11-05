-- db/schema_example.sql
-- Minimal tables and views to power the current app.
-- Adjust names or columns to match your scraper outputs.

begin;

-- Base tables ---------------------------------------------------------------
create table if not exists public.dispensaries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  state text default 'NJ',
  postal_code text,
  lat double precision,
  lon double precision
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  dispensary_id uuid references public.dispensaries(id) on delete cascade,
  brand_id uuid references public.brands(id) on delete cascade,
  product_name text not null,
  price_cents integer not null,
  percent_off numeric default 0,
  scraped_at timestamptz default now(),
  postal_code text
);

-- Views --------------------------------------------------------------------
-- Daily store summary used by the Savers header card
create or replace view public.v_deals_by_store as
select d.id as dispensary_id,
       d.name as dispensary_name,
       d.city,
       count(*)::int as deals_count,
       coalesce(max(de.percent_off), 0)::numeric as max_off,
       round(avg(nullif(de.price_cents,0))/100.0,2) as avg_price,
       percentile_disc(0.5) within group (order by nullif(de.price_cents,0)) / 100.0 as median_price,
       max(de.scraped_at) as last_scraped
from public.dispensaries d
left join public.deals de on de.dispensary_id = d.id
group by 1,2,3;

-- Top brands today used by the peach card
create or replace view public.top_brands_today as
select b.id,
       b.name as brand_name,
       count(*)::int as deals_count,
       coalesce(max(de.percent_off),0)::numeric as max_off
from public.brands b
left join public.deals de on de.brand_id = b.id
  and de.scraped_at::date = now()::date
group by 1,2
order by max_off desc nulls last;

commit;

