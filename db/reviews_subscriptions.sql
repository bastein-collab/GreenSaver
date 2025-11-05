-- db/reviews_subscriptions.sql
-- Subscriptions and Reviews with RLS. Subscribers can write reviews; everyone can read.

begin;

-- Profiles (one row per auth user)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  display_name text
);

-- Subscriptions (current status per user)
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'pro',
  status text not null default 'inactive', -- active|past_due|canceled|inactive
  current_period_end timestamptz,
  updated_at timestamptz default now()
);

-- Helper to check subscription status
create or replace function public.has_active_subscription(p_user uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user
      and s.status = 'active'
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Reviews (paid feature)
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dispensary_id uuid references public.dispensaries(id) on delete set null,
  brand_name text,
  product_name text,
  rating int check (rating between 1 and 5),
  body text,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.reviews enable row level security;

-- Policies: anyone can read
drop policy if exists "public read reviews" on public.reviews;
create policy "public read reviews" on public.reviews
  for select to anon, authenticated using (true);

-- Only owners with active subscription can insert
drop policy if exists "subscribers insert reviews" on public.reviews;
create policy "subscribers insert reviews" on public.reviews
  for insert to authenticated
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and public.has_active_subscription(auth.uid())
  );

-- Owners can update/delete their reviews (optional)
drop policy if exists "owners update reviews" on public.reviews;
create policy "owners update reviews" on public.reviews
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "owners delete reviews" on public.reviews;
create policy "owners delete reviews" on public.reviews
  for delete to authenticated using (user_id = auth.uid());

commit;

