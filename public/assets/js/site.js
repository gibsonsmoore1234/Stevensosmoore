import {
  CATEGORIES,
  getArtworks,
  getSettings,
  pickHero,
  escapeHtml as esc,
  formatPrice,
  imageFor,
  mediumFor,
  categoryLabel,
  statusLabel,
  workPath,
  safeUrl,
  submitInquiry,
  isConfigured,
  COLLECTION,
  inCollection,
  salePrice,
} from "./api.js";

const view = document.querySelector("[data-view]");
const announcer = document.querySelector("[data-announcer]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const BASE_TITLE = "Stevensosmoore";

/* --------------------------------------------------------------------- cart */

const CART_KEY = "sosm-cart";
function readCart() {
  try {
    const v = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
function writeCart(ids) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify([...new Set(ids)]));
  } catch {}
  updateCartCount();
}
function updateCartCount() {
  const n = readCart().length;
  document.querySelectorAll("[data-cart-count]").forEach((el) => {
    el.textContent = n ? String(n) : "";
    el.hidden = !n;
  });
}
const canBuy = (w) => w.status === "available" && Number(w.price) > 0;

/* ------------------------------------------------------------------ helpers */

const ttUrl = (h) => `https://www.tiktok.com/@${encodeURIComponent(String(h || "").replace(/^@/, ""))}`;
const socials = (s) => `
  <a href="${igUrl(s)}" target="_blank" rel="noopener">Instagram @${esc(s.instagram)}</a><br>
  <a href="${ttUrl(s.tiktok)}" target="_blank" rel="noopener">TikTok @${esc(s.tiktok)}</a><br>
  <a href="${ttUrl(s.tiktok_bible)}" target="_blank" rel="noopener">Bible art TikTok @${esc(s.tiktok_bible)}</a>`;
const salePriceHtml = (w) =>
  inCollection(w) ? `<s class="was">${esc(formatPrice(w.price))}</s> <span class="sale">${esc(formatPrice(salePrice(w)))}</span>` : esc(formatPrice(w.price) || "Price on request");
const ORDER_PHONE = "+14705337922";
const ORDER_EMAIL = "gibson.moore@duke.edu";
const mailLink = (body, subject = "Stevensosmoore") => `mailto:${ORDER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
const smsLink = (body) => `sms:${ORDER_PHONE}?&body=${encodeURIComponent(body)}`;
const orderText = (items) => {
  const lines = items.map((w) => `• ${w.title} (${[mediumFor(w), w.dimensions].filter(Boolean).join(", ")}) — ${formatPrice(salePrice(w))}${inCollection(w) ? " (25% off)" : ""}`);
  const total = items.reduce((t, w) => t + salePrice(w), 0);
  return `Hi! I'd like to buy from stevensosmoore.com:\n${lines.join("\n")}\nTotal: ${formatPrice(total)} + shipping\nMy name:\nShip to:`;
};
const igUrl = (s) => `https://www.instagram.com/${encodeURIComponent((s.instagram || "stevensosmoore").replace(/^@/, ""))}/`;
const paragraphs = (text) =>
  String(text || "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

function setMeta({ title, description, path, image }) {
  document.title = title ? `${title} — ${BASE_TITLE}` : `${BASE_TITLE} — Original Paintings`;
  const set = (sel, attr, val) => val && document.querySelector(sel)?.setAttribute(attr, val);
  set('meta[name="description"]', "content", description);
  set('meta[property="og:title"]', "content", document.title);
  set('meta[property="og:description"]', "content", description);
  const url = `https://www.stevensosmoore.com${path === "/" ? "/" : path}`;
  set('link[rel="canonical"]', "href", url);
  set('meta[property="og:url"]', "content", url);
  set('meta[property="og:image"]', "content", image ? new URL(image, "https://www.stevensosmoore.com").href : "https://www.stevensosmoore.com/images/og.jpg");
}

function img(work, { size = "thumb", eager = false, sizes = "(min-width: 900px) 33vw, 100vw", cls = "" } = {}) {
  const w = work.image_width || 800;
  const h = work.image_height || 1000;
  return `<img class="${cls}" src="${esc(imageFor(work, size))}" width="${w}" height="${h}" alt="${esc(work.alt_text || `${work.title}, ${mediumFor(work)}`)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" sizes="${sizes}">`;
}

function priceLine(work) {
  if (work.status === "sold") return `<span class="status status--sold">Sold</span>`;
  if (work.status === "nfs") return `<span class="status status--nfs">Not for sale</span>`;
  if (work.status === "reserved") return `<span class="status status--reserved">On hold</span>`;
  return `<span class="label__price">${salePriceHtml(work)}</span>${inCollection(work) && formatPrice(work.price) ? ' <span class="tag-sale">25% off</span>' : ""}`;
}

function wallLabel(work, tag = "h3") {
  return `
    <div class="label">
      <${tag} class="label__title"><i>${esc(work.title)}</i>${work.year ? `, ${esc(work.year)}` : ""}</${tag}>
      <p class="label__medium">${esc([mediumFor(work), work.dimensions].filter(Boolean).join(" · "))}</p>
      <p class="label__meta">${priceLine(work)}</p>
    </div>`;
}

function card(work, i = 0) {
  return `
    <a class="work-card reveal${inCollection(work) ? " work-card--gold" : ""}" style="--i:${i % 6}" href="${workPath(work)}">
      <span class="work-card__frame">${img(work)}${work.status === "sold" ? '<span class="red-dot" aria-hidden="true"></span>' : ""}</span>
      ${wallLabel(work)}
      ${inCollection(work) ? `<span class="gold-btn${work.status === "sold" ? " gold-btn--sold" : ""}">${cross} College Christianity${work.status === "sold" ? " · Sold" : " · 25% off"}</span>` : ""}
    </a>`;
}

const grid = (works) => (works.length ? `<div class="works-grid">${works.map(card).join("")}</div>` : `<p class="empty">More work coming soon. Follow along on Instagram.</p>`);

const airship = `
  <svg class="airship" viewBox="0 0 120 60" aria-hidden="true">
    <path d="M14 26c0-11 20-18 44-18s46 7 46 18-22 18-46 18S14 37 14 26z" fill="#8e8a8c" stroke="#1c1916" stroke-width="2.4"/>
    <path d="M30 14c14 3 42 3 58 0M24 38c16-3 50-3 66 0" fill="none" stroke="#1c1916" stroke-width="1.6" opacity=".55"/>
    <path d="M102 26l14-10v20z" fill="#5c2a35" stroke="#1c1916" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M50 44l2 7h14l2-7" fill="#5c2a35" stroke="#1c1916" stroke-width="2.2" stroke-linejoin="round"/>
  </svg>`;

const cross = `<svg class="cross" viewBox="0 0 24 32" aria-hidden="true"><path d="M12 2v28M4 10.5h16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`;
const VERSES = [
  ["Whatever you do, work at it with all your heart, as working for the Lord.", "Colossians 3:23"],
  ["In the beginning God created the heavens and the earth.", "Genesis 1:1"],
  ["He has made everything beautiful in its time.", "Ecclesiastes 3:11"],
  ["For we are God’s handiwork, created in Christ Jesus to do good works.", "Ephesians 2:10"],
  ["The heavens declare the glory of God; the skies proclaim the work of his hands.", "Psalm 19:1"],
  ["Let your light shine before others, that they may see your good deeds and glorify your Father in heaven.", "Matthew 5:16"],
  ["My God has sent his angel, and he shut the mouths of the lions.", "Daniel 6:22"],
  ["When you walk through the fire, you will not be burned; the flames will not set you ablaze.", "Isaiah 43:2"],
  ["I can do all this through him who gives me strength.", "Philippians 4:13"],
  ["Yet you, Lord, are our Father. We are the clay, you are the potter; we are all the work of your hand.", "Isaiah 64:8"],
];
const verse = (start = 0) => `
  <figure class="verse reveal" data-verses data-start="${start}">
    ${cross}
    <blockquote data-verse-text>“${VERSES[start % VERSES.length][0]}”</blockquote>
    <figcaption data-verse-ref>${VERSES[start % VERSES.length][1]}</figcaption>
    <div class="verse__dots" aria-hidden="true">${VERSES.map((_, i) => `<span class="${i === start % VERSES.length ? "on" : ""}"></span>`).join("")}</div>
    <button class="verse__next" type="button" data-verse-next>Next verse →</button>
  </figure>`;

const christianOffer = `
  <div class="offer">
    ${cross}
    <div>
      <p class="eyebrow">College Christianity · Commission offer</p>
      <h3>25% off Christian commissions</h3>
      <p>Commission a Christian painting and get <strong>25% off your total order</strong> (before shipping).</p>
      <ul>
        <li><strong>Partly Christian</strong> — for example, a family portrait with crosses and Christian symbols in the background.</li>
        <li><strong>Fully Christian</strong> — a painting of a biblical or historical Christian event.</li>
      </ul>
      <div class="hero__cta"><a class="btn btn--amber" href="${smsLink("Hi! I'd like to request a Christian commission (25% off).\nSize:\nMy idea:")}">Text a Christian commission request</a><a class="btn btn--ghost-light" href="${mailLink("Hi! I'd like to request a Christian commission (25% off).\nSize:\nMy idea:", "Christian commission request")}">Email a request</a><a class="btn btn--ghost-light" href="/commissions">See prices</a></div>
    </div>
  </div>`;

const road = (cls = "") => `<svg class="road ${cls}" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 90 C 180 20, 360 110, 600 60 S 980 0, 1210 70" /></svg>`;

function wallWidth(work) {
  const m = String(work.dimensions || "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|in|ft|")?/i);
  if (!m) return 34;
  let [a, b] = [Number(m[1]), Number(m[2])];
  if (/cm/i.test(m[3] || "")) (a /= 2.54), (b /= 2.54);
  if (/ft/i.test(m[3] || "")) (a *= 12), (b *= 12);
  const widthIn = (work.image_width || 1) >= (work.image_height || 1) ? Math.max(a, b) : Math.min(a, b);
  return Math.max(8, Math.min(90, (widthIn / 84) * 70));
}

