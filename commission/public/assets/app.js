// Petition page. Signatures go to Supabase when public/env.js has a URL +
// anon key; otherwise the page runs in preview mode and keeps signatures in
// this browser only. Every number and name shown comes from real signatures —
// nothing is seeded.

const CONFIG = {
  goal: 10000,
  chronicleUrl: "", // paste The Duke Chronicle article URL here once it's published
  shareText: "Sign the petition for a $30,000 student-made art series in Duke's public spaces.",
};

const BUDGET = [
  { amount: 10000, label: "Artist Commission & Production Fee", color: "#012169" },
  { amount: 6500, label: "Raw Materials & Fine Art Supplies", color: "#1f3d8a" },
  { amount: 5000, label: "Archival Framing & Preservation", color: "#4b5563" },
  { amount: 4000, label: "Site Mounting, Facilities Safety & Lighting", color: "#000000" },
  { amount: 2500, label: "Studio Operations & Ventilation Logistics", color: "#9ca3af" },
  { amount: 2000, label: "Digital Documentation & Fine Art Transit", color: "#d1d5db" },
];

const WORKS = [
  ["airship-over-the-glass-city", "Airship over the Glass City"],
  ["teal-harlequin", "Harlequin in Teal"],
  ["the-procession", "The Procession"],
  ["the-dragon-duel", "The Dragon Duel"],
  ["the-dog-pile", "Three Good Dogs"],
  ["angels-at-the-gate", "Angels at the Gate"],
  ["cowboy-in-the-clouds", "Cowboy in the Clouds"],
  ["the-garden-of-everything", "The Garden of Everything"],
  ["golden-face", "Golden Face"],
  ["the-pink-whirlpool", "The Pink Whirlpool"],
  ["riders-in-the-red", "Riders in the Red"],
  ["falling-through-water", "Falling Through Water"],
  ["the-long-fall", "The Long Fall"],
  ["moon-faces", "Comet of Faces"],
  ["the-red-cyclops", "The Red Cyclops"],
  ["charcoal-figure", "Charcoal Figure"],
];

const AFFILIATIONS = { undergrad: "Undergrad", grad: "Grad Student", faculty_staff: "Faculty & Staff", alumni: "Alumni" };
const PENDING_KEY = "commission.pending";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => n.toLocaleString("en-US");

const ENV = window.__ENV__ || {};
const sb = ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY && window.supabase
  ? window.supabase.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "implicit" } })
  : null;
if (!sb) $("#preview-banner").hidden = false;

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
async function loadStats() {
  if (!sb) {
    const all = store.get("commission.preview") || [];
    return { total: all.length, recent: all.slice().reverse() };
  }
  const [{ data: c }, { data: r }] = await Promise.all([
    sb.from("signature_count").select("total").single(),
    sb.from("recent_signers").select("*"),
  ]);
  return { total: c?.total ?? 0, recent: r || [] };
}

async function saveSignature(row) {
  if (!sb) {
    const all = store.get("commission.preview") || [];
    if (all.some((s) => s.email === row.email)) throw new Error("already");
    const parts = row.full_name.trim().split(/\s+/);
    all.push({ ...row, display_name: parts.length > 1 ? `${parts[0]} ${parts.at(-1)[0]}.` : parts[0], comment: row.comment_public ? row.comment : null, created_at: new Date().toISOString() });
    store.set("commission.preview", all);
    return;
  }
  const { error } = await sb.from("signatures").insert(row);
  if (error) throw new Error(error.code === "23505" ? "already" : error.message);
}

// ---------------------------------------------------------------------------
// Render: strip, budget, stats
// ---------------------------------------------------------------------------
function renderStrip() {
  const items = WORKS.map(([f, t]) => `<figure><img src="/images/works/${f}.jpg" alt="${esc(t)} by Gibson Moore" loading="lazy"><figcaption>${esc(t)}</figcaption></figure>`).join("");
  $("#strip").innerHTML = items + items.replace(/alt="[^"]*"/g, 'alt="" aria-hidden="true"');
}

