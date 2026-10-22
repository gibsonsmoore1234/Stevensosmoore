// Buyer pressed "back" on Stripe Checkout: expire the session (which releases the hold) and return to the cart.
import { env, originOf, stripe, setStatus } from "./_lib.js";

export default async function handler(req, res) {
  const id = String(req.query?.session_id || "");
  if (env("STRIPE_SECRET_KEY") && /^cs_[A-Za-z0-9_]+$/.test(id)) {
    try {
      const s = await stripe(`checkout/sessions/${id}`);
      if (s.status === "open") {
        await stripe(`checkout/sessions/${id}/expire`, { method: "POST" });
        const ids = String(s.metadata?.artwork_ids || "").split(",").filter(Boolean);
        await setStatus(ids, "reserved", "available");
      }
    } catch (err) {
      console.error("cancel", err.message);
    }
  }
  res.writeHead(303, { Location: `${originOf(req)}/cart` }).end();
}