/* -------------------------------------------------------------- inquiry form */

function inquiryForm({ work = null, kind = "general", christian = "", size = "", settings, compact = false }) {
  const msg = work ? `Hi! I'm interested in "${work.title}". ` : size ? `Hi! I'd like to commission a ${size} painting. ` : "";
  const email = settings.contact_email;
  return `
    <form class="inquiry ${compact ? "inquiry--compact" : ""}" data-inquiry novalidate>
      ${work ? `<input type="hidden" name="artwork_id" value="${esc(work.id)}">` : ""}
      ${
        work
          ? `<input type="hidden" name="kind" value="purchase">`
          : `<div class="field"><label for="iq-kind">I'm writing about</label>
              <select class="select input" id="iq-kind" name="kind">
                <option value="general"${kind === "general" ? " selected" : ""}>A question or hello</option>
                <option value="purchase"${kind === "purchase" ? " selected" : ""}>Buying a painting</option>
                <option value="commission"${kind === "commission" ? " selected" : ""}>A commission</option>
              </select></div>`
      }
      ${
        work
          ? ""
          : `<div class="field" data-christian-field ${kind === "commission" ? "" : "hidden"}><label for="iq-christian">Christian painting? (25% off)</label>
              <select class="select input" id="iq-christian" name="christian">
                <option value="">No</option>
                <option value="partly"${christian === "partly" ? " selected" : ""}>Partly Christian — e.g. crosses or Christian symbols in the background</option>
                <option value="fully"${christian === "fully" ? " selected" : ""}>Fully Christian — a biblical or historical Christian event</option>
              </select></div>`
      }
      <div class="inquiry__row">
        <div class="field"><label for="iq-name">Name</label><input class="input" id="iq-name" name="name" autocomplete="name" required maxlength="200"></div>
        <div class="field"><label for="iq-email">Email</label><input class="input" id="iq-email" name="email" type="email" autocomplete="email" required maxlength="320"></div>
      </div>
      <div class="field"><label for="iq-message">Message</label><textarea class="textarea input" id="iq-message" name="message" maxlength="5000" rows="5">${esc(msg)}</textarea></div>
      <div class="hp" aria-hidden="true"><label>Company <input name="company" tabindex="-1" autocomplete="off"></label></div>
      <p class="inquiry__error" role="alert" hidden></p>
      <div class="inquiry__actions">
        <button class="btn" type="submit">Send message</button>
        <a class="btn btn--ghost" href="${esc(smsLink(work ? `Hi! I'm interested in "${work.title}".` : "Hi!"))}">Text me instead</a>
        <a class="btn btn--ghost" href="${esc(mailLink(work ? `Hi! I'm interested in "${work.title}".` : "Hi!", work ? `About ${work.title}` : "Hello"))}">Email me instead</a>
        <span class="inquiry__alt">or ${email ? `email <a href="mailto:${esc(email)}">${esc(email)}</a> · ` : ""}${settings.contact_phone ? `call/text <a href="tel:${esc(settings.contact_phone.replace(/[^\d+]/g, ""))}">${esc(settings.contact_phone)}</a> · ` : ""}DM <a href="${igUrl(settings)}" target="_blank" rel="noopener">@${esc(settings.instagram || "stevensosmoore")}</a></span>
      </div>
    </form>`;
}

function bindInquiry(root, settings) {
  root.querySelectorAll("[data-inquiry]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const err = form.querySelector(".inquiry__error");
      const show = (m) => ((err.textContent = m), (err.hidden = false));
      err.hidden = true;
      form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
      if (data.company) return; // bot
      const bad = [];
      if (!data.name?.trim()) bad.push("iq-name");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email || "")) bad.push("iq-email");
      if (bad.length) {
        bad.forEach((id) => form.querySelector("#" + id).setAttribute("aria-invalid", "true"));
        form.querySelector("#" + bad[0]).focus();
        return show(bad[0] === "iq-name" ? "Please add your name." : "Please add a valid email so I can reply.");
      }
      const btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const tag = data.kind === "commission" && data.christian ? `[College Christianity — ${data.christian === "fully" ? "FULLY" : "PARTLY"} Christian commission, 25% off before shipping]\n` : "";
        await submitInquiry({ artwork_id: data.artwork_id || null, kind: data.kind || "general", name: data.name, email: data.email, message: tag + (data.message || "") });
        form.outerHTML = `
          <div class="sent" role="status" tabindex="-1">
            ${airship}
            <h3>Thank you, ${esc(data.name.trim().split(" ")[0])}.</h3>
            <p>Your message is on its way. I'll reply to <strong>${esc(data.email)}</strong> soon. God bless!</p>
          </div>`;
        root.querySelector(".sent")?.focus();
      } catch (ex) {
        console.warn(ex);
        btn.disabled = false;
        btn.textContent = "Send message";
        const email = settings.contact_email;
        show(
          isConfigured()
            ? `Sorry — that didn't send. Please try again${email ? `, or email ${email}` : ""}, or DM @${settings.instagram || "stevensosmoore"} on Instagram.`
            : `Messages aren't connected yet — ${email ? `email ${email} or ` : ""}DM @${settings.instagram || "stevensosmoore"} on Instagram.`,
        );
      }
    });
  });
}