function renderBudget() {
  const total = BUDGET.reduce((a, b) => a + b.amount, 0);
  $("#budget-bar").innerHTML = BUDGET.map((b) => `<span style="width:${(b.amount / total) * 100}%;background:${b.color}" title="${esc(b.label)}"></span>`).join("");
  $("#budget-table tbody").innerHTML = BUDGET.map((b) => `
    <tr><th><span class="sw" style="background:${b.color}"></span>${esc(b.label)}<small>${Math.round((b.amount / total) * 1000) / 10}% of budget</small></th>
    <td>$${fmt(b.amount)}</td></tr>`).join("");
}

function ago(iso) {
  const s = Math.max(1, (Date.now() - Date.parse(iso)) / 1000);
  const units = [[31536000, "year"], [2592000, "month"], [86400, "day"], [3600, "hour"], [60, "minute"], [1, "second"]];
  for (const [sec, name] of units) if (s >= sec) { const n = Math.floor(s / sec); return `${n} ${name}${n > 1 ? "s" : ""} ago`; }
  return "just now";
}

let lastTopId = null;
async function refreshStats() {
  let stats;
  try { stats = await loadStats(); } catch { return; }
  document.querySelectorAll("[data-count]").forEach((el) => (el.textContent = fmt(stats.total)));
  $("#goal").textContent = fmt(CONFIG.goal);
  $("#tracker-fill").style.width = stats.total ? `${Math.min(100, Math.max(1.5, (stats.total / CONFIG.goal) * 100))}%` : "0";

  const topId = stats.recent[0]?.id ?? stats.recent[0]?.created_at;
  $("#feed").innerHTML = stats.recent.slice(0, 25).map((s, i) => `
    <li class="${i === 0 && lastTopId && topId !== lastTopId ? "new" : ""}"><strong>${esc(s.display_name)}</strong>
      (${esc(AFFILIATIONS[s.affiliation] || "")}) signed <span class="muted">${ago(s.created_at)}</span></li>`).join("")
    || `<li class="muted">No signatures yet — be the first.</li>`;
  lastTopId = topId;

  const quotes = stats.recent.filter((s) => s.comment && s.comment.trim().length >= 12).slice(0, 9);
  $("#quotes").innerHTML = quotes.map((s) => `
    <blockquote class="quote"><p>“${esc(s.comment.trim())}”</p><footer>— ${esc(s.display_name)}, ${esc(AFFILIATIONS[s.affiliation] || "")}</footer></blockquote>`).join("")
    || `<p class="empty">Supporters' comments will appear here as people sign. Leave one with your signature.</p>`;
}

// ---------------------------------------------------------------------------
// Signature pad
// ---------------------------------------------------------------------------
const pad = $("#pad");
const ctx = pad.getContext("2d");
let drawn = false, drawing = false, last = null;

