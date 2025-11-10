-- db/deals_geo.sql
-- RPCs to fetch deals near a point or ZIP, respecting a radius.

begin;

-- Deals near a latitude/longitude
create or replace function public.get_deals_near(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision,
  p_limit integer default 100,
  p_types text[] default null,
  p_min_off numeric default null,
  p_max_price_cents integer default null,
  p_brand_names text[] default null,
  p_query text default null
)
returns table (
  id uuid,
  product_name text,
  brand_name text,
  dispensary_name text,
  percent_off numeric,
  price_cents integer,
  postal_code text,
  product_type text,
  category text,
  subcategory text
) language sql stable as $$
  select
    de.id,
    de.product_name,
    b.name as brand_name,
    d.name as dispensary_name,
    coalesce(de.percent_off, 0) as percent_off,
    de.price_cents,
    d.postal_code,
    de.product_type,
    de.category,
    de.subcategory
  from public.deals de
  join public.dispensaries d on d.id = de.dispensary_id
  left join public.brands b on b.id = de.brand_id
  where d.lat is not null and d.lon is not null
    and 2 * 6371 * asin(
          sqrt(
            pow(sin(radians((d.lat - p_lat)/2)),2) +
            cos(radians(p_lat)) * cos(radians(d.lat)) *
            pow(sin(radians((d.lon - p_lon)/2)),2)
          )
        ) <= p_radius_km
    and (
      p_types is null or array_length(p_types,1) is null or
      exists (
        select 1 from unnest(p_types) t
        where lower(coalesce(de.product_type, de.category, de.subcategory, de.product_name)) like ('%' || lower(t) || '%')
      )
    )
    and (
      p_min_off is null or coalesce(de.percent_off,0) >= p_min_off
    )
    and (
      p_max_price_cents is null or de.price_cents <= p_max_price_cents
    )
    and (
      p_brand_names is null or array_length(p_brand_names,1) is null or
      exists (
        select 1 from unnest(p_brand_names) bn
        where lower(b.name) = lower(bn)
      )
    )
    and (
      p_query is null or p_query = '' or
      lower(coalesce(de.product_name,'') || ' ' || coalesce(b.name,'') || ' ' || coalesce(de.product_type,'') || ' ' || coalesce(de.category,'') || ' ' || coalesce(de.subcategory,'')) like ('%' || lower(p_query) || '%')
    )
  order by coalesce(de.percent_off,0) desc nulls last, de.price_cents asc nulls last
  limit greatest(least(p_limit, 200), 1);
$$;

-- Deals near a ZIP
create or replace function public.get_deals_near_zip(
  p_zip text,
  p_radius_km double precision,
  p_limit integer default 100,
  p_types text[] default null,
  p_min_off numeric default null,
  p_max_price_cents integer default null,
  p_brand_names text[] default null,
  p_query text default null
)
returns table (
  id uuid,
  product_name text,
  brand_name text,
  dispensary_name text,
  percent_off numeric,
  price_cents integer,
  postal_code text,
  product_type text,
  category text,
  subcategory text
) language sql stable as $$
  with center as (
    select avg(lat)::double precision as lat, avg(lon)::double precision as lon
    from public.dispensaries
    where postal_code = p_zip and lat is not null and lon is not null
  )
  select g.*
  from center c
  join lateral public.get_deals_near(c.lat, c.lon, p_radius_km, p_limit, p_types, p_min_off, p_max_price_cents, p_brand_names, p_query) as g
    on true;
$$;

commit;