/* --------------------------------------------------------------------- views */

async function homeView() {
  const [works, settings] = await Promise.all([getArtworks(), getSettings()]);
  const hero = pickHero(works, settings);
  const featured = works.filter((w) => w.featured && w !== hero && w.collection !== "new").slice(0, 6);
  const selected = featured.length >= 3 ? featured : works.filter((w) => w !== hero && w.category === "oil").slice(0, 6);
  const other = works.filter((w) => w.category !== "oil").slice(0, 4);
  const fresh = works.filter((w) => w.collection === "new");
  setMeta({ path: "/", description: settings.tagline });

  return `
    <section class="hero">
      <div class="hero__sky" aria-hidden="true"><span class="hero__sun"></span></div>
      <button class="hero__airship" type="button" data-airship aria-label="Launch the airship">${airship}</button>
      <div class="hero__inner">
        <div class="hero__text">
          <p class="eyebrow">${esc(settings.price_range || "Original paintings")}</p>
          <h1 class="hero__title">Original<br><em>paintings.</em></h1>
          <p class="hero__lede">${esc(settings.tagline)}</p>
          <div class="hero__cta">
            <a class="btn" href="/oil-paintings">View oil paintings</a>
            <a class="btn btn--ghost" href="/other-media">Other media</a>
          </div>
          <button class="wander" type="button" data-wander><span aria-hidden="true">✦</span> Show me a random painting</button>
        </div>
        ${
          hero
            ? `<a class="hero__work" href="${workPath(hero)}">
                <span class="hero__frame">${img(hero, { size: "full", eager: true, sizes: "(min-width: 900px) 55vw, 100vw" })}</span>
                <span class="hero__caption"><i>${esc(hero.title)}</i>${hero.year ? `, ${esc(hero.year)}` : ""} · ${esc(mediumFor(hero))}</span>
              </a>`
            : ""
        }
      </div>
      ${road("road--hero")}
    </section>

    ${
      fresh.length
        ? `<section class="collection-band">
            <div class="collection">
              <div class="collection__text">
                ${cross}
                <p class="eyebrow">New collection</p>
                <h2>College <em>Christianity.</em></h2>
                <p>Oil paintings of stories from Scripture — the plagues of Egypt, Daniel in the lions’ den, the fiery furnace. <strong>Every piece in the collection is 25% off</strong>, and so are Christian commissions.</p>
                <div class="hero__cta"><a class="btn btn--amber" href="/college-christianity">See the collection</a><a class="btn btn--ghost-light" href="/commissions">Christian commissions</a></div>
              </div>
              <div class="collection__works">${fresh.slice(0, 4).map(card).join("")}</div>
            </div>
          </section>`
        : ""
    }

    <section class="section section--glow">
      <div class="section__head">
        <div><p class="eyebrow">Selected works</p><h2>From the studio</h2></div>
        <a class="link-arrow" href="/oil-paintings">All oil paintings</a>
      </div>
      ${grid(selected)}
    </section>

    ${
      other.length
        ? `<section class="section section--band section--cobalt">
            <div class="section__head">
              <div><p class="eyebrow">Acrylic · Charcoal · Drawing</p><h2>Other media</h2></div>
              <a class="link-arrow" href="/other-media">See everything</a>
            </div>
            <div class="works-grid works-grid--four">${other.map(card).join("")}</div>
          </section>`
        : ""
    }

    <section class="section about-teaser">
      <div class="about-teaser__text">
        <p class="eyebrow">About the artist</p>
        <h2>About <em>the artist</em></h2>
        ${paragraphs(settings.about.split(/\n{2,}/).slice(0, 2).join("\n\n"))}
        <a class="link-arrow" href="/about">More about me</a>
      </div>
      <div class="about-teaser__cta">
        <p class="eyebrow">Commissions</p>
        <p class="about-teaser__big">Want a painting made just for you? Ask about a commission.</p>
        <a class="btn btn--amber" href="/commissions">See commission prices</a>
      </div>
    </section>

    <section class="section">${christianOffer}</section>
    <section class="section">${verse(0)}</section>

    <section class="ig-band">
      <div class="ig-band__inner">
        <p class="eyebrow">Fresh off the easel</p>
        <a class="ig-band__handle" href="${igUrl(settings)}" target="_blank" rel="noopener">@${esc(settings.instagram)}</a>
        <p>Works in progress, studio days and new paintings first on Instagram and TikTok.</p>
        <div class="ig-band__links"><a class="btn btn--amber" href="${igUrl(settings)}" target="_blank" rel="noopener">Instagram</a><a class="btn btn--ghost-light" href="${ttUrl(settings.tiktok)}" target="_blank" rel="noopener">TikTok @${esc(settings.tiktok)}</a><a class="btn btn--ghost-light" href="${ttUrl(settings.tiktok_bible)}" target="_blank" rel="noopener">Bible art TikTok @${esc(settings.tiktok_bible)}</a></div>
      </div>
    </section>`;
}

const OIL_FILTERS = [
  { id: "all", label: "All" },
  { id: "available", label: "Available" },
  { id: "sold", label: "Sold" },
];

async function oilView(params) {
  const [works, settings] = await Promise.all([getArtworks(), getSettings()]);
  const oils = works.filter((w) => w.category === "oil");
  const f = OIL_FILTERS.some((x) => x.id === params.get("show")) ? params.get("show") : "all";
  const shown = f === "all" ? oils : f === "available" ? oils.filter((w) => w.status === "available" || w.status === "reserved") : oils.filter((w) => w.status === "sold");
  setMeta({ title: "Oil Paintings", path: "/oil-paintings", description: `Original oil paintings by Stevensosmoore. ${settings.tagline}` });
  const counts = { all: oils.length, available: oils.filter((w) => w.status === "available" || w.status === "reserved").length, sold: oils.filter((w) => w.status === "sold").length };
  return `
    <section class="page-head">
      <p class="eyebrow">Gallery I</p>
      <h1>Oil paintings</h1>
      <p class="page-head__lede">Every painting is an original. ${esc(settings.price_range || "")}. Buy one directly or send an inquiry.</p>
      <nav class="chips" aria-label="Filter oil paintings">
        ${OIL_FILTERS.filter((x) => x.id === "all" || counts[x.id] > 0)
          .map((x) => `<a class="chip" href="/oil-paintings${x.id === "all" ? "" : `?show=${x.id}`}" ${x.id === f ? 'aria-current="true"' : ""}>${x.label} <span>${counts[x.id]}</span></a>`)
          .join("")}
      </nav>
    </section>
    <section class="section section--tight">${grid(shown)}</section>`;
}