function sizePad() {
  const r = pad.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const keep = drawn ? pad.toDataURL() : null;
  pad.width = r.width * dpr; pad.height = r.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#012169";
  if (keep) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, r.width, r.height); img.src = keep; }
}
const pt = (e) => { const r = pad.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
pad.addEventListener("pointerdown", (e) => { drawing = true; last = pt(e); pad.setPointerCapture(e.pointerId); });
pad.addEventListener("pointermove", (e) => {
  if (!drawing) return;
  const p = pt(e);
  ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  last = p; drawn = true;
});
["pointerup", "pointercancel", "pointerleave"].forEach((t) => pad.addEventListener(t, () => (drawing = false)));
$("#pad-clear").onclick = () => { ctx.clearRect(0, 0, pad.width, pad.height); drawn = false; };
window.addEventListener("resize", sizePad);

// Trimmed, downscaled PNG so stored signatures stay small.
function signaturePng() {
  if (!drawn) return null;
  const c = document.createElement("canvas");
  const s = Math.min(1, 600 / pad.width);
  c.width = pad.width * s; c.height = pad.height * s;
  c.getContext("2d").drawImage(pad, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------
const form = $("#petition");
const showErr = (msg) => { const e = $("#form-err"); e.textContent = msg; e.hidden = !msg; if (msg) e.scrollIntoView({ block: "nearest", behavior: "smooth" }); };

function collect() {
  const f = form.elements;
  const row = {
    full_name: f.full_name.value.trim().replace(/\s+/g, " "),
    email: f.email.value.trim().toLowerCase(),
    affiliation: f.affiliation.value,
    authorized: f.authorized.checked,
    signature_png: signaturePng(),
    comment: f.comment.value.trim() || null,
    comment_public: f.comment_public.checked,
  };
  [f.full_name, f.email, f.affiliation].forEach((el) => el.removeAttribute("aria-invalid"));
  const bad = (el, msg) => { el.setAttribute("aria-invalid", "true"); el.focus(); throw new Error(msg); };
  if (row.full_name.split(" ").length < 2) bad(f.full_name, "Please enter your first and last name.");
  if (!/^[^@\s]+@duke\.edu$/i.test(row.email)) bad(f.email, "Please use your @duke.edu email address.");
  if (!row.affiliation) bad(f.affiliation, "Please choose your affiliation.");
  if (!row.authorized && !row.signature_png) throw new Error("Tick the authorization box or draw your signature.");
  return row;
}

function done(title, body) {
  $("#form-body").hidden = true;
  const d = $("#form-done");
  d.innerHTML = `<h3>${title}</h3><p>${body}</p><a class="btn" href="#voices">See why others signed</a>`;
  d.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  showErr("");
  let row;
  try { row = collect(); } catch (ex) { return showErr(ex.message); }
  const btn = $("#submit");
  btn.disabled = true; btn.textContent = "Submitting…";
  try {
    if (!sb) {
      await saveSignature(row);
      done("Thank you — you're on the petition.", "Your signature has been added. Share the page so more Duke students sign.");
      refreshStats();
      return;
    }
    // Verify the Duke email: Supabase sends a confirmation link; the signature
    // is saved when they come back through it (see finishPending below).
    store.set(PENDING_KEY, row);
    const { error } = await sb.auth.signInWithOtp({ email: row.email, options: { emailRedirectTo: `${location.origin}/#sign`, shouldCreateUser: true } });
    if (error) throw error;
    done("Check your Duke inbox.", `We sent a confirmation link to <strong>${esc(row.email)}</strong>. Click it to finish — your signature is counted once your Duke email is confirmed.`);
  } catch (ex) {
    showErr(ex.message === "already" ? "This Duke email has already signed. Thank you!" : `Something went wrong: ${ex.message}`);
  } finally {
    btn.disabled = false; btn.textContent = "Add my signature to the commission";
  }
});

async function finishPending(session) {
  const row = store.get(PENDING_KEY);
  if (!row || !session) return;
  if ((session.user.email || "").toLowerCase() !== row.email) return;
  store.del(PENDING_KEY);
  try {
    await saveSignature(row);
    done("Confirmed — you're on the petition.", "Your Duke email is verified and your signature has been added. Thank you!");
  } catch (ex) {
    if (ex.message === "already") done("You've already signed.", "This Duke email is already on the petition. Thank you!");
    else showErr(`We couldn't save your signature: ${ex.message}`);
  }
  await sb.auth.signOut();
  refreshStats();
  document.getElementById("sign").scrollIntoView();
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------
const pageUrl = () => location.origin + location.pathname;
const note = (msg) => { $("#share-note").textContent = msg; };

async function shareOrCopy(hint) {
  if (navigator.share) {
    try { await navigator.share({ title: document.title, text: CONFIG.shareText, url: pageUrl() }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(`${CONFIG.shareText} ${pageUrl()}`); note(`Link copied. ${hint}`); }
  catch { note(`Copy this link: ${pageUrl()}`); }
}
document.querySelector('[data-share="instagram"]').onclick = () => shareOrCopy("Add it to your Instagram Story with a link sticker.");
document.querySelector('[data-share="groupme"]').onclick = () => shareOrCopy("Paste it into your GroupMe chats.");
$("#share-reddit").href = `https://www.reddit.com/r/duke/submit?url=${encodeURIComponent(pageUrl())}&title=${encodeURIComponent("Petition: fund a $30,000 student-made permanent art series on campus")}`;
if (CONFIG.chronicleUrl) $("#press").innerHTML = `<a href="${esc(CONFIG.chronicleUrl)}" target="_blank" rel="noopener">Read The Duke Chronicle feature →</a>`;

// ---------------------------------------------------------------------------
renderStrip();
renderBudget();
sizePad();
refreshStats();
setInterval(refreshStats, 30000);
if (sb) {
  sb.auth.getSession().then(({ data }) => finishPending(data.session));
  sb.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_IN") finishPending(session); });
}
