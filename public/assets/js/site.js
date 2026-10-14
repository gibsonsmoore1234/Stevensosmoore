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
} from "./api.js";

const view = document.querySelector("[data-view]");
const announcer = document.querySelector("[data-announcer]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const BASE_TITLE = "Stevensosmoore";

/* ------------------------------------------------------------------ helpers */

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
  return `<span class="label__price">${esc(formatPrice(work.price) || "Price on request")}</span>`;
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
    <a class="work-card reveal" style="--i:${i % 6}" href="${workPath(work)}">
      <span class="work-card__frame">${img(work)}${work.status === "sold" ? '<span class="red-dot" aria-hidden="true"></span>' : ""}</span>
      ${wallLabel(work)}
    </a>`;
}

const grid = (works) => (works.length ? `<div class="works-grid">${works.map(card).join("")}</div>` : `<p class="empty">New work is on the easel — check back soon, or follow along on Instagram.</p>`);

const airship = `
  <svg class="airship" viewBox="0 0 120 60" aria-hidden="true">
    <path d="M14 26c0-11 20-18 44-18s46 7 46 18-22 18-46 18S14 37 14 26z" fill="#8e8a8c" stroke="#1c1916" stroke-width="2.4"/>
    <path d="M30 14c14 3 42 3 58 0M24 38c16-3 50-3 66 0" fill="none" stroke="#1c1916" stroke-width="1.6" opacity=".55"/>
    <path d="M102 26l14-10v20z" fill="#5c2a35" stroke="#1c1916" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M50 44l2 7h14l2-7" fill="#5c2a35" stroke="#1c1916" stroke-width="2.2" stroke-linejoin="round"/>
  </svg>`;

const road = (cls = "") => `<svg class="road ${cls}" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden="true"><path d="M-10 90 C 180 20, 360 110, 600 60 S 980 0, 1210 70" /></svg>`;

function wallWidth(work) {
  const m = String(work.dimensions || "").match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|in|")?/i);
  if (!m) return 34;
  let [a, b] = [Number(m[1]), Number(m[2])];
  if (/cm/i.test(m[3] || "")) (a /= 2.54), (b /= 2.54);
  const widthIn = (work.image_width || 1) >= (work.image_height || 1) ? Math.max(a, b) : Math.min(a, b);
  return Math.max(8, Math.min(90, (widthIn / 84) * 70));
}

/* -------------------------------------------------------------- inquiry form */

function inquiryForm({ work = null, kind = "general", settings, compact = false }) {
  const msg = work ? `Hi! I'm interested in "${work.title}". ` : "";
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
      <div class="inquiry__row">
        <div class="field"><label for="iq-name">Name</label><input class="input" id="iq-name" name="name" autocomplete="name" required maxlength="200"></div>
        <div class="field"><label for="iq-email">Email</label><input class="input" id="iq-email" name="email" type="email" autocomplete="email" required maxlength="320"></div>
      </div>
      <div class="field"><label for="iq-message">Message</label><textarea class="textarea input" id="iq-message" name="message" maxlength="5000" rows="5">${esc(msg)}</textarea></div>
      <div class="hp" aria-hidden="true"><label>Company <input name="company" tabindex="-1" autocomplete="off"></label></div>
      <p class="inquiry__error" role="alert" hidden></p>
      <div class="inquiry__actions">
        <button class="btn" type="submit">Send message</button>
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
        await submitInquiry({ artwork_id: data.artwork_id || null, kind: data.kind || "general", name: data.name, email: data.email, message: data.message });
        form.outerHTML = `
          <div class="sent" role="status" tabindex="-1">
            ${airship}
            <h3>Thank you, ${esc(data.name.trim().split(" ")[0])}.</h3>
            <p>Your message is on its way. I'll reply to <strong>${esc(data.email)}</strong> soon.</p>
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
  const featured = works.filter((w) => w.featured && w !== hero).slice(0, 6);
  const selected = featured.length >= 3 ? featured : works.filter((w) => w !== hero && w.category === "oil").slice(0, 6);
  const other = works.filter((w) => w.category !== "oil").slice(0, 4);
  setMeta({ path: "/", description: settings.tagline });

  return `
    <section class="hero">
      <div class="hero__sky" aria-hidden="true"><span class="hero__sun"></span></div>
      <button class="hero__airship" type="button" data-airship aria-label="Launch the airship">${airship}</button>
      <div class="hero__inner">
        <div class="hero__text">
          <p class="eyebrow">${esc(settings.price_range || "Original paintings")}</p>
          <h1 class="hero__title">Strange skies,<br><em>winding roads.</em></h1>
          <p class="hero__lede">${esc(settings.tagline)}</p>
          <div class="hero__cta">
            <a class="btn" href="/oil-paintings">View oil paintings</a>
            <a class="btn btn--ghost" href="/other-media">Other media</a>
          </div>
          <button class="wander" type="button" data-wander><span aria-hidden="true">✦</span> Take me somewhere strange</button>
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

    <section class="section">
      <div class="section__head">
        <div><p class="eyebrow">Selected works</p><h2>From the studio</h2></div>
        <a class="link-arrow" href="/oil-paintings">All oil paintings</a>
      </div>
      ${grid(selected)}
    </section>

    ${
      other.length
        ? `<section class="section section--band">
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
        <h2>Painted by hand, <em>thick and strange.</em></h2>
        ${paragraphs(settings.about.split(/\n{2,}/).slice(0, 2).join("\n\n"))}
        <a class="link-arrow" href="/about">More about me</a>
      </div>
      <div class="about-teaser__cta">
        <p class="eyebrow">Commissions</p>
        <p class="about-teaser__big">Have a wall, a story or a strange idea? Let's paint it.</p>
        <a class="btn btn--amber" href="/contact?kind=commission">Ask about a commission</a>
      </div>
    </section>

    <section class="ig-band">
      <div class="ig-band__inner">
        <p class="eyebrow">Fresh off the easel</p>
        <a class="ig-band__handle" href="${igUrl(settings)}" target="_blank" rel="noopener">@${esc(settings.instagram)}</a>
        <p>Works in progress, studio days and new paintings first on Instagram.</p>
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
      <p class="page-head__lede">Thick, saturated, made by hand. Every painting is an original — ${esc(settings.price_range || "")}. Collect one directly or send an inquiry.</p>
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
      <p class="page-head__lede">Acrylic, charcoal, graphite and whatever else is within reach — where many of the oil paintings begin.</p>
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
  } else if (work.status === "available") {
    actions = `<button class="btn" type="button" data-open-inquiry>Inquire about this work</button>`;
  } else if (work.status === "reserved") {
    actions = `<button class="btn btn--ghost" type="button" data-open-inquiry>Join the waitlist</button>`;
  } else {
    actions = `<a class="btn btn--ghost" href="/contact?kind=commission">Commission something similar</a>`;
  }

  return `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="${galleryPath}">${isOil ? "Oil paintings" : "Other media"}</a><span aria-hidden="true">/</span><span>${esc(work.title)}</span></nav>
    <article class="work">
      <div class="work__stage">
        <button class="work__zoom" type="button" data-zoom="${esc(imageFor(work, "full"))}" data-zoom-alt="${esc(work.alt_text || work.title)}" aria-label="Enlarge ${esc(work.title)}">
          ${img(work, { size: "full", eager: true, sizes: "(min-width: 1000px) 60vw, 100vw" })}
          ${work.status === "sold" ? '<span class="red-dot red-dot--large" aria-hidden="true"></span>' : ""}
          <span class="work__zoom-hint" aria-hidden="true">⤢ Enlarge</span>
          <span class="loupe" aria-hidden="true" data-loupe style="background-image:url('${esc(imageFor(work, "full"))}')"></span>
        </button>
        <div class="stage-tools">
          <button class="chip" type="button" data-wall aria-pressed="false">🛋 View on a wall</button>
          <button class="chip" type="button" data-wander>✦ Surprise me</button>
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
        ${work.status === "available" || work.status === "reserved" ? `<p class="work__price">${esc(price || "Price on request")}</p>` : ""}
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
    <section class="page-head"><p class="eyebrow">About</p><h1>The painter</h1></section>
    <section class="about">
      <div class="about__text">
        ${paragraphs(settings.about)}
        <div class="about__facts">
          <div><p class="eyebrow">Studies</p><p>Duke University</p></div>
          <div><p class="eyebrow">Works in</p><p>Oil · Acrylic · Charcoal · Graphite</p></div>
          <div><p class="eyebrow">Follow</p><p><a href="${igUrl(settings)}" target="_blank" rel="noopener">@${esc(settings.instagram)}</a></p></div>
        </div>
        <div class="hero__cta"><a class="btn" href="/oil-paintings">See the paintings</a><a class="btn btn--ghost" href="/contact?kind=commission">Commissions</a></div>
      </div>
      ${portrait ? `<a class="about__work" href="${workPath(portrait)}"><span class="work-card__frame">${img(portrait, { size: "full", sizes: "(min-width: 900px) 40vw, 100vw" })}</span><span class="hero__caption"><i>${esc(portrait.title)}</i> · ${esc(mediumFor(portrait))}</span></a>` : ""}
    </section>`;
}

async function contactView(params) {
  const [works, settings] = await Promise.all([getArtworks(), getSettings()]);
  const work = params.get("work") ? works.find((w) => String(w.id) === params.get("work")) : null;
  const kind = ["general", "purchase", "commission"].includes(params.get("kind")) ? params.get("kind") : "general";
  setMeta({ title: "Contact & Commissions", path: "/contact", description: "Inquire about an original painting or a commission from Stevensosmoore." });
  return `
    <section class="page-head"><p class="eyebrow">Contact</p><h1>Say hello</h1>
      <p class="page-head__lede">Questions about a painting, a commission, or just a strange idea — every message is read by me.</p></section>
    <section class="contact">
      <div class="contact__form">${work ? `<p class="contact__about">About: <a href="${workPath(work)}"><i>${esc(work.title)}</i></a></p>` : ""}${inquiryForm({ work, kind, settings })}</div>
      <aside class="contact__aside">
        <div><p class="eyebrow">Commissions</p><p>Portraits, pets, places and stories, painted in my style. Tell me the idea, the size you're imagining and any timing.</p></div>
        <div><p class="eyebrow">Collecting</p><p>Available works can be bought straight from each painting's page. Ask anything about framing, shipping or pickup.</p></div>
        <div><p class="eyebrow">Elsewhere</p><p><a href="${igUrl(settings)}" target="_blank" rel="noopener">Instagram @${esc(settings.instagram)}</a>${settings.contact_email ? `<br><a href="mailto:${esc(settings.contact_email)}">${esc(settings.contact_email)}</a>` : ""}${settings.contact_phone ? `<br><a href="tel:${esc(settings.contact_phone.replace(/[^\d+]/g, ""))}">${esc(settings.contact_phone)}</a>` : ""}</p></div>
      </aside>
    </section>`;
}

function notFoundView() {
  setMeta({ title: "Lost in the clouds", path: location.pathname, description: "This page drifted away." });
  return `
    <section class="lost">
      ${airship}
      <p class="eyebrow">404</p>
      <h1>Lost in the clouds.</h1>
      <p>This page drifted off somewhere over the mountains.</p>
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
      toast("Bon voyage! ✦");
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