async function otherView(params) {
  const [works, settings] = await Promise.all([getArtworks(), getSettings()]);
  const others = works.filter((w) => w.category !== "oil");
  const present = CATEGORIES.filter((c) => c.id !== "oil" && others.some((w) => w.category === c.id));
  const m = present.some((c) => c.id === params.get("medium")) ? params.get("medium") : "all";
  const shown = m === "all" ? others : others.filter((w) => w.category === m);
  setMeta({ title: "Other Media", path: "/other-media", description: `Acrylic paintings, charcoal and drawings by Stevensosmoore. ${settings.tagline}` });
  return `
    <section class="page-head">
      <p class="eyebrow">Gallery II</p>
      <h1>Other media</h1>
      <p class="page-head__lede">Acrylic paintings, charcoal and drawings.</p>
      <nav class="chips" aria-label="Filter by medium">
        <a class="chip" href="/other-media" ${m === "all" ? 'aria-current="true"' : ""}>All <span>${others.length}</span></a>
        ${present.map((c) => `<a class="chip" href="/other-media?medium=${c.id}" ${c.id === m ? 'aria-current="true"' : ""}>${c.plural} <span>${others.filter((w) => w.category === c.id).length}</span></a>`).join("")}
      </nav>
    </section>
    <section class="section section--tight">${grid(shown)}</section>`;
}

