// Creates a Stripe Checkout Session for the works in the cart.
// Prices and availability are always looked up server-side — never trusted from the browser.

const env = (...names) => names.map((n) => process.env[n]).find((v) => v && v.trim())?.trim() || "";

async function loadWorks(origin) {
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (url && key) {
    const r = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/artworks?select=id,title,medium,dimensions,price,status,published,image_url&published=eq.true`, {
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
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const secret = env("STRIPE_SECRET_KEY");
  if (!secret) return res.status(503).json({ error: "Checkout isn't set up yet." });

  let body = req.body;
  if (typeof body === "string") try { body = JSON.parse(body); } catch { body = {}; }
  const ids = [...new Set((body?.ids || []).map(String))].slice(0, 20);
  if (!ids.length) return res.status(400).json({ error: "Your cart is empty." });

  const proto = req.headers["x-forwarded-proto"] || "https";
  const origin = `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;

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
  form.set("cancel_url", `${origin}/cart`);
  form.set("billing_address_collection", "auto");
  form.set("shipping_address_collection[allowed_countries][0]", "US");
  form.set("phone_number_collection[enabled]", "true");
  form.set("metadata[artwork_ids]", chosen.map((w) => w.id).join(","));
  form.set("payment_intent_data[description]", `Stevensosmoore originals: ${chosen.map((w) => w.title).join(", ")}`.slice(0, 500));
  chosen.forEach((w, i) => {
    form.set(`line_items[${i}][quantity]`, "1");
    form.set(`line_items[${i}][price_data][currency]`, "usd");
    form.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(Number(w.price) * 100)));
    form.set(`line_items[${i}][price_data][product_data][name]`, `${w.title} — original`);
    const desc = [w.medium, w.dimensions].filter(Boolean).join(" · ");
    if (desc) form.set(`line_items[${i}][price_data][product_data][description]`, desc);
    if (w.image_url) form.set(`line_items[${i}][price_data][product_data][images][0]`, new URL(w.image_url, origin).href);
    form.set(`line_items[${i}][price_data][product_data][metadata][artwork_id]`, String(w.id));
  });

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = await r.json();
  if (!r.ok) {
    console.error("Stripe error", data?.error?.message);
    return res.status(502).json({ error: "Couldn't start checkout. Please try again." });
  }
  return res.status(200).json({ url: data.url });
}
