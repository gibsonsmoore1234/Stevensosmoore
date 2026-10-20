// Public data layer for the portfolio.
// Reads from Supabase's REST API with the public (anon/publishable) key — no
// heavy client library on public pages. If Supabase isn't configured or can't
// be reached, it falls back to the bundled starter collection so the site
// never renders empty.

const ENV = window.__ENV__ || {};
const SUPABASE_URL = String(ENV.SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_KEY = String(ENV.SUPABASE_ANON_KEY || "");

export const CATEGORIES = [
  { id: "oil", label: "Oil", plural: "Oil paintings", medium: "Oil on canvas" },
  { id: "acrylic", label: "Acrylic", plural: "Acrylic paintings", medium: "Acrylic on canvas" },
  { id: "charcoal", label: "Charcoal", plural: "Charcoal drawings", medium: "Charcoal on paper" },
  { id: "drawing", label: "Drawing", plural: "Drawings", medium: "Graphite on paper" },
  { id: "mixed-media", label: "Mixed media", plural: "Mixed media", medium: "Mixed media" },
  { id: "other", label: "Other", plural: "Other works", medium: "" },
];

export const STATUSES = {
  available: "Available",
  reserved: "On hold",
  sold: "Sold",
  nfs: "Not for sale",
};

export const DEFAULT_SETTINGS = {
  tagline: "Original oil paintings, charcoal and drawings by Stevensosmoore.",
  about:
    "I'm 19 years old and I paint full time. My faith is the most important thing to me, and I want to be productive and not squander God's blessing of a healthy body and a mind eager to learn and improve.\n\n" +
    "I grew up in Georgia and spent most of middle school and all of high school in Florida. I started wrestling my freshman year of high school, placed 4th in the Florida 1A state tournament as a junior, and was a Florida 1A state finalist as a senior. I then committed to wrestle Division I at the University of Northern Colorado as a preferred walk-on, where I earned a scholarship.\n\n" +
    "I then transferred to Duke University, where I'm double majoring in political science and visual arts with a minor in political economy, and stepped away from wrestling to pursue painting full time. I work mostly in oil, and also in acrylic, charcoal and graphite.",
  contact_email: "gibson.moore@duke.edu",
  contact_phone: "470-533-7922",
  price_range: "Prices from $250 to $900",
  instagram: "stevensosmoore",
  tiktok: "stevensosmoore",
  tiktok_bible: "gibsonmoore1234",
  hero_artwork_id: null,
};

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

let demoMode = !isConfigured();
/** True when showing the bundled starter collection instead of live data. */
export const isDemo = () => demoMode;

export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
export const statusLabel = (s) => STATUSES[s] ?? STATUSES.available;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const priceFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2, minimumFractionDigits: 0 });
/** "$1,200", or null when the price is on request. */
export function formatPrice(price) {
  const n = Number(price);
  return price === null || price === undefined || price === "" || !Number.isFinite(n) || n <= 0 ? null : priceFormat.format(n);
}

/** Only allow http(s) URLs into href/src attributes. */
export function safeUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url, window.location.origin);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}

export const imageFor = (work, size = "full") =>
  safeUrl(size === "thumb" ? work.thumb_url || work.image_url : work.image_url || work.thumb_url);

/** Medium line for a wall label, e.g. "Oil on canvas". */
export const mediumFor = (work) => work.medium || CATEGORIES.find((c) => c.id === work.category)?.medium || "";

export const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Canonical path for a work: /work/12-teal-harlequin */
export const workPath = (work) => `/work/${work.id}${work.title ? `-${slugify(work.title)}` : ""}`;

async function rest(path, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${body.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

let starterPromise;
function loadStarter() {
  starterPromise ??= fetch("/data/starter-works.json")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return starterPromise;
}

const sortWorks = (list) =>
  [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(b.created_at).localeCompare(String(a.created_at)));

let artworksPromise;
/** All published works, ordered for display. Cached for the page lifetime. */
export function getArtworks() {
  artworksPromise ??= (async () => {
    if (isConfigured()) {
      try {
        const rows = await rest("artworks?select=*&published=eq.true&order=sort_order.asc,created_at.desc");
        demoMode = false;
        return rows || [];
      } catch (err) {
        console.warn("Falling back to starter collection:", err);
      }
    }
    demoMode = true;
    return sortWorks((await loadStarter()).filter((w) => w.published !== false));
  })();
  return artworksPromise;
}

export const COLLECTION = { id: "new", name: "College Christianity", discount: 0.25 };
export const inCollection = (w) => w?.collection === COLLECTION.id;
/** What the buyer pays: collection pieces are 25% off. */
export const salePrice = (w) => (inCollection(w) ? Math.round(Number(w.price) * (1 - COLLECTION.discount) * 100) / 100 : Number(w.price));

/** The work shown large on the home page: chosen in admin, else first featured, else first. */
export function pickHero(works, settings) {
  return (
    works.find((w) => settings?.hero_artwork_id != null && String(w.id) === String(settings.hero_artwork_id)) ||
    works.find((w) => w.featured && w.status !== "sold") ||
    works[0] ||
    null
  );
}

export async function getArtwork(id) {
  const works = await getArtworks();
  return works.find((w) => String(w.id) === String(id)) ?? null;
}

let settingsPromise;
/** Site copy and links, merged over defaults. */
export function getSettings() {
  settingsPromise ??= (async () => {
    if (isConfigured()) {
      try {
        const rows = await rest("site_settings?select=*&id=eq.1");
        const row = rows?.[0] || {};
        const merged = { ...DEFAULT_SETTINGS };
        for (const [k, v] of Object.entries(row)) if (v !== null && v !== "") merged[k] = v;
        return merged;
      } catch (err) {
        console.warn("Using default settings:", err);
      }
    }
    return { ...DEFAULT_SETTINGS };
  })();
  return settingsPromise;
}

/**
 * Send a visitor inquiry. Throws if it couldn't be delivered — callers should
 * then offer the email / Instagram alternatives.
 * @param {{artwork_id?: number|null, kind?: 'purchase'|'commission'|'general', name: string, email: string, message?: string}} data
 */
export async function submitInquiry({ artwork_id = null, kind = "general", name, email, message = "" }) {
  if (!isConfigured()) throw new Error("Inquiries are not connected yet.");
  await rest("inquiries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      artwork_id: artwork_id ? Number(artwork_id) : null,
      kind,
      name: String(name).trim().slice(0, 200),
      email: String(email).trim().slice(0, 320),
      message: String(message || "").trim().slice(0, 5000),
    }),
  });
}