async function workView(id) {
  const [works, settings] = await Promise.all([getArtworks(), getSettings()]);
  const work = works.find((w) => String(w.id) === String(id));
  if (!work) return notFoundView();
  const isOil = work.category === "oil";
  const siblings = works.filter((w) => (w.category === "oil") === isOil);
  const idx = siblings.indexOf(work);
  const prev = siblings[(idx - 1 + siblings.length) % siblings.length];
  const next = siblings[(idx + 1) % siblings.length];
  const more = siblings.filter((w) => w !== work).slice(0, 4);
  const price = formatPrice(work.price);
  const buy = safeUrl(work.purchase_url);
  const galleryPath = isOil ? "/oil-paintings" : "/other-media";

  setMeta({ title: work.title, path: workPath(work), image: imageFor(work, "full"), description: `${work.title} — ${mediumFor(work)} by Stevensosmoore. ${work.status === "sold" ? "Sold." : price ? price + "." : "Price on request."}` });

  let actions;
  if (work.status === "available" && buy) {
    actions = `<a class="btn" href="${esc(buy)}" target="_blank" rel="noopener">Purchase${price ? ` — ${esc(price)}` : ""}</a><button class="btn btn--ghost" type="button" data-open-inquiry>Ask a question</button>`;
  } else if (canBuy(work)) {
    actions = readCart().includes(String(work.id))
      ? `<a class="btn" href="/cart">In your cart — view cart</a><button class="btn btn--ghost" type="button" data-open-inquiry>Ask a question</button>`
      : `<button class="btn" type="button" data-add="${esc(work.id)}">Add to cart — ${esc(formatPrice(salePrice(work)))}</button><a class="btn btn--ghost" href="${esc(smsLink(orderText([work])))}">Buy now — text me</a><a class="btn btn--ghost" href="${esc(mailLink(orderText([work]), `Order: ${work.title}`))}">Buy now — email me</a><button class="btn btn--ghost" type="button" data-open-inquiry>Ask a question</button>`;
  } else if (work.status === "available") {
    actions = `<button class="btn" type="button" data-open-inquiry>Inquire about this work</button>`;
  } else if (work.status === "reserved") {
    actions = `<button class="btn btn--ghost" type="button" data-open-inquiry>Join the waitlist</button>`;
  } else {
    actions = `<a class="btn${work.status === "sold" && inCollection(work) ? " btn--sold-gold" : ""}" href="${esc(smsLink(`Hi! I saw "${work.title}" on stevensosmoore.com (sold). I'd like to request something similar.\nSize:\nMy idea:`))}">Request something similar</a>
      <a class="btn btn--ghost" href="${esc(mailLink(`Hi! I saw "${work.title}" on stevensosmoore.com (sold). I'd like to request something similar.\nSize:\nMy idea:`, `Something similar to ${work.title}`))}">Email a request</a>
      <p class="work__phone">Text or call <a href="tel:${ORDER_PHONE}">+1 470-533-7922</a> · Email <a href="mailto:${ORDER_EMAIL}">${ORDER_EMAIL}</a></p>`;
  }

  return `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${galleryPath}">${isOil ? "Oil paintings" : "Other media"}</a><span aria-hidden="true">/</span><span>${esc(work.title)}</span></nav>
    <article class="work${inCollection(work) ? " work--gold" : ""}">
      <div class="work__stage">
        <button class="work__zoom" type="button" data-zoom="${esc(imageFor(work, "full"))}" data-zoom-alt="${esc(work.alt_text || work.title)}" aria-label="Enlarge ${esc(work.title)}">
          ${img(work, { size: "full", eager: true, sizes: "(min-width: 1000px) 60vw, 100vw" })}
          ${work.status === "sold" ? '<span class="red-dot red-dot--large" aria-hidden="true"></span>' : ""}
          <span class="work__zoom-hint" aria-hidden="true">⤢ Enlarge</span>
          <span class="loupe" aria-hidden="true" data-loupe style="background-image:url('${esc(imageFor(work, "full"))}')"></span>
        </button>
        ${(work.detail_urls || []).length ? `<div class="details"><p class="eyebrow">Details</p><div class="details__row">${work.detail_urls.map(safeUrl).filter(Boolean).map((u, i) => `<button type="button" class="details__btn" data-zoom="${esc(u)}" data-zoom-alt="Detail ${i + 1} of ${esc(work.title)}" aria-label="Enlarge detail ${i + 1}"><img src="${esc(u)}" alt="" loading="lazy"></button>`).join("")}</div></div>` : ""}
        ${safeUrl(work.video_url) ? `<div class="work__video"><p class="eyebrow">Up close · video</p><video src="${esc(safeUrl(work.video_url))}" ${/\.mp4$/i.test(work.video_url) ? `poster="${esc(safeUrl(work.video_url.replace(/\.mp4$/i, ".jpg")))}"` : ""} controls muted loop playsinline preload="metadata"></video></div>` : ""}
        <div class="stage-tools">
          <button class="chip" type="button" data-wall aria-pressed="false">🛋 View on a wall</button>
          <button class="chip" type="button" data-wander>✦ Random painting</button>
        </div>
        <div class="wall" data-wall-view hidden>
          <div class="wall__room">
            <img class="wall__art" src="${esc(imageFor(work, "full"))}" alt="" style="--w:${wallWidth(work)}%">
            <svg class="wall__sofa" viewBox="0 0 400 120" aria-hidden="true"><path d="M20 50q0-20 20-20h320q20 0 20 20v30H20z" fill="#6f8a8a"/><rect x="0" y="60" width="400" height="45" rx="14" fill="#5d7676"/><rect x="24" y="104" width="10" height="16" fill="#3b2f2a"/><rect x="366" y="104" width="10" height="16" fill="#3b2f2a"/></svg>
          </div>
          <p class="wall__note">${work.dimensions ? `Shown to scale above a 7-foot sofa (${esc(work.dimensions)}).` : "Approximate scale — ask for exact dimensions."}</p>
        </div>
      </div>
      <div class="work__info">
        <p class="eyebrow">${esc(categoryLabel(work.category))}</p>
        <h1 class="work__title"><i>${esc(work.title)}</i></h1>
        <dl class="work__label">
          ${work.year ? `<div><dt>Year</dt><dd>${esc(work.year)}</dd></div>` : ""}
          <div><dt>Medium</dt><dd>${esc(mediumFor(work)) || "—"}</dd></div>
          ${work.dimensions ? `<div><dt>Size</dt><dd>${esc(work.dimensions)}</dd></div>` : ""}
          <div><dt>Status</dt><dd><span class="status status--${esc(work.status)}">${esc(statusLabel(work.status))}</span></dd></div>
        </dl>
        ${work.status === "sold" && price ? `<p class="work__sold">Sold · ${esc(price)} plus shipping</p>` : ""}
        ${inCollection(work) ? `<a class="gold-btn gold-btn--lg${work.status === "sold" ? " gold-btn--sold" : ""}" href="/college-christianity">${cross} College Christianity${work.status === "sold" ? " · Sold" : " · 25% off"}</a>` : ""}
        ${work.status === "available" || work.status === "reserved" ? `<p class="work__price">${salePriceHtml(work)}</p>` : ""}
        <div class="work__actions">${actions}</div>
        ${work.description ? `<div class="work__desc">${paragraphs(work.description)}</div>` : ""}
        <ul class="work__assure">
          <li>Original, painted and signed by the artist</li>
          <li>Questions about framing, shipping or seeing it in person are welcome</li>
        </ul>
        <div class="work__inquiry" data-inquiry-wrap hidden>
          <h2 class="work__inquiry-title">Inquire about <i>${esc(work.title)}</i></h2>
          ${inquiryForm({ work, settings, compact: true })}
        </div>
      </div>
    </article>
    ${
      siblings.length > 1
        ? `<nav class="pager" aria-label="More works">
            <a href="${workPath(prev)}" rel="prev"><span class="eyebrow">← Previous</span><i>${esc(prev.title)}</i></a>
            <a href="${workPath(next)}" rel="next"><span class="eyebrow">Next →</span><i>${esc(next.title)}</i></a>
          </nav>`
        : ""
    }
    ${
      more.length
        ? `<section class="section section--tight">
            <div class="section__head"><h2>More ${isOil ? "oil paintings" : "works"}</h2><a class="link-arrow" href="${galleryPath}">View all</a></div>
            <div class="works-grid works-grid--four">${more.map(card).join("")}</div>
          </section>`
        : ""
    }`;
}

async function aboutView() {
  const [works, settings] = await Promise.all([getArtworks(), getSettings()]);
  const portrait = works.find((w) => w.category === "oil" && w.image_height > w.image_width) || works[0];
  setMeta({ title: "About", path: "/about", description: "Stevensosmoore is a painter and Duke University student working in oil, acrylic, charcoal and graphite." });
  return `
    <section class="page-head"><p class="eyebrow">About</p><h1>The painter</h1><p class="page-head__lede">Former Division I wrestler, Duke student, full-time painter — and a follower of Christ.</p></section>
    <section class="about">
      <div class="about__text">
        ${paragraphs(settings.about)}
        <div class="about__facts">
          <div><p class="eyebrow">Age</p><p>19</p></div>
          <div><p class="eyebrow">Studies</p><p>Duke University student<br>Double major in political science and visual arts<br>Minor in political economy</p></div>
          <div><p class="eyebrow">Formerly</p><p>Division I wrestler, University of Northern Colorado (walk-on, earned scholarship)</p></div>
          <div><p class="eyebrow">From</p><p>Georgia &amp; Florida</p></div>
          <div><p class="eyebrow">High school wrestling</p><p>Florida 1A state 4th place (junior) · State finalist (senior)</p></div>
          <div><p class="eyebrow">Works in</p><p>Oil · Acrylic · Charcoal · Graphite</p></div>
          <div><p class="eyebrow">Follow</p><p>${socials(settings)}</p></div>
        </div>
        ${verse(3)}
        <div class="hero__cta"><a class="btn" href="/oil-paintings">See the paintings</a><a class="btn btn--ghost" href="/contact?kind=commission">Commissions</a></div>
      </div>
      <div class="about__photos">
        <figure class="about__photo about__photo--main"><img src="/images/about/duke.jpg" alt="Stevensosmoore and his dad outside Duke Chapel" width="1125" height="844" loading="lazy"><figcaption>With my dad at Duke Chapel</figcaption></figure>
        <figure class="about__photo about__photo--side"><img src="/images/about/wrestling.jpg" alt="Stevensosmoore's University of Northern Colorado wrestling headshot" width="1019" height="1533" loading="lazy"><figcaption>Wrestling at the University of Northern Colorado</figcaption></figure>
        <div class="about__wrestle">
          <figure class="about__photo"><img src="/images/about/state.jpg" alt="Stevensosmoore on the mat at the Florida state wrestling tournament" width="610" height="732" loading="lazy"><figcaption>Florida state tournament</figcaption></figure>
          <figure class="about__photo"><img src="/images/about/unco-flag.jpg" alt="Stevensosmoore wrapped in a University of Northern Colorado Bears flag" width="1024" height="1543" loading="lazy"><figcaption>University of Northern Colorado</figcaption></figure>
        </div>
      </div>
    </section>`;
}

async function contactView(params) {
  const [works, settings] = await Promise.all([getArtworks(), getSettings()]);
  const work = params.get("work") ? works.find((w) => String(w.id) === params.get("work")) : null;
  const kind = ["general", "purchase", "commission"].includes(params.get("kind")) ? params.get("kind") : "general";
  const christian = ["partly", "fully"].includes(params.get("christian")) ? params.get("christian") : "";
  const size = RATES.find(([s]) => s === params.get("size"))?.[0] || "";
  setMeta({ title: "Contact & Commissions", path: "/contact", description: "Inquire about an original painting or a commission from Stevensosmoore." });
  return `
    <section class="page-head"><p class="eyebrow">Contact</p><h1>Say hello</h1>
      <p class="page-head__lede">Questions about a painting or a commission? Send a message and I will get back to you.</p></section>
    <section class="contact">
      <div class="contact__form">${work ? `<p class="contact__about">About: <a href="${workPath(work)}"><i>${esc(work.title)}</i></a></p>` : ""}${inquiryForm({ work, kind, christian, size, settings })}</div>
      <aside class="contact__aside">
        ${christianOffer}
        <div><p class="eyebrow">Commissions</p><p>Portraits, pets, places and stories, painted in my style. Tell me the idea, the size you're imagining and any timing.</p></div>
        <div><p class="eyebrow">Collecting</p><p>Available works can be bought straight from each painting's page. Ask anything about framing, shipping or pickup.</p></div>
        <div><p class="eyebrow">Elsewhere</p><p>${socials(settings)}${settings.contact_email ? `<br><a href="mailto:${esc(settings.contact_email)}">${esc(settings.contact_email)}</a>` : ""}${settings.contact_phone ? `<br><a href="tel:${esc(settings.contact_phone.replace(/[^\d+]/g, ""))}">${esc(settings.contact_phone)}</a>` : ""}</p></div>
      </aside>
    </section>`;
}

async function cartView() {
  const works = await getArtworks();
  const ids = readCart();
  const items = ids.map((id) => works.find((w) => String(w.id) === id)).filter(Boolean);
  const gone = items.filter((w) => !canBuy(w));
  const buyable = items.filter(canBuy);
  if (gone.length) writeCart(buyable.map((w) => String(w.id)));
  const total = buyable.reduce((t, w) => t + salePrice(w), 0);
  setMeta({ title: "Cart", path: "/cart", description: "Your cart." });
  return `
    <section class="page-head"><p class="eyebrow">Checkout</p><h1>Your cart</h1></section>
    <section class="cart">
      ${gone.length ? `<p class="cart__note" role="alert">${gone.map((w) => `<i>${esc(w.title)}</i>`).join(", ")} ${gone.length > 1 ? "are" : "is"} no longer available and ${gone.length > 1 ? "were" : "was"} removed.</p>` : ""}
      ${
        buyable.length
          ? `<ul class="cart__list">${buyable
              .map(
                (w) => `<li class="cart__item">
                  <a href="${workPath(w)}" class="cart__thumb">${img(w, { sizes: "120px" })}</a>
                  <div><a href="${workPath(w)}" class="cart__title"><i>${esc(w.title)}</i></a><p class="label__medium">${esc([mediumFor(w), w.dimensions].filter(Boolean).join(" · "))}</p><p class="label__medium">Original · 1 of 1</p></div>
                  <div class="cart__right"><p class="cart__price">${salePriceHtml(w)}</p><button class="linkish" type="button" data-remove="${esc(w.id)}">Remove</button></div>
                </li>`,
              )
              .join("")}</ul>
            <div class="cart__summary">
              <div class="cart__row"><span>Subtotal</span><strong>${esc(formatPrice(total))}</strong></div>
              <p class="label__medium">Shipping is added after you order.</p>
              <p class="cart__error" role="alert" hidden></p>
              <a class="btn" href="${esc(smsLink(orderText(buyable)))}" data-text-order>Checkout — text my order</a>
              <a class="btn btn--ghost" href="${esc(mailLink(orderText(buyable), "Order from stevensosmoore.com"))}" data-email-order>Checkout — email my order</a>
              <p class="label__medium">Opens a text to <a href="tel:${ORDER_PHONE}">+1 470-533-7922</a> or an email to <a href="mailto:${ORDER_EMAIL}">${ORDER_EMAIL}</a> with your order filled in. I'll reply to confirm and arrange payment and shipping.</p>
              <button class="btn btn--ghost btn--small" type="button" data-checkout>Or pay online by card</button>
              <a class="link-arrow" href="/oil-paintings">Keep looking</a>
            </div>`
          : `<p class="empty">Your cart is empty.</p><a class="btn" href="/oil-paintings">Browse paintings</a>`
      }
    </section>`;
}

async function thankYouView() {
  writeCart([]);
  setMeta({ title: "Thank you", path: "/thank-you", description: "Thank you for your purchase." });
  return `
    <section class="lost">
      ${airship}
      <p class="eyebrow">Order confirmed</p>
      <h1>Thank you!</h1>
      <p>Your payment went through and a receipt is on its way to your email. I'll be in touch about shipping soon.</p>
      <a class="btn" href="/oil-paintings">Back to the paintings</a>
    </section>`;
}

async function startCheckout(ids, errEl, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Opening checkout…";
  const fail = (m) => {
    btn.disabled = false;
    btn.textContent = label;
    if (errEl) (errEl.textContent = m), (errEl.hidden = false);
    else toast(m);
  };
  try {
    const r = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.url) return (location.href = data.url);
    if (r.status === 409 && data.unavailable) {
      writeCart(readCart().filter((id) => !data.unavailable.includes(id)));
      return fail("Sorry — something in your cart just sold. Please review your cart.");
    }
    if (r.status === 503 || r.status === 404) return fail("Online checkout is coming soon. Please send an inquiry and I'll send you a payment link.");
    fail(data.error || "Couldn't start checkout. Please try again.");
  } catch {
    fail("Couldn't reach checkout. Please check your connection and try again.");
  }
}

const RATES = [
  ["1 × 1 ft", 1, 250], ["1 × 2 ft", 2, 300], ["2 × 2 ft", 4, 350], ["2 × 3 ft", 6, 450], ["3 × 3 ft", 9, 600],
  ["3 × 4 ft", 12, 750], ["4 × 4 ft", 16, 1000], ["4 × 5 ft", 20, 1250], ["4 × 6 ft", 24, 1500], ["5 × 5 ft", 25, 1562.5],
  ["5 × 6 ft", 30, 1875], ["6 × 6 ft", 36, 2250], ["6 × 8 ft", 48, 3000],
];
const usd = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);

async function collectionView() {
  const works = (await getArtworks()).filter(inCollection);
  setMeta({ title: "College Christianity", path: "/college-christianity", description: "College Christianity — oil paintings of biblical stories by Stevensosmoore. 25% off every piece and Christian commissions." });
  return `
    <section class="page-head page-head--collection">
      ${cross}
      <p class="eyebrow">Collection</p>
      <h1>College Christianity</h1>
      <p class="page-head__lede">Oil paintings of stories from Scripture, made while studying at Duke. <strong>25% off every piece</strong> in the collection and every Christian commission, before shipping.</p>
    </section>
    <section class="section section--tight">${grid(works)}</section>
    <section class="section">${christianOffer}</section>
    <section class="section">${verse(6)}</section>`;
}

async function commissionsView() {
  setMeta({ title: "Commissions", path: "/commissions", description: "Commission an original oil painting by Stevensosmoore. Rates from $250 (1 × 1 ft) to $3,000 (6 × 8 ft), before shipping." });
  return `
    <section class="page-head"><p class="eyebrow">Commissions</p><h1>Commission a painting</h1>
      <p class="page-head__lede">An original painting made just for you — a portrait, a pet, a place or a story. Prices are by canvas size, before shipping.</p></section>
    <section class="rates">
      <div class="rates__table-wrap">
        <table class="rates__table">
          <caption class="visually-hidden">Commission rates by canvas size</caption>
          <thead><tr><th scope="col">Canvas size</th><th scope="col">Sq ft</th><th scope="col">Price</th><th scope="col">Christian commission <span>(25% off)</span></th></tr></thead>
          <tbody>${RATES.map(([size, sq, price], i) => `<tr data-rate="${i}"><th scope="row">${size}</th><td>${sq}</td><td>${usd(price)}</td><td>${usd(price * 0.75)}</td></tr>`).join("")}</tbody>
        </table>
        <p class="rates__note">All prices are before shipping. Christian commissions — partly or fully Christian — get 25% off the total before shipping.</p>
      </div>
      <aside class="rates__calc">
        <p class="eyebrow">Price your painting</p>
        <div class="field"><label for="rc-size">Canvas size</label><select class="select input" id="rc-size" data-rc-size>${RATES.map(([size], i) => `<option value="${i}" ${i === 4 ? "selected" : ""}>${size}</option>`).join("")}</select></div>
        <label class="check-row"><input type="checkbox" data-rc-christian> Christian painting (25% off)</label>
        <p class="rates__total"><span data-rc-total></span><small>before shipping</small></p>
        <a class="btn" data-rc-text href="#">Text this request</a>
        <a class="btn btn--ghost" data-rc-mail href="#">Email this request</a>
        <a class="linkish" data-rc-go href="/contact?kind=commission">Or use the contact form</a>
      </aside>
    </section>
    <section class="section">${christianOffer}</section>`;
}

function notFoundView() {
  setMeta({ title: "Page not found", path: location.pathname, description: "Page not found." });
  return `
    <section class="lost">
      ${airship}
      <p class="eyebrow">404</p>
      <h1>Page not found.</h1>
      <p>This page doesn't exist.</p>
      <a class="btn" href="/">Back to the paintings</a>
    </section>`;
}

/* ------------------------------------------------------------------- playful */

const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

function playful() {
  // Surprise me: jump to a random painting
  view.querySelectorAll("[data-wander]").forEach((b) =>
    b.addEventListener("click", async () => {
      const works = (await getArtworks()).filter((w) => !location.pathname.startsWith(`/work/${w.id}`));
      if (!works.length) return;
      const pick = works[Math.floor(Math.random() * works.length)];
      b.classList.add("is-spinning");
      setTimeout(() => navigate(workPath(pick)), reduceMotion ? 0 : 450);
    }),
  );

  // Airship: click to launch it across the sky
  const ship = view.querySelector("[data-airship]");
  if (ship) {
    ship.addEventListener("click", () => {
      if (ship.classList.contains("is-launched")) return;
      ship.classList.add("is-launched");
      
      setTimeout(() => ship.classList.remove("is-launched"), 4200);
    });
  }

  // Hero painting tilts toward the cursor
  const hero = view.querySelector(".hero__work");
  if (hero && finePointer && !reduceMotion) {
    const frame = hero.querySelector(".hero__frame");
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      frame.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 6}deg) translateY(-4px)`;
    });
    hero.addEventListener("pointerleave", () => (frame.style.transform = ""));
  }

  // Magnifying loupe for brushwork
  const zoom = view.querySelector(".work__zoom");
  const loupe = view.querySelector("[data-loupe]");
  if (zoom && loupe && finePointer) {
    const imgEl = zoom.querySelector("img");
    zoom.addEventListener("pointermove", (e) => {
      const r = imgEl.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x < 0 || y < 0 || x > r.width || y > r.height) return loupe.classList.remove("is-on");
      const zr = zoom.getBoundingClientRect();
      loupe.classList.add("is-on");
      loupe.style.left = `${e.clientX - zr.left}px`;
      loupe.style.top = `${e.clientY - zr.top}px`;
      loupe.style.backgroundSize = `${r.width * 2.6}px ${r.height * 2.6}px`;
      loupe.style.backgroundPosition = `${-(x * 2.6 - 80)}px ${-(y * 2.6 - 80)}px`;
    });
    zoom.addEventListener("pointerleave", () => loupe.classList.remove("is-on"));
  }

  // View on a wall
  const wallBtn = view.querySelector("[data-wall]");
  if (wallBtn) {
    const wall = view.querySelector("[data-wall-view]");
    wallBtn.addEventListener("click", () => {
      const on = wall.hidden;
      wall.hidden = !on;
      zoom.hidden = on;
      wallBtn.setAttribute("aria-pressed", String(on));
      wallBtn.textContent = on ? "⤢ Back to painting" : "🛋 View on a wall";
    });
  }

  // The oxblood road paints itself as you scroll
  const roads = [...document.querySelectorAll(".road path")];
  roads.forEach((p) => p.setAttribute("pathLength", "1"));
  drawRoads();
}

