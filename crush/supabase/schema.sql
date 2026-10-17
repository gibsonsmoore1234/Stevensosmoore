-- CRUSH — Supabase schema
-- Run once in Supabase Dashboard → SQL Editor (safe to re-run).
--
-- Privacy is enforced HERE, not in the front end:
--   • crush_picks are readable only by the person who made them. Nobody else —
--     including the person picked — can select, count or be notified of them.
--   • matches are written only by reveal_round() (security definer), and only
--     for pairs who picked each other in the same round.
--   • messages can be read/written only by the two members of a match.
--   • verification status can only be changed by the service role (your
--     liveness vendor's webhook or a moderator), never by the user.
--   • anonymous forum posts never expose author_id to other users.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  area text not null default '' check (char_length(area) <= 80),
  hobbies text not null default '' check (char_length(hobbies) <= 280),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 2),
  selfie_paths text[] not null default '{}' check (cardinality(selfie_paths) <= 2),
  verification text not null default 'unverified'
    check (verification in ('unverified', 'pending', 'verified', 'rejected')),
  pin_hash text,
  pin_failures int not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;


drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Users may edit their details but never their own verification state or PIN
-- fields directly (those go through the functions below / the service role).
revoke update on public.profiles from authenticated;
grant update (display_name, area, hobbies, photo_paths, selfie_paths) on public.profiles to authenticated;

create or replace function public.is_verified(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and verification = 'verified');
$$;

-- Columns other verified users may see. pin_hash, selfies and failure counters stay private.
create or replace view public.public_profiles
with (security_invoker = false) as
  select id, display_name, area, hobbies, photo_paths, verification
  from public.profiles
  where verification = 'verified' and public.is_verified();
grant select on public.public_profiles to authenticated;

-- Submitting selfies moves an unverified/rejected account to 'pending'.
-- Only the service role can set 'verified' or 'rejected'.
create or replace function public.submit_verification()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set verification = 'pending'
   where id = auth.uid()
     and verification in ('unverified', 'rejected')
     and cardinality(selfie_paths) = 2
     and cardinality(photo_paths) >= 1;
  if not found then
    raise exception 'Two live selfies and at least one profile photo are required';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Security PIN (4–6 digits, bcrypt, 5 tries then a 15-minute lock)
