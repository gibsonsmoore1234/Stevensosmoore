# Stevensosmoore

Portfolio and shop for the painter **Stevensosmoore** — live at **https://www.stevensosmoore.com**.

- **Oil paintings** for sale, plus **other media** (acrylic, charcoal, drawings, mixed media)
- Artwork pages with gallery-style wall labels, "Purchase" (optional Stripe Payment Link) or "Inquire" buttons, and a red dot when a work is sold
- A private **Studio** admin at `/admin` to upload, edit, reorder, price and mark works sold, read inquiries, and edit the site's text
- Static site on **Vercel**, data + images + login on **Supabase**, deploys from **GitHub** `main`

---

## How it fits together

```
GitHub (main) ──push──▶ Vercel ──serves──▶ www.stevensosmoore.com
                          │ build: scripts/build.mjs writes public/env.js
                          │        (public Supabase URL + anon key only)
                          ▼
                       Supabase
                         • Postgres: artworks, inquiries, site_settings, admins
                         • Storage:  "artworks" bucket (uploaded images)
                         • Auth:     your admin login (email + password)
```

There are no servers to run. Visitors read published artworks straight from Supabase with the public key. Row Level Security means only accounts listed in the `admins` table can change anything.

```
public/
  index.html             public site (single page: home, galleries, work pages, about, contact)
  admin.html             the Studio admin (/admin)
  404.html
  assets/css/base.css    shared design tokens — palette sampled from the artist's paintings
  assets/js/api.js       public data layer (Supabase REST, falls back to the starter collection)
  assets/vendor/         Supabase JS (bundled, used only by /admin)
  data/starter-works.json
  images/works/          starter collection images
supabase/schema.sql      tables, security policies, storage bucket — run once
supabase/seed.sql        loads the starter collection — run once (optional)
scripts/build.mjs        Vercel build step: env vars → public/env.js
scripts/dev.mjs          local preview server (mirrors vercel.json routing)
vercel.json              routing, headers, build settings
```

---

## Launch checklist

### 1. Supabase — create the database (5 min)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard) → **SQL Editor** → **New query**.
2. Paste all of [`supabase/schema.sql`](supabase/schema.sql) → **Run**. It is safe to run again later. (If you ran the old prototype's SQL, its tables are renamed to `*_legacy_v1` so nothing is lost.)
3. New query → paste [`supabase/seed.sql`](supabase/seed.sql) → **Run**. This loads the starter collection so the site isn't empty on day one. Skip it if you'd rather start blank.

### 2. Supabase — create your admin login

1. **Authentication → Users → Add user → Create new user.** Enter your email and a strong password, and tick **Auto Confirm User**.
2. **SQL Editor**, run (with your email):
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'you@example.com'
   on conflict do nothing;
   ```
3. Recommended: **Authentication → Sign In / Providers → Email** → turn off **Allow new users to sign up**. Even if left on, strangers who sign up can't edit anything, because they aren't in `admins`.
4. **Authentication → URL Configuration**: set **Site URL** to `https://www.stevensosmoore.com` and add `https://www.stevensosmoore.com/admin` under **Redirect URLs** (needed for "Forgot password" emails).

### 3. Vercel — check settings

In your Vercel project → **Settings**:

- **Environment Variables**: the Supabase integration usually adds these automatically. The site needs:
  - `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`)
  - `SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`)

  Only the **public anon/publishable** key is sent to browsers. The build refuses to publish a `service_role`/secret key.
- **Build & Deployment**: Framework Preset **Other**. Build command and output folder come from `vercel.json`; leave the overrides off.
- **Git → Production Branch**: `main`.
- **Domains**: `www.stevensosmoore.com` (and `stevensosmoore.com` redirecting to it).

After changing environment variables, **redeploy** (Deployments → ⋯ → Redeploy) so the build picks them up.

### 4. Go live

Merge this branch into `main`. Vercel deploys automatically. Then:

1. Visit `https://www.stevensosmoore.com/admin` and sign in.
2. **Artworks**: replace the starter images with high-resolution photos, set real titles, years, dimensions, prices and status.
3. **Site**: edit the tagline, About text and contact email.
4. Send a test inquiry from any artwork page and check it appears under **Inquiries**.

---

## Turning on the cart & Stripe checkout

The site has a full cart: **Add to cart / Buy now** on every available work with a price → `/cart` → Stripe's secure checkout (card, Apple Pay, Google Pay; collects shipping address and phone). After payment Stripe calls `/api/stripe-webhook`, which marks the works **Sold** and puts the order (buyer, address, amount) in **Studio → Inquiries**. Prices are always checked on the server, so nobody can change them in the browser.

1. Create a Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com) and finish activation (bank account for payouts).
2. **Developers → API keys** → copy the **Secret key** (`sk_live_…`, or `sk_test_…` to try it first).
3. **Developers → Webhooks → Add endpoint**: URL `https://www.stevensosmoore.com/api/stripe-webhook`, event `checkout.session.completed`. Copy its **Signing secret** (`whsec_…`).
4. In Supabase → **Project Settings → API Keys**, copy the **service_role / secret** key (server-only — it never reaches browsers).
5. In Vercel → **Settings → Environment Variables**, add:
   - `STRIPE_SECRET_KEY` = `sk_…`
   - `STRIPE_WEBHOOK_SECRET` = `whsec_…`
   - `SUPABASE_SERVICE_ROLE_KEY` = the Supabase secret key (the integration may already have added it)
6. **Redeploy.** Test with a `sk_test_` key and card `4242 4242 4242 4242`, then switch to the live key.

Until `STRIPE_SECRET_KEY` is set, the checkout button tells visitors to send an inquiry instead.

## Selling work

Each artwork has a **status** (Available, On hold, Sold, Not for sale) and an optional **price**. Leave the price blank to show "Price on request".

- **Inquire (default):** visitors send a message about a specific work, which lands in **Studio → Inquiries**. Reply by email, then send an invoice or a payment link.
- **Purchase button (optional):** create a [Stripe Payment Link](https://dashboard.stripe.com/payment-links) for a work, paste it into that work's **Purchase link** field, and the page shows "Purchase — $X" that goes straight to Stripe checkout. Mark the work **Sold** afterwards (the red dot appears).

**Getting emailed about new inquiries (optional):** in Supabase → **Database → Webhooks**, add a webhook on `inquiries` INSERT that posts to an email service such as Zapier, Make or Resend.

---

## Photographing work for the site

Shoot paintings straight on in soft, even daylight (no flash). Crop to the canvas edge, then upload at up to ~6000 px. The admin resizes images in your browser (2400 px for the full view, 900 px for thumbnails), so large phone photos upload quickly.

---

## Local preview

```bash
cp .env.example .env.local   # optional — fill in your Supabase URL + anon key
npm run dev                  # http://localhost:3000
```

Without Supabase settings the site shows the bundled starter collection, and `/admin` explains how to connect.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Site shows the starter collection after you've added works | Vercel env vars missing or added after the last deploy → add them and **Redeploy**. Check the build log for "✔ Supabase connected". |
| `/admin` says "not on the admin list" | Run the `insert into public.admins …` query from step 2 with the exact email you signed in with. |
| Upload fails with "new row violates row-level security" | Same as above — the account isn't in `admins`, or `schema.sql` wasn't run. |
| "Forgot password" email link goes to the wrong site | Set Site URL + Redirect URLs (step 2.4). |
| Build fails with "SECRET (service_role) key" | An env var holds the secret key. Replace it with the anon/publishable key. |

© Stevensosmoore. All artwork images are the property of the artist.
