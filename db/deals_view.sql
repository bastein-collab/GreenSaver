-- db/deals_view.sql
-- Simple PostgREST-friendly view for the Deals list screen.

begin;

create or replace view public.deals_view as
select
  de.id,
  de.product_name,
  b.name as brand_name,
  d.name as dispensary_name,
  coalesce(de.percent_off, 0) as percent_off,
  de.price_cents,
  de.postal_code
from public.deals de
left join public.brands b on b.id = de.brand_id
left join public.dispensaries d on d.id = de.dispensary_id;

commit;

