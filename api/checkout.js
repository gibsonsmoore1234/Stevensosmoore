// Creates a Stripe Checkout Session for the works in the cart.
// Prices and availability are always looked up server-side — never trusted from the browser.

import { env, stripeKey, originOf, stripe, setStatus, newKey } from "./_lib.js";

async function loadWorks(origin) {
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (url && key) {
    const r = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/artworks?select=id,title,medium,dimensions,price,status,published,image_url,collection&published=eq.true`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (r.ok) {
      const rows = await r.json();
      if (rows.length) return rows;
    }
  }
  const r = await fetch(`${origin}/data/starter-works.json`);
  return r.ok ? r.json() : [];
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Status check: open /api/checkout in a browser. Never reveals key values.
    const k = stripeKey();
    let stripeOk = null;
    if (k) {
      try { await stripe("balance"); stripeOk = true; } catch (e) { stripeOk = e.message; }
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      stripe_key_found: Boolean(k),
      stripe_key_mode: k.startsWith("sk_live_") ? "live" : k.startsWith("sk_test_") ? "test" : k.startsWith("rk_") ? "restricted" : k ? "unknown format" : "missing",
      stripe_connection: stripeOk,
      webhook_secret_found: Boolean(env("STRIPE_WEBHOOK_SECRET")),
      supabase_service_key_found: Boolean(env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY")),
    });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = stripeKey();
  if (!secret) return res.status(503).json({ error: "Checkout isn't set up yet." });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const ids = [...new Set((body?.ids || []).map(String))].slice(0, 20);
  if (!ids.length) return res.status(400).json({ error: "Your cart is empty." });

  const origin = originOf(req);

  let works;
  try {
    works = await loadWorks(origin);
  } catch {
    return res.status(502).json({ error: "Couldn't load the artworks. Please try again." });
  }
  const chosen = ids.map((id) => works.find((w) => String(w.id) === id));
  const unavailable = chosen.filter((w) => !w || w.status !== "available" || !(Number(w.price) > 0));
  if (unavailable.length) {
    return res.status(409).json({
      error: "Some works in your cart are no longer available.",
      unavailable: ids.filter((id, i) => unavailable.includes(chosen[i])),
    });
  }

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", `${origin}/thank-you?session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/api/checkout-cancel?session_id={CHECKOUT_SESSION_ID}`);
  form.set("expires_at", String(Math.floor(Date.now() / 1000) + 30 * 60));
  form.set("billing_address_collection", "auto");
  form.set("shipping_address_collection[allowed_countries][0]", "US");
  form.set("phone_number_collection[enabled]", "true");
  form.set("metadata[artwork_ids]", chosen.map((w) => w.id).join(","));
  form.set("payment_intent_data[description]", `Stevensosmoore originals: ${chosen.map((w) => w.title).join(", ")}`.slice(0, 500));
  chosen.forEach((w, i) => {
    form.set(`line_items[${i}][quantity]`, "1");
    form.set(`line_items[${i}][price_data][currency]`, "usd");
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(Number(w.price) * (w.collection === "new" ? 0.75 : 1) * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`, `${w.title} — original${w.collection === "new" ? " (College Christianity, 25% off)" : ""}`);
    const desc = [w.medium, w.dimensions].filter(Boolean).join(" · ");
    if (desc) form.set(`line_items[${i}][price_data][product_data][description]`, desc);
    if (w.image_url) form.set(`line_items[${i}][price_data][product_data][images][0]`, new URL(w.image_url, origin).href);
    form.set(`line_items[${i}][price_data][product_data][metadata][artwork_id]`, String(w.id));
  });

  let session;
  try {
    session = await stripe("checkout/sessions", { method: "POST", form, idempotencyKey: newKey() });
  } catch (err) {
    console.error("Stripe error", err.message);
    return res.status(502).json({ error: `Stripe: ${err.message}` });
  }
  // Hold the works so nobody else can buy them while this buyer pays (released on cancel/expiry).
  await setStatus(chosen.map((w) => w.id), "available", "reserved").catch(() => {});
  return res.status(200).json({ url: session.url });
}
