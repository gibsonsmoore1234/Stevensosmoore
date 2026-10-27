-- Gibson Moore Art Commission — petition schema
-- Run once in Supabase → SQL Editor (safe to re-run).
--
-- A signature is accepted only from a signed-in user whose verified email
-- ends in @duke.edu (they confirm by clicking the link Supabase emails them),
-- one signature per email. Emails and drawn signatures are never public:
-- visitors only read the count and "First L." names through the views below.

create table if not exists public.signatures (
  id bigint generated always as identity primary key,
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  email text not null unique check (email ~* '^[^@\s]+@duke\.edu$'),
  full_name text not null check (char_length(full_name) between 3 and 80),
  affiliation text not null check (affiliation in ('undergrad', 'grad', 'faculty_staff', 'alumni')),
  authorized boolean not null default false,
  signature_png text check (signature_png is null or (signature_png like 'data:image/png;base64,%' and char_length(signature_png) < 200000)),
  comment text check (comment is null or char_length(comment) <= 500),
  comment_public boolean not null default false,
  hidden boolean not null default false,  -- moderators can hide a comment/name
  created_at timestamptz not null default now(),
  check (authorized or signature_png is not null)
);
alter table public.signatures enable row level security;

-- Sign once, as yourself, with your verified Duke email.
drop policy if exists "sign as yourself" on public.signatures;
create policy "sign as yourself" on public.signatures
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and lower(email) = lower(auth.jwt() ->> 'email')
    and (auth.jwt() ->> 'email') ~* '@duke\.edu$'
  );

drop policy if exists "read own signature" on public.signatures;
create policy "read own signature" on public.signatures
  for select to authenticated using (user_id = auth.uid());

-- Public: total count only.
create or replace view public.signature_count
with (security_invoker = false) as
  select count(*)::int as total from public.signatures;

-- Public: recent signers as "First L." + affiliation. Comments only when the
-- signer ticked "show my comment".
create or replace view public.recent_signers
with (security_invoker = false) as
  select id,
         case when cardinality(p.parts) > 1
              then p.parts[1] || ' ' || left(p.parts[cardinality(p.parts)], 1) || '.'
              else p.parts[1] end as display_name,
         affiliation,
         case when comment_public then comment end as comment,
         created_at
  from public.signatures,
       lateral (select regexp_split_to_array(trim(full_name), '\s+') as parts) p
  where not hidden
  order by created_at desc
  limit 50;

grant select on public.signature_count, public.recent_signers to anon, authenticated;