function drawRoads() {
  if (reduceMotion) return;
  document.querySelectorAll(".road").forEach((svg) => {
    const r = svg.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight * 0.7)));
    svg.querySelector("path").style.strokeDashoffset = String(1 - t);
  });
}
window.addEventListener("scroll", () => requestAnimationFrame(drawRoads), { passive: true });

function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.querySelector("[data-toasts]").append(el);
  setTimeout(() => el.remove(), 3000);
}

// Arrow keys flip through works on an artwork page
document.addEventListener("keydown", (e) => {
  if (view.dataset.route !== "work" || !lb.hidden || e.target.closest("input, textarea, select")) return;
  const rel = e.key === "ArrowLeft" ? "prev" : e.key === "ArrowRight" ? "next" : null;
  const a = rel && view.querySelector(`.pager a[rel="${rel}"]`);
  if (a) navigate(a.getAttribute("href"));
});

/* -------------------------------------------------------------------- router */

function match(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return { key: "home", run: homeView };
  if (p === "/oil-paintings") return { key: "oil", run: oilView };
  if (p === "/other-media") return { key: "other", run: otherView };
  if (p === "/about") return { key: "about", run: aboutView };
  if (p === "/contact") return { key: "contact", run: contactView };
  if (p === "/cart") return { key: "cart", run: cartView };
  if (p === "/commissions") return { key: "commissions", run: commissionsView };
  if (p === "/college-christianity") return { key: "collection", run: collectionView };
  if (p === "/thank-you") return { key: "thanks", run: thankYouView };
  const m = p.match(/^\/work\/(\d+)(?:-[a-z0-9-]*)?$/);
  if (m) return { key: "work", run: () => workView(m[1]) };
  return { key: "404", run: notFoundView };
}

