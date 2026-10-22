// Order summary for the thank-you page. Only returns details for paid sessions.
import { env, stripe } from "./_lib.js";

export default async function handler(req, res) {
  const id = String(req.query?.session_id || "");
  if (!env("STRIPE_SECRET_KEY") || !/^cs_[A-Za-z0-9_]+$/.test(id)) return res.status(400).json({ error: "Bad request" });
  try {
    const s = await stripe(`checkout/sessions/${id}?expand[]=line_items`);
    if (s.payment_status !== "paid") return res.status(402).json({ paid: false });
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      paid: true,
      order: s.id.slice(-8).toUpperCase(),
      email: s.customer_details?.email || "",
      name: s.customer_details?.name || "",
      total: (s.amount_total || 0) / 100,
      items: (s.line_items?.data || []).map((li) => ({ name: li.description, amount: (li.amount_total || 0) / 100 })),
    });
  } catch (err) {
    return res.status(err.status === 404 ? 404 : 502).json({ error: "Couldn't load the order." });
  }
}
