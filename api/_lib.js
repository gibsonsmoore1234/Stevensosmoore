// Shared helpers for the serverless functions (files starting with "_" are not routes on Vercel).
import crypto from "node:crypto";

export const env = (...names) => names.map((n) => process.env[n]).find((v) => v && v.trim())?.trim() || "";
export const STRIPE_KEY_NAMES = ["STRIPE_SECRET_KEY", "STRIPE_API_KEY", "STRIPE_SECRET", "STRIPE_SK", "STRIPE_KEY", "STRIPE_TEST_SECRET_KEY", "STRIPE_LIVE_SECRET_KEY"];
export const stripeKey = () => env(...STRIPE_KEY_NAMES);
export const STRIPE_VERSION = "2026-09-30.endive";

export function originOf(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${req.headers["x-forwarded-host"] || req.headers.host}`;
}

export async function stripe(path, { method = "GET", form, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${stripeKey()}`, "Stripe-Version": STRIPE_VERSION };
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers, body: form });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data?.error?.message || `Stripe ${r.status}`), { status: r.status });
  return data;
}

/** Supabase REST with the server-only service key. Returns null when it isn't configured. */
export function supabaseAdmin() {
  const url = env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY");
  if (!url || !key) return null;
  return (path, init = {}) =>
    fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal", ...(init.headers || {}) },
    });
}

/** Put works on hold while someone pays, or release them. Only touches rows in the expected state. */
export async function setStatus(ids, from, to) {
  const db = supabaseAdmin();
  if (!db || !ids.length) return false;
  const r = await db(`artworks?id=in.(${ids.map(Number).filter(Boolean).join(",")})&status=eq.${from}`, { method: "PATCH", body: JSON.stringify({ status: to }) });
  return r.ok;
}

export const newKey = () => crypto.randomUUID();