let renderToken = 0;
async function render({ focus = false } = {}) {
  const token = ++renderToken;
  const route = match(location.pathname);
  const params = new URLSearchParams(location.search);
  let html;
  try {
    html = await route.run(params);
  } catch (err) {
    console.error(err);
    html = `<section class="lost"><h1>Something went sideways.</h1><p>Please refresh the page.</p></section>`;
  }
  if (token !== renderToken) return;
  view.innerHTML = html;
  view.dataset.route = route.key;
  document.body.dataset.route = route.key;
  document.querySelectorAll("[data-nav]").forEach((a) => {
    const on = a.dataset.nav === route.key || (route.key === "work" && view.querySelector(`.crumbs a[href="/${a.dataset.nav === "oil" ? "oil-paintings" : "other-media"}"]`));
    on ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current");
  });
  const settings = await getSettings();
  document.querySelectorAll("[data-instagram]").forEach((a) => (a.href = igUrl(settings)));
  enhance(settings);
  if (focus) {
    const h1 = view.querySelector("h1");
    if (h1) {
      h1.setAttribute("tabindex", "-1");
      h1.focus({ preventScroll: true });
    }
    announcer.textContent = document.title;
  }
}

function enhance(settings) {
  bindInquiry(view, settings);
  const rcSize = view.querySelector("[data-rc-size]");
  if (rcSize) {
    const chk = view.querySelector("[data-rc-christian]");
    const upd = () => {
      const [size, , price] = RATES[rcSize.value];
      const total = chk.checked ? price * 0.75 : price;
      view.querySelector("[data-rc-total]").textContent = usd(total);
      view.querySelectorAll("[data-rate]").forEach((r) => r.classList.toggle("is-on", r.dataset.rate === rcSize.value));
      view.querySelector("[data-rc-text]").href = smsLink(`Hi! I'd like to commission a ${size} painting${chk.checked ? " (Christian commission — 25% off)" : ""}. Price: ${usd(total)} + shipping.\nMy idea:`);
      view.querySelector("[data-rc-mail]").href = mailLink(`Hi! I'd like to commission a ${size} painting${chk.checked ? " (Christian commission — 25% off)" : ""}. Price: ${usd(total)} + shipping.\nMy idea:`, `Commission request: ${size}`);
      view.querySelector("[data-rc-go]").href = `/contact?kind=commission${chk.checked ? "&christian=partly" : ""}&size=${encodeURIComponent(size)}`;
    };
    rcSize.addEventListener("change", upd);
    chk.addEventListener("change", upd);
    view.querySelectorAll("[data-rate]").forEach((r) => r.addEventListener("click", () => ((rcSize.value = r.dataset.rate), upd())));
    upd();
  }
  const kindSel = view.querySelector("#iq-kind");
  const chr = view.querySelector("[data-christian-field]");
  if (kindSel && chr) kindSel.addEventListener("change", () => (chr.hidden = kindSel.value !== "commission"));
  view.querySelectorAll("[data-open-inquiry]").forEach((b) =>
    b.addEventListener("click", () => {
      const wrap = view.querySelector("[data-inquiry-wrap]");
      wrap.hidden = false;
      wrap.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      wrap.querySelector("input:not([type=hidden])")?.focus({ preventScroll: true });
    }),
  );
  view.querySelectorAll("[data-zoom]").forEach((b) => b.addEventListener("click", () => openLightbox(b.dataset.zoom, b.dataset.zoomAlt, b)));
  playful();
  view.querySelectorAll("[data-verses]").forEach((fig) => {
    let i = Number(fig.dataset.start) || 0;
    const show = (n) => {
      i = (n + VERSES.length) % VERSES.length;
      fig.classList.add("is-fading");
      setTimeout(() => {
        fig.querySelector("[data-verse-text]").textContent = `“${VERSES[i][0]}”`;
        fig.querySelector("[data-verse-ref]").textContent = VERSES[i][1];
        fig.querySelectorAll(".verse__dots span").forEach((d, k) => d.classList.toggle("on", k === i));
        fig.classList.remove("is-fading");
      }, reduceMotion ? 0 : 300);
    };
    fig.querySelector("[data-verse-next]").addEventListener("click", () => show(i + 1));
    if (!reduceMotion) {
      const t = setInterval(() => (document.body.contains(fig) ? show(i + 1) : clearInterval(t)), 9000);
    }
  });
  updateCartCount();
  view.querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", () => {
      writeCart([...readCart(), b.dataset.add]);
      toast("Added to your cart");
      render();
    }),
  );
  view.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => startCheckout([b.dataset.buy], null, b)));
  view.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => {
      writeCart(readCart().filter((id) => id !== b.dataset.remove));
      render();
    }),
  );
  const co = view.querySelector("[data-checkout]");
  if (co) co.addEventListener("click", () => startCheckout(readCart(), view.querySelector(".cart__error"), co));
  const items = view.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) return items.forEach((el) => el.classList.add("is-in"));
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("is-in"), io.unobserve(e.target))),
    { rootMargin: "0px 0px -8% 0px" },
  );
  items.forEach((el) => io.observe(el));
}

