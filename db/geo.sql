-- db/geo.sql
-- Geo helpers for radius search by lat/lon and by ZIP.

begin;

-- 1) ZIP centroid table (minimal columns for demo)
create table if not exists public.us_zip_centroids (
  zip text primary key,
  city text,
  state text,
  lat double precision not null,
  lon double precision not null
);

-- Sample seeds (New Jersey focus; add more as needed)
insert into public.us_zip_centroids (zip, city, state, lat, lon)
values
  ('08757','Toms River','NJ',39.9536,-74.1979),
  ('07302','Jersey City','NJ',40.7216,-74.0471),
  ('07030','Hoboken','NJ',40.7440,-74.0324),
  ('08002','Cherry Hill','NJ',39.9270,-75.0110),
  ('08608','Trenton','NJ',40.2206,-74.7699)
on conflict (zip) do nothing;

-- 2) Helper distance function (Haversine, km)
create or replace function public.haversine_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
) returns double precision language sql immutable as $$
  select 2 * 6371 * asin(
    sqrt(
      pow(sin(radians(($3 - $1) / 2)), 2) +
      cos(radians($1)) * cos(radians($3)) * pow(sin(radians(($4 - $2) / 2)), 2)
    )
  );
$$;

-- 3) RPC: summaries near a point (lat/lon) within radius_km.
-- Requires dispensaries(lat, lon) and view v_deals_by_store.
create or replace function public.get_store_summaries_near(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision default 25
)
returns table (
  dispensary_id uuid,
  dispensary_name text,
  city text,
  distance_km double precision,
  deals_count integer,
  max_off numeric,
  avg_price numeric,
  median_price numeric,
  last_scraped timestamptz
) language sql stable as $$
  select s.dispensary_id,
         s.dispensary_name,
         s.city,
         public.haversine_km($1,$2,d.lat,d.lon) as distance_km,
         s.deals_count,
         s.max_off,
         s.avg_price,
         s.median_price,
         s.last_scraped
  from public.v_deals_by_store s
  join public.dispensaries d on d.id = s.dispensary_id
  where d.lat is not null and d.lon is not null
    and public.haversine_km($1,$2,d.lat,d.lon) <= $3
  order by distance_km asc, max_off desc nulls last
  limit 50;
$$;

-- 4) Convenience RPC: by ZIP -> lat/lon
create or replace function public.get_store_summaries_near_zip(
  p_zip text,
  p_radius_km double precision default 25
) returns table (
  dispensary_id uuid,
  dispensary_name text,
  city text,
  distance_km double precision,
  deals_count integer,
  max_off numeric,
  avg_price numeric,
  median_price numeric,
  last_scraped timestamptz
) language sql stable as $$
  select s.*
  from public.us_zip_centroids z
  join lateral public.get_store_summaries_near(z.lat, z.lon, p_radius_km) as s on true
  where z.zip = p_zip;
$$;

commit;
