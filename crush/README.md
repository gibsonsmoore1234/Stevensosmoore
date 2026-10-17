# CRUSH

Double-blind crush reveals plus a map of local communities. One-way picks stay sealed. Chat opens only when two people pick each other in the same round.

CRUSH is independent and not affiliated with or endorsed by Duke University or any other school.

- **Tab 1, Map:** the lower-48 US on Leaflet with CARTO `light_all` tiles and county outlines from `/api/geo/us`. The map starts with no bubbles. Users click to drop a 44×44 pending pin and name a community. A county turns dark grey (`#52525B`) once it has a bubble. Bubbles grow with √members (56–150px) and shrink to 40% when zoomed out. They're spread apart by a two-phase layout: a uniform shrink, then 120 nudging passes clamped to each bubble's county.
- **Tab 2, Hub:** profile and identity verification (two live selfies plus a 4–6 digit PIN), confidential crush picks, mutual-only messages, and forums for each community (topics, polls, anonymous posting).

It's a static site on Vercel with data, auth, storage and realtime on Supabase. There's no server code.

```
public/
  index.html               app shell (sign-in, PIN, two tabs)
  assets/css/crush.css     4-colour design system
  assets/js/app.js         auth gates, tabs, bubble drawer
  assets/js/map.js         Tab 1: Leaflet map, counties, bubble placement
  assets/js/spread.js      bubble sizing + anti-overlap layout (unit tested)
  assets/js/hub.js         Tab 2: profile/verify, crushes, messages, forums
  assets/js/verify.js      WebRTC selfie capture + on-device presence check
  assets/js/data.js        Supabase data layer, or local demo backend
  assets/vendor/           Supabase JS, Leaflet 1.9.4, topojson-client 3.1.0
  data/us-counties-10m.json  us-atlas 3.0.1 (served at /api/geo/us)
supabase/schema.sql        tables, row-level security, reveal job, storage
scripts/build.mjs          writes public/env.js from env vars
scripts/dev.mjs            local preview server
test/                      node --test unit tests
```

## Try it locally (no setup)

```bash
cd crush
npm run dev        # http://localhost:3001
npm test
```

Without Supabase settings the app runs in **demo mode**. Everything is stored in your browser's localStorage, any 6-digit code signs you in, and verification is approved automatically. There are four sample people. Jordan and Sam "pick you back", so you can try a reveal with the **Demo: run reveal now** button.

## Going live

### 1. Supabase

1. Create a project, open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. You can safely run it again.
2. Go to **Database → Extensions** and enable **pg_cron**, then run the schema once more. That schedules `reveal_due_rounds()` to run every minute.
3. Under **Authentication → Providers**, turn on **Email** with the OTP code template. Turn on **Phone** too if you want SMS sign-up (it needs Twilio or another SMS provider).
4. Create a round:
   ```sql
   insert into public.rounds (name, opens_at, closes_at, reveal_at)
   values ('Fall Round', now(), '2026-10-28 23:00-04', '2026-10-28 23:11-04');
   ```

### 2. Vercel

Create a Vercel project with **Root Directory** set to `crush`. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`, using the public anon key and never the service-role key. The build refuses a secret key. This is a separate project from the Stevensosmoore gallery.

## How privacy is enforced

The rules live in Postgres row-level security, not in the front end:

| Rule | Where |
| --- | --- |
| Only the person who made a pick can read it. There's no policy that lets anyone else see or count it. | `crush_picks` policies |
| Picks require both people to be verified and the round to be open. They can't be changed after the round closes. | `pick while round open` |
| Matches are written only by `reveal_round()`, and only for two-way pairs in the same round. Users can't insert them or run the reveal. | `matches`, `reveal_round` |
| Messages can be read and sent only by the two people in a match. | `in_match()` |
| Users can't set their own verification status. Only the service role can. | column grants on `profiles` |
| PINs are stored as bcrypt hashes. Five wrong tries lock the PIN for 15 minutes. | `set_pin`, `check_pin` |
| Anonymous posts never expose `author_id`. People outside a community can't read its board. | `thread_feed`, `post_feed` |
| Selfies sit in a private bucket that only their owner can read. | storage policies |

These rules were checked against Postgres 16 with Supabase auth stubs. The checks were: one-way picks stay invisible, unverified users can't pick, users can't verify themselves, forged matches are rejected, reveal produces exactly one match for a two-way pair, outsiders can't send messages, PIN lockout works, and anonymous authors stay hidden.

## Identity verification: what's built and what you still need

The app captures a **front** and a **side** selfie live from the camera (WebRTC). Before upload it runs an on-device check for motion, lighting and (where the browser supports it) a single face. It uploads both selfies and your profile photos privately and sets the account to `pending`.

The on-device check only catches obvious problems like a frozen frame or a dark camera. It **cannot** stop a determined spoof or deepfake, and the browser does **no** face matching. To deliver the spec's liveness check and selfie-to-photo match, connect a vendor such as AWS Rekognition Face Liveness + CompareFaces, Persona, Onfido or iProov. The vendor's webhook (or a moderator) should then run, using the service role:

```sql
update public.profiles set verification = 'verified' where id = '<user id>';   -- or 'rejected'
```

Until then, accounts wait in `pending`, and a moderator can review them in the Supabase dashboard.

## Other gaps to know about

- **Messages are not end-to-end encrypted.** They're protected by TLS and row-level security, so the database operator can technically read them. True E2E needs per-device keys (for example WebCrypto ECDH) and is a larger follow-up.
- **The PIN is an unlock step, not a password replacement.** Sign-in uses a one-time code sent to your email or phone. After that, the PIN unlocks the app once per browser session. Supabase has no built-in "PIN as password" login.
- **Map tiles:** CARTO's free basemaps have usage limits. Check their terms before launch.
- **School logos:** bubbles support a `logo_url`, but nothing in the UI uploads one yet.
