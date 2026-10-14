-- Stevensosmoore — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor (safe to re-run).
-- Admin access is granted ONLY to users listed in public.admins, so a random
-- sign-up can never edit the site even if email sign-ups are left enabled.

-- If the older prototype's tables exist (artworks.image_path / admin_users),
-- move them aside so nothing is lost and the new tables can be created.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'artworks' and column_name = 'image_path') then
    alter table public.artworks rename to artworks_legacy_v1;
  end if;
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'admin_users') then
    alter table public.admin_users rename to admin_users_legacy_v1;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Admin allow-list
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

drop policy if exists "admins can read own row" on public.admins;
create policy "admins can read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Artworks
-- ---------------------------------------------------------------------------
create table if not exists public.artworks (
  id            bigint generated always as identity primary key,
  title         text not null check (char_length(title) between 1 and 200),
  category      text not null default 'oil'
                check (category in ('oil', 'acrylic', 'charcoal', 'drawing', 'mixed-media', 'other')),
  medium        text check (char_length(medium) <= 200),          -- e.g. "Oil on canvas"
  year          int check (year between 1900 and 2200),
  dimensions    text check (char_length(dimensions) <= 120),      -- e.g. "36 × 48 in"
  description   text check (char_length(description) <= 5000),
  price         numeric(10, 2) check (price is null or price >= 0), -- null = price on request
  status        text not null default 'available'
                check (status in ('available', 'reserved', 'sold', 'nfs')),
  purchase_url  text check (purchase_url is null or purchase_url ~* '^https://'),
  alt_text      text check (char_length(alt_text) <= 600),  -- what the image shows, for screen readers
  image_url     text not null,
  thumb_url     text,
  image_width   int,
  image_height  int,
  storage_path  text,      -- folder prefix in the "artworks" bucket; null for bundled starter images
  featured      boolean not null default false,
  sort_order    int not null default 0,
  published     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.artworks add column if not exists alt_text text check (char_length(alt_text) <= 600);
create index if not exists artworks_public_idx on public.artworks (published, sort_order, created_at desc);

drop trigger if exists artworks_touch on public.artworks;
create trigger artworks_touch before update on public.artworks
  for each row execute function public.touch_updated_at();

alter table public.artworks enable row level security;

drop policy if exists "public reads published artworks" on public.artworks;
create policy "public reads published artworks" on public.artworks
  for select to anon, authenticated using (published or public.is_admin());

drop policy if exists "admins insert artworks" on public.artworks;
create policy "admins insert artworks" on public.artworks
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admins update artworks" on public.artworks;
create policy "admins update artworks" on public.artworks
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete artworks" on public.artworks;
create policy "admins delete artworks" on public.artworks
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Site settings (single row, id = 1)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  id               int primary key default 1 check (id = 1),
  tagline          text check (char_length(tagline) <= 300),
  about            text check (char_length(about) <= 6000),
  contact_email    text check (char_length(contact_email) <= 320),
  instagram        text not null default 'stevensosmoore' check (char_length(instagram) <= 60),
  hero_artwork_id  bigint references public.artworks (id) on delete set null,
  updated_at       timestamptz not null default now()
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists site_settings_touch on public.site_settings;
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists "public reads settings" on public.site_settings;
create policy "public reads settings" on public.site_settings
  for select to anon, authenticated using (true);

drop policy if exists "admins update settings" on public.site_settings;
create policy "admins update settings" on public.site_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin() and id = 1);

-- ---------------------------------------------------------------------------
-- Inquiries (purchase / commission / general messages from visitors)
-- Visitors may INSERT only; they can never read anything back.
-- ---------------------------------------------------------------------------
create table if not exists public.inquiries (
  id          bigint generated always as identity primary key,
  artwork_id  bigint references public.artworks (id) on delete set null,
  kind        text not null default 'general' check (kind in ('purchase', 'commission', 'general')),
  name        text not null check (char_length(name) between 1 and 200),
  email       text not null check (char_length(email) between 3 and 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message     text check (char_length(message) <= 5000),
  status      text not null default 'new' check (status in ('new', 'replied', 'archived')),
  created_at  timestamptz not null default now()
);
create index if not exists inquiries_created_idx on public.inquiries (created_at desc);

alter table public.inquiries enable row level security;

drop policy if exists "anyone can send an inquiry" on public.inquiries;
create policy "anyone can send an inquiry" on public.inquiries
  for insert to anon, authenticated with check (status = 'new');

drop policy if exists "admins read inquiries" on public.inquiries;
create policy "admins read inquiries" on public.inquiries
  for select to authenticated using (public.is_admin());

drop policy if exists "admins update inquiries" on public.inquiries;
create policy "admins update inquiries" on public.inquiries
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete inquiries" on public.inquiries;
create policy "admins delete inquiries" on public.inquiries
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage bucket for uploaded artwork images (public read via URL)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artworks', 'artworks', true, 26214400, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Remove over-broad policies from the older prototype's setup guide
-- (policies are OR'd together, so these would bypass the admin check).
drop policy if exists "Allow public to read artworks" on storage.objects;
drop policy if exists "Allow authenticated users to upload" on storage.objects;

drop policy if exists "admins read artwork files" on storage.objects;
create policy "admins read artwork files" on storage.objects
  for select to authenticated using (bucket_id = 'artworks' and public.is_admin());

drop policy if exists "admins upload artwork files" on storage.objects;
create policy "admins upload artwork files" on storage.objects
  for insert to authenticated with check (bucket_id = 'artworks' and public.is_admin());

drop policy if exists "admins update artwork files" on storage.objects;
create policy "admins update artwork files" on storage.objects
  for update to authenticated using (bucket_id = 'artworks' and public.is_admin());

drop policy if exists "admins delete artwork files" on storage.objects;
create policy "admins delete artwork files" on storage.objects
  for delete to authenticated using (bucket_id = 'artworks' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Make yourself the admin (run AFTER creating your user under
-- Authentication → Users → "Add user"). Replace the email first.
-- ---------------------------------------------------------------------------
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'you@example.com'
-- on conflict do nothing;