const scrollPositions = new Map();
history.scrollRestoration = "manual";

function navigate(url, { replace = false } = {}) {
  scrollPositions.set(history.state?.key ?? "init", window.scrollY);
  const key = Math.random().toString(36).slice(2);
  history[replace ? "replaceState" : "pushState"]({ key }, "", url);
  closeMenu();
  render({ focus: true }).then(() => window.scrollTo(0, 0));
}

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target && a.target !== "_self") return;
  if (a.hasAttribute("download")) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/admin") || /\.\w+$/.test(url.pathname)) return;
  e.preventDefault();
  if (url.href === location.href) return closeMenu();
  navigate(url.pathname + url.search);
});

window.addEventListener("popstate", () => {
  closeMenu();
  closeLightbox();
  render({ focus: true }).then(() => window.scrollTo(0, scrollPositions.get(history.state?.key ?? "init") || 0));
});

/* ---------------------------------------------------------------- mobile nav */

const header = document.querySelector("[data-header]");
const toggle = document.querySelector("[data-menu-toggle]");
function closeMenu() {
  header.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
}
toggle.addEventListener("click", () => {
  const open = !header.classList.contains("is-open");
  header.classList.toggle("is-open", open);
  toggle.setAttribute("aria-expanded", String(open));
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeMenu();
  closeLightbox();
});
let lastY = 0;
window.addEventListener(
  "scroll",
  () => {
    const y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 8);
    lastY = y;
  },
  { passive: true },
);

/* ------------------------------------------------------------------ lightbox */

const lb = document.querySelector("[data-lightbox]");
const lbImg = lb.querySelector("[data-lightbox-img]");
let lbReturn = null;
function openLightbox(src, alt, from) {
  lbReturn = from;
  lbImg.src = src;
  lbImg.alt = alt || "";
  lb.hidden = false;
  document.body.style.overflow = "hidden";
  lb.querySelector("[data-lightbox-close]").focus();
}
function closeLightbox() {
  if (lb.hidden) return;
  lb.hidden = true;
  document.body.style.overflow = "";
  lbReturn?.focus();
}
lb.addEventListener("click", (e) => (e.target === lb || e.target.closest("[data-lightbox-close]") || e.target === lbImg) && closeLightbox());
lb.addEventListener("keydown", (e) => e.key === "Tab" && (e.preventDefault(), lb.querySelector("[data-lightbox-close]").focus()));

history.replaceState({ key: "init" }, "", location.href);
render();