-- ---------------------------------------------------------------------------
create or replace function public.set_pin(new_pin text, current_pin text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare existing text;
begin
  if new_pin !~ '^\d{4,6}$' then raise exception 'PIN must be 4–6 digits'; end if;
  select pin_hash into existing from public.profiles where id = auth.uid();
  if existing is not null and not public.check_pin(current_pin) then
    raise exception 'Current PIN is incorrect';
  end if;
  update public.profiles set pin_hash = crypt(new_pin, gen_salt('bf', 10)), pin_failures = 0, pin_locked_until = null
   where id = auth.uid();
end $$;

create or replace function public.check_pin(pin text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid() for update;
  if p.pin_hash is null then return false; end if;
  if p.pin_locked_until is not null and p.pin_locked_until > now() then
    raise exception 'Too many attempts. Try again after %', to_char(p.pin_locked_until, 'HH24:MI');
  end if;
  if pin is not null and crypt(pin, p.pin_hash) = p.pin_hash then
    update public.profiles set pin_failures = 0, pin_locked_until = null where id = p.id;
    return true;
  end if;
  update public.profiles
     set pin_failures = p.pin_failures + 1,
         pin_locked_until = case when p.pin_failures + 1 >= 5 then now() + interval '15 minutes' end
   where id = p.id;
  return false;
end $$;

revoke execute on function public.check_pin(text) from public, anon;
revoke execute on function public.set_pin(text, text) from public, anon;
grant execute on function public.check_pin(text) to authenticated;
grant execute on function public.set_pin(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Map bubbles (communities) and memberships
-- ---------------------------------------------------------------------------
create table if not exists public.bubbles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  lat double precision not null check (lat between 24 and 50),
  lng double precision not null check (lng between -125 and -66),
  county_fips text not null check (county_fips ~ '^\d{5}$'),
  logo_url text check (logo_url is null or logo_url ~ '^https://'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.bubbles enable row level security;

create table if not exists public.memberships (
  bubble_id uuid not null references public.bubbles (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (bubble_id, user_id)
);
alter table public.memberships enable row level security;

-- The map reads bubble_stats; the base table (with created_by) is creator-only.
drop policy if exists "anyone reads bubbles" on public.bubbles;
drop policy if exists "creator reads own bubbles" on public.bubbles;
create policy "creator reads own bubbles" on public.bubbles for select to authenticated using (created_by = auth.uid());
drop policy if exists "verified users place bubbles" on public.bubbles;
create policy "verified users place bubbles" on public.bubbles
  for insert to authenticated with check (created_by = auth.uid() and public.is_verified());

drop policy if exists "members visible to verified users" on public.memberships;
create policy "members visible to verified users" on public.memberships
  for select to authenticated using (public.is_verified() or user_id = auth.uid());
drop policy if exists "join as yourself" on public.memberships;
create policy "join as yourself" on public.memberships
  for insert to authenticated with check (user_id = auth.uid() and public.is_verified());
drop policy if exists "leave as yourself" on public.memberships;
create policy "leave as yourself" on public.memberships
  for delete to authenticated using (user_id = auth.uid());

-- Public map feed: bubbles with member counts (no member identities).
create or replace view public.bubble_stats
with (security_invoker = false) as
  select b.id, b.name, b.lat, b.lng, b.county_fips, b.logo_url, b.created_at,
         (select count(*) from public.memberships m where m.bubble_id = b.id)::int as members
  from public.bubbles b;
grant select on public.bubble_stats to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Crush rounds, picks and matches
-- ---------------------------------------------------------------------------
create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  reveal_at timestamptz not null,
  revealed boolean not null default false,
  check (opens_at < closes_at and closes_at <= reveal_at)
);
alter table public.rounds enable row level security;
drop policy if exists "anyone reads rounds" on public.rounds;
create policy "anyone reads rounds" on public.rounds for select using (true);

create table if not exists public.crush_picks (
  round_id uuid not null references public.rounds (id) on delete cascade,
  picker_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  picked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, picker_id, picked_id),
  check (picker_id <> picked_id)
);
alter table public.crush_picks enable row level security;

-- The ONLY read policy: your own picks. There is deliberately no policy that
-- lets the picked person (or anyone else) see, count or aggregate a pick.
drop policy if exists "read own picks" on public.crush_picks;
create policy "read own picks" on public.crush_picks
  for select to authenticated using (picker_id = auth.uid());

create or replace function public.round_is_open(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rounds where id = r and now() between opens_at and closes_at and not revealed);
$$;

drop policy if exists "pick while round open" on public.crush_picks;
create policy "pick while round open" on public.crush_picks
  for insert to authenticated
  with check (picker_id = auth.uid() and public.is_verified() and public.is_verified(picked_id) and public.round_is_open(round_id));

drop policy if exists "unpick while round open" on public.crush_picks;
create policy "unpick while round open" on public.crush_picks
  for delete to authenticated using (picker_id = auth.uid() and public.round_is_open(round_id));

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (round_id, user_a, user_b)
);
alter table public.matches enable row level security;
drop policy if exists "members read own matches" on public.matches;
create policy "members read own matches" on public.matches
  for select to authenticated using (auth.uid() in (user_a, user_b));
-- No insert/update/delete policies: only reveal_round() writes matches.

-- Evaluates a round once its reveal time has passed. Only bidirectional pairs
-- from the SAME round become matches; everything else stays sealed.
create or replace function public.reveal_round(r uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform 1 from public.rounds where id = r and reveal_at <= now() and not revealed for update;
  if not found then return 0; end if;

  insert into public.matches (round_id, user_a, user_b)
  select a.round_id, least(a.picker_id, a.picked_id), greatest(a.picker_id, a.picked_id)
    from public.crush_picks a
    join public.crush_picks b
      on b.round_id = a.round_id and b.picker_id = a.picked_id and b.picked_id = a.picker_id
   where a.round_id = r and a.picker_id < a.picked_id
  on conflict do nothing;
  get diagnostics n = row_count;

  update public.rounds set revealed = true where id = r;
  return n;
end $$;
revoke execute on function public.reveal_round(uuid) from public, anon, authenticated;

create or replace function public.reveal_due_rounds()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.rounds where reveal_at <= now() and not revealed loop
    perform public.reveal_round(r.id);
  end loop;
end $$;
revoke execute on function public.reveal_due_rounds() from public, anon, authenticated;

-- Run reveals every minute (enable the pg_cron extension under Database → Extensions first).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'crush-reveal';
    perform cron.schedule('crush-reveal', '* * * * *', 'select public.reveal_due_rounds()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Mutual-only messages
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;

create or replace function public.in_match(m uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.matches where id = m and auth.uid() in (user_a, user_b));
$$;

drop policy if exists "match members read" on public.messages;
create policy "match members read" on public.messages
  for select to authenticated using (public.in_match(match_id));
drop policy if exists "match members send" on public.messages;
create policy "match members send" on public.messages
  for insert to authenticated with check (sender_id = auth.uid() and public.in_match(match_id));

-- ---------------------------------------------------------------------------
-- Community forums (one board per bubble)
-- ---------------------------------------------------------------------------
create table if not exists public.threads (
  id uuid primary key default gen_random_uuid(),
  bubble_id uuid not null references public.bubbles (id) on delete cascade,
  topic text not null check (topic in ('campus', 'dating', 'events', 'qa', 'lifestyle')),
  title text not null check (char_length(title) between 3 and 140),
  body text not null default '' check (char_length(body) <= 5000),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  anonymous boolean not null default false,
  poll_options text[] check (poll_options is null or cardinality(poll_options) between 2 and 6),
  created_at timestamptz not null default now()
);
alter table public.threads enable row level security;

create table if not exists public.posts (
  id bigint generated always as identity primary key,
  thread_id uuid not null references public.threads (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  author_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  anonymous boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.posts enable row level security;

create table if not exists public.poll_votes (
  thread_id uuid not null references public.threads (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  option_index int not null check (option_index between 0 and 5),
  primary key (thread_id, user_id)
);
alter table public.poll_votes enable row level security;

create or replace function public.is_member(b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_verified() and exists (select 1 from public.memberships where bubble_id = b and user_id = auth.uid());
$$;

-- Base tables are readable only for your own rows; everyone else reads through
-- the views below, which hide author_id on anonymous posts.
drop policy if exists "own threads" on public.threads;
create policy "own threads" on public.threads for select to authenticated using (author_id = auth.uid());
drop policy if exists "members post threads" on public.threads;
create policy "members post threads" on public.threads
  for insert to authenticated with check (author_id = auth.uid() and public.is_member(bubble_id));

drop policy if exists "own posts" on public.posts;
create policy "own posts" on public.posts for select to authenticated using (author_id = auth.uid());
drop policy if exists "members reply" on public.posts;
create policy "members reply" on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_member((select bubble_id from public.threads t where t.id = thread_id)));

drop policy if exists "own votes" on public.poll_votes;
create policy "own votes" on public.poll_votes for select to authenticated using (user_id = auth.uid());
drop policy if exists "members vote" on public.poll_votes;
create policy "members vote" on public.poll_votes
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_member((select bubble_id from public.threads t where t.id = thread_id)));

create or replace view public.thread_feed
with (security_invoker = false) as
  select t.id, t.bubble_id, t.topic, t.title, t.body, t.anonymous, t.poll_options, t.created_at,
         case when t.anonymous then null else t.author_id end as author_id,
         case when t.anonymous then 'Anonymous' else coalesce(p.display_name, 'Member') end as author_name,
         (select count(*) from public.posts x where x.thread_id = t.id)::int as replies,
         (select coalesce(array_agg(c order by i), '{}') from (
            select i, (select count(*) from public.poll_votes v where v.thread_id = t.id and v.option_index = i)::int as c
            from generate_series(0, coalesce(cardinality(t.poll_options), 0) - 1) i) s) as poll_counts
  from public.threads t
  left join public.profiles p on p.id = t.author_id
  where public.is_member(t.bubble_id);
grant select on public.thread_feed to authenticated;

create or replace view public.post_feed
with (security_invoker = false) as
  select x.id, x.thread_id, x.body, x.anonymous, x.created_at,
         case when x.anonymous then null else x.author_id end as author_id,
         case when x.anonymous then 'Anonymous' else coalesce(p.display_name, 'Member') end as author_name
  from public.posts x
  join public.threads t on t.id = x.thread_id
  left join public.profiles p on p.id = x.author_id
  where public.is_member(t.bubble_id);
grant select on public.post_feed to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: profile photos (readable by verified users) and selfies (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('photos', 'photos', false), ('selfies', 'selfies', false)
on conflict (id) do nothing;

drop policy if exists "upload own photos" on storage.objects;
create policy "upload own photos" on storage.objects for insert to authenticated
  with check (bucket_id in ('photos', 'selfies') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "replace own photos" on storage.objects;
create policy "replace own photos" on storage.objects for update to authenticated
  using (bucket_id in ('photos', 'selfies') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "read photos" on storage.objects;
create policy "read photos" on storage.objects for select to authenticated
  using ((bucket_id = 'photos' and (public.is_verified() or (storage.foldername(name))[1] = auth.uid()::text))
      or (bucket_id = 'selfies' and (storage.foldername(name))[1] = auth.uid()::text));

-- Realtime for chat
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
