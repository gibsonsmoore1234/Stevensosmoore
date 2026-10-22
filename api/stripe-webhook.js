// Stripe calls this after a successful payment: mark the works sold and log the order.
import crypto from "node:crypto";

export const config = { api: { bodyParser: false } };

const env = (...names) => names.map((n) => process.env[n]).find((v) => v && v.trim())?.trim() || "";

async function rawBody(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}

function verify(payload, header, secret) {
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")));
  const sigs = String(header || "").split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!parts.t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 600) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${payload}`).digest("hex");
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const whsec = env("STRIPE_WEBHOOK_SECRET");
  const sbUrl = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const service = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  if (!whsec) return res.status(503).send("Webhook not configured");

  const payload = await rawBody(req);
  if (!verify(payload, req.headers["stripe-signature"], whsec)) return res.status(400).send("Bad signature");

  const event = JSON.parse(payload);
  const s = event.data.object;
  const ids = String(s.metadata?.artwork_ids || "").split(",").map(Number).filter(Boolean);

  // Buyer didn't finish in time: release the hold.
  if (event.type === "checkout.session.expired") {
    if (sbUrl && service && ids.length)
      await fetch(`${sbUrl}/rest/v1/artworks?id=in.(${ids.join(",")})&status=eq.reserved`, {
        method: "PATCH",
        headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ status: "available" }),
      });
    return res.status(200).json({ released: true });
  }
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) || s.payment_status !== "paid")
    return res.status(200).json({ ignored: true });
  if (!sbUrl || !service || !ids.length) return res.status(200).json({ received: true, updated: false });

  const headers = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  await fetch(`${sbUrl}/rest/v1/artworks?id=in.(${ids.join(",")})`, { method: "PATCH", headers, body: JSON.stringify({ status: "sold" }) });

  const c = s.customer_details || {};
  const addr = s.shipping_details?.address || s.collected_information?.shipping_details?.address || c.address || {};
  const ship = [addr.line1, addr.line2, [addr.city, addr.state, addr.postal_code].filter(Boolean).join(" "), addr.country].filter(Boolean).join(", ");
  const message = `PAID ORDER — $${((s.amount_total || 0) / 100).toFixed(2)}\nStripe session: ${s.id}\nShip to: ${ship || "—"}\nPhone: ${c.phone || "—"}`;
  const dup = await fetch(`${sbUrl}/rest/v1/inquiries?select=id&message=like.*${encodeURIComponent(s.id)}*&limit=1`, { headers });
  if (dup.ok && (await dup.json()).length) return res.status(200).json({ received: true, duplicate: true });
  await fetch(`${sbUrl}/rest/v1/inquiries`, {
    method: "POST",
    headers,
    body: JSON.stringify(ids.map((id) => ({ artwork_id: id, kind: "purchase", name: (c.name || "Buyer").slice(0, 200), email: c.email || "unknown@unknown.com", message, status: "new" }))),
  });
  return res.status(200).json({ received: true, updated: true });
}
