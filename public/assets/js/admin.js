import { CATEGORIES, STATUSES, DEFAULT_SETTINGS, escapeHtml as esc, formatPrice, workPath, categoryLabel, statusLabel, safeUrl } from "./api.js";

const ENV = window.__ENV__ || {};
const app = document.getElementById("app");
const toasts = document.querySelector("[data-toasts]");
const BUCKET = "artworks";

function toast(msg, type = "ok") {
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " toast--error" : ""}`;
  el.textContent = msg;
  toasts.append(el);
  setTimeout(() => el.remove(), type === "error" ? 7000 : 3500);
}
const fail = (err, what = "Something went wrong") => {
  console.error(err);
  const m = err?.message || String(err);
  toast(/row-level security|permission denied|42501/i.test(m) ? `${what}: this account isn't allowed to make changes (is it in public.admins?)` : `${what}: ${m}`, "error");
};

function confirmDialog(title, body, okLabel = "Delete") {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    d.innerHTML = `<h2>${esc(title)}</h2><p>${esc(body)}</p><div class="formbar"><button class="btn btn--ghost btn--small" value="no">Cancel</button><button class="btn btn--danger btn--small" value="yes">${esc(okLabel)}</button></div>`;
    document.body.append(d);
    d.addEventListener("click", (e) => {
      const v = e.target.closest("button")?.value;
      if (v) d.close(v);
    });
    d.addEventListener("close", () => (resolve(d.returnValue === "yes"), d.remove()));
    d.showModal();
  });
}

/* ------------------------------------------------------------ not configured */
if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY || !window.supabase) {
  app.innerHTML = `
    <div class="auth"><div class="auth__card">
      <p class="eyebrow">Studio setup</p>
      <h1>Connect Supabase</h1>
      <p class="muted">The site can't find its Supabase settings, so it's showing the starter collection and the Studio can't sign in yet.</p>
      <ol class="steps">
        <li>In Vercel → Project → Settings → Environment Variables, add <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> (the Supabase integration usually adds <code>NEXT_PUBLIC_…</code> versions, which also work).</li>
        <li>Use the <b>anon / publishable</b> key — never the service_role key.</li>
        <li>Redeploy, then come back to <code>/admin</code>.</li>
      </ol>
      <p class="muted" style="margin-top:16px;font-size:var(--step--1)">Full checklist: README → "Launch checklist" in the GitHub repo.</p>
    </div></div>`;
  throw new Error("Supabase not configured");
}

const sb = window.supabase.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

/* ---------------------------------------------------------------------- auth */
let recovering = /type=recovery/.test(location.hash);
let user = null;
let booted = false;

function signInView(msg = "") {
  app.innerHTML = `
    <div class="auth"><div class="auth__card">
      <p class="eyebrow">Stevensosmoore</p>
      <h1>Studio sign-in</h1>
      <form data-signin novalidate>
        <div class="field"><label for="email">Email</label><input class="input" id="email" name="email" type="email" autocomplete="username" required></div>
        <div class="field"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required></div>
        <p class="error" role="alert" ${msg ? "" : "hidden"}>${esc(msg)}</p>
        <button class="btn" type="submit">Sign in</button>
        <div class="auth__links"><button class="linkbtn" type="button" data-forgot>Forgot password?</button><a class="linkbtn" href="/">← Back to site</a></div>
      </form>
    </div></div>`;
  const form = app.querySelector("[data-signin]");
  const err = form.querySelector(".error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { email, password } = Object.fromEntries(new FormData(form));
    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      btn.disabled = false;
      btn.textContent = "Sign in";
      err.hidden = false;
      err.textContent = /invalid/i.test(error.message) ? "That email and password don't match." : error.message;
    }
  });
  form.querySelector("[data-forgot]").addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!email) {
      err.hidden = false;
      err.textContent = "Enter your email above first, then press Forgot password.";
      return form.email.focus();
    }
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/admin` });
    if (error) return fail(error, "Couldn't send reset email");
    toast("If that email has an account, a reset link is on its way.");
  });
}

function recoveryView() {
  app.innerHTML = `
    <div class="auth"><div class="auth__card">
      <p class="eyebrow">Password reset</p><h1>Set a new password</h1>
      <form data-recover novalidate>
        <div class="field"><label for="np">New password</label><input class="input" id="np" name="pw" type="password" minlength="8" autocomplete="new-password" required></div>
        <div class="field"><label for="np2">Repeat new password</label><input class="input" id="np2" name="pw2" type="password" autocomplete="new-password" required></div>
        <p class="error" role="alert" hidden></p>
        <button class="btn" type="submit">Save password</button>
      </form>
    </div></div>`;
  const f = app.querySelector("[data-recover]");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = f.querySelector(".error");
    if (f.pw.value.length < 8 || f.pw.value !== f.pw2.value) {
      err.hidden = false;
      err.textContent = f.pw.value.length < 8 ? "Use at least 8 characters." : "The passwords don't match.";
      return;
    }
    const { error } = await sb.auth.updateUser({ password: f.pw.value });
    if (error) return fail(error, "Couldn't update password");
    recovering = false;
    history.replaceState(null, "", "/admin#artworks");
    toast("Password updated.");
    boot();
  });
}

async function boot() {
  if (recovering) return recoveryView();
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  if (!user) return signInView();
  const { data: rows, error } = await sb.from("admins").select("user_id").eq("user_id", user.id);
  if (error) {
    fail(error, "Couldn't check admin access");
    return notAdminView(true);
  }
  if (!rows?.length) return notAdminView();
  booted = true;
  shell();
}

function notAdminView(schemaMissing = false) {
  app.innerHTML = `
    <div class="auth"><div class="auth__card">
      <p class="eyebrow">Almost there</p>
      <h1>${schemaMissing ? "Database not set up" : "Not on the admin list"}</h1>
      <p class="muted">Signed in as <b>${esc(user.email)}</b>. ${schemaMissing ? "Run supabase/schema.sql in the Supabase SQL Editor, then" : "To give this account access,"} run this in Supabase → SQL Editor:</p>
      <pre class="code">insert into public.admins (user_id)
select id from auth.users where email = '${esc(String(user.email).replace(/'/g, "''"))}'
on conflict do nothing;</pre>
      <div class="formbar"><button class="btn" type="button" data-retry>I've done it — check again</button><button class="btn btn--ghost" type="button" data-out>Sign out</button></div>
    </div></div>`;
  app.querySelector("[data-retry]").onclick = () => boot();
  app.querySelector("[data-out]").onclick = () => sb.auth.signOut();
}

sb.auth.onAuthStateChange((event) => {
  if (event === "PASSWORD_RECOVERY") {
    recovering = true;
    return recoveryView();
  }
  if (event === "SIGNED_IN" && !booted) setTimeout(boot, 0);
  if (event === "SIGNED_OUT") {
    booted = false;
    user = null;
    signInView();
  }
});

/* --------------------------------------------------------------------- shell */
const SECTIONS = [
  ["artworks", "Artworks"],
  ["new", "Add work"],
  ["inquiries", "Inquiries"],
  ["site", "Site"],
  ["account", "Account"],
];
let works = [];
let dirty = false;

function shell() {
  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="side__brand">STEVENSOSMOORE<small>Studio</small></div>
        <nav aria-label="Studio">${SECTIONS.map(([id, label]) => `<a href="#${id}" data-sec="${id}">${label}${id === "inquiries" ? ' <span class="badge" data-badge hidden></span>' : ""}</a>`).join("")}<a href="/" target="_blank" rel="noopener">View site ↗</a></nav>
        <div class="side__foot"><span>${esc(user.email)}</span><button class="linkbtn" style="color:var(--amber-glow);text-align:left" data-signout>Sign out</button></div>
      </aside>
      <main class="main" id="main" tabindex="-1"></main>
    </div>`;
  app.querySelector("[data-signout]").onclick = () => sb.auth.signOut();
  refreshBadge();
  route();
}

window.addEventListener("hashchange", () => booted && route());
window.addEventListener("beforeunload", (e) => dirty && (e.preventDefault(), (e.returnValue = "")));
let lastHash = location.hash;

async function route() {
  if (dirty && location.hash !== lastHash && !confirm("Discard unsaved changes?")) {
    history.replaceState(null, "", lastHash);
    return;
  }
  dirty = false;
  lastHash = location.hash;
  const [sec, arg] = (location.hash.slice(1) || "artworks").split("/");
  app.querySelectorAll("[data-sec]").forEach((a) => (a.dataset.sec === (sec === "edit" ? "artworks" : sec) ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  const main = app.querySelector(".main");
  main.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    if (sec === "new") await formView(main, null);
    else if (sec === "edit") await formView(main, arg);
    else if (sec === "inquiries") await inquiriesView(main);
    else if (sec === "site") await siteView(main);
    else if (sec === "account") accountView(main);
    else await artworksView(main);
  } catch (err) {
    fail(err, "Couldn't load");
    main.innerHTML = `<div class="empty-state">Couldn't load this section. ${esc(err.message || "")}</div>`;
  }
  main.focus({ preventScroll: true });
}

async function loadWorks() {
  const { data, error } = await sb.from("artworks").select("*").order("sort_order").order("created_at", { ascending: false });
  if (error) throw error;
  works = data || [];
  return works;
}

async function refreshBadge() {
  const { count } = await sb.from("inquiries").select("id", { count: "exact", head: true }).eq("status", "new");
  const b = app.querySelector("[data-badge]");
  if (b) (b.hidden = !count), (b.textContent = count || "");
}

/* ------------------------------------------------------------------ artworks */
let listFilter = "all";
let listQuery = "";

async function artworksView(main) {
  await loadWorks();
  main.innerHTML = `
    <div class="main__head"><div><p class="eyebrow">Studio</p><h1>Artworks</h1></div><a class="btn" href="#new">+ Add work</a></div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filter">${[["all", "All"], ["oil", "Oil"], ["other", "Other media"], ["draft", "Drafts"]].map(([id, l]) => `<button type="button" data-f="${id}" aria-pressed="${id === listFilter}">${l}</button>`).join("")}</div>
      <label class="visually-hidden" for="q">Search titles</label><input class="input" id="q" type="search" placeholder="Search titles…" value="${esc(listQuery)}">
      <span class="muted" data-count style="font-size:var(--step--1)"></span>
    </div>
    <div class="list" data-list></div>`;
  main.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => ((listFilter = b.dataset.f), artworksView(main))));
  main.querySelector("#q").oninput = (e) => ((listQuery = e.target.value), drawList(main));
  drawList(main);
}

function visibleWorks() {
  const q = listQuery.trim().toLowerCase();
  return works.filter(
    (w) =>
      (listFilter === "all" || (listFilter === "oil" && w.category === "oil") || (listFilter === "other" && w.category !== "oil") || (listFilter === "draft" && !w.published)) &&
      (!q || w.title.toLowerCase().includes(q)),
  );
}

function drawList(main) {
  const list = main.querySelector("[data-list]");
  const shown = visibleWorks();
  main.querySelector("[data-count]").textContent = `${shown.length} of ${works.length}`;
  const canReorder = listFilter === "all" && !listQuery.trim();
  if (!shown.length) {
    list.innerHTML = `<div class="empty-state">${works.length ? "Nothing matches." : 'No artworks yet. <a href="#new">Add your first work</a>.'}</div>`;
    return;
  }
  list.innerHTML = shown
    .map(
      (w, i) => `
    <div class="row" data-id="${w.id}" ${canReorder ? 'draggable="true"' : ""}>
      <img src="${esc(safeUrl(w.thumb_url || w.image_url))}" alt="" loading="lazy">
      <div>
        <div class="row__title">${esc(w.title)}</div>
        <div class="row__meta">
          <span>${esc(categoryLabel(w.category))}</span>
          <span class="status status--${esc(w.status)}">${esc(statusLabel(w.status))}</span>
          <span>${esc(formatPrice(w.price) || "Price on request")}</span>
          ${w.published ? "" : '<span class="pill pill--draft">Draft</span>'}
          ${w.featured ? '<span class="pill pill--feat">Featured</span>' : ""}
        </div>
      </div>
      <div class="row__actions">
        ${canReorder ? `<button class="iconbtn" data-act="up" aria-label="Move ${esc(w.title)} up" ${i === 0 ? "disabled" : ""}>↑</button><button class="iconbtn" data-act="down" aria-label="Move ${esc(w.title)} down" ${i === shown.length - 1 ? "disabled" : ""}>↓</button>` : ""}
        <button class="iconbtn" data-act="pub">${w.published ? "Unpublish" : "Publish"}</button>
        <button class="iconbtn" data-act="feat">${w.featured ? "Unfeature" : "Feature"}</button>
        <a class="iconbtn" style="display:inline-grid;place-items:center;text-decoration:none" href="#edit/${w.id}">Edit</a>
        <button class="iconbtn" data-act="del" style="color:var(--danger)" aria-label="Delete ${esc(w.title)}">Delete</button>
      </div>
    </div>`,
    )
    .join("");

  list.querySelectorAll("[data-act]").forEach((b) => {
    b.onclick = async () => {
      const id = b.closest(".row").dataset.id;
      const w = works.find((x) => String(x.id) === id);
      const act = b.dataset.act;
      try {
        if (act === "pub" || act === "feat") {
          const field = act === "pub" ? "published" : "featured";
          const { error } = await sb.from("artworks").update({ [field]: !w[field] }).eq("id", w.id);
          if (error) throw error;
          w[field] = !w[field];
          toast(`${w.title}: ${act === "pub" ? (w.published ? "published" : "unpublished") : w.featured ? "featured on home page" : "removed from home page"}`);
        } else if (act === "del") {
          if (!(await confirmDialog("Delete this work?", `"${w.title}" will be removed from the site. This can't be undone.`))) return;
          const { error } = await sb.from("artworks").delete().eq("id", w.id);
          if (error) throw error;
          if (w.storage_path) await removeFolder(w.storage_path);
          works = works.filter((x) => x !== w);
          toast(`Deleted "${w.title}"`);
        } else {
          const i = works.indexOf(w);
          const j = act === "up" ? i - 1 : i + 1;
          if (j < 0 || j >= works.length) return;
          [works[i], works[j]] = [works[j], works[i]];
          await saveOrder();
        }
        drawList(main);
      } catch (err) {
        fail(err, "Couldn't save");
      }
    };
  });

  if (!canReorder) return;
  let dragId = null;
  list.querySelectorAll(".row").forEach((row) => {
    row.addEventListener("dragstart", () => ((dragId = row.dataset.id), row.classList.add("dragging")));
    row.addEventListener("dragend", () => row.classList.remove("dragging"));
    row.addEventListener("dragover", (e) => (e.preventDefault(), row.classList.add("drop")));
    row.addEventListener("dragleave", () => row.classList.remove("drop"));
    row.addEventListener("drop", async (e) => {
      e.preventDefault();
      row.classList.remove("drop");
      const from = works.findIndex((w) => String(w.id) === dragId);
      const to = works.findIndex((w) => String(w.id) === row.dataset.id);
      if (from < 0 || to < 0 || from === to) return;
      const [m] = works.splice(from, 1);
      works.splice(to, 0, m);
      try {
        await saveOrder();
      } catch (err) {
        fail(err, "Couldn't save order");
      }
      drawList(main);
    });
  });
}

async function saveOrder() {
  const changed = [];
  works.forEach((w, i) => {
    const s = (i + 1) * 10;
    if (w.sort_order !== s) (w.sort_order = s), changed.push(w);
  });
  const results = await Promise.all(changed.map((w) => sb.from("artworks").update({ sort_order: w.sort_order }).eq("id", w.id)));
  const bad = results.find((r) => r.error);
  if (bad) throw bad.error;
  toast("Order saved");
}

async function removeFolder(prefix) {
  const { data } = await sb.storage.from(BUCKET).list(prefix);
  const paths = (data || []).map((f) => `${prefix}/${f.name}`);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}

/* ---------------------------------------------------------------- image prep */
async function decode(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    im.src = url;
    await im.decode();
    return im;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function resize(src, max) {
  const w0 = src.width, h0 = src.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * s);
  c.height = Math.round(h0 * s);
  const ctx = c.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));
async function encode(canvas, q) {
  const webp = await toBlob(canvas, "image/webp", q);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp", type: "image/webp" };
  return { blob: await toBlob(canvas, "image/jpeg", 0.88), ext: "jpg", type: "image/jpeg" };
}

async function prepareImage(file) {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) throw new Error("That file isn't an image.");
  if (file.size > 40 * 1024 * 1024) throw new Error("That image is over 40 MB — please export a smaller JPEG.");
  let bmp;
  try {
    bmp = await decode(file);
  } catch {
    throw new Error("Couldn't read this file — export it as JPEG or PNG and try again.");
  }
  const full = resize(bmp, 2400);
  const thumb = resize(bmp, 900);
  return { full: await encode(full, 0.86), thumb: await encode(thumb, 0.8), width: full.width, height: full.height, preview: full.toDataURL("image/jpeg", 0.7) };
}

async function uploadImage(prepared) {
  const folder = `works/${crypto.randomUUID()}`;
  const up = async (name, img) => {
    const path = `${folder}/${name}.${img.ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, img.blob, { contentType: img.type, cacheControl: "31536000", upsert: false });
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };
  try {
    const image_url = await up("full", prepared.full);
    const thumb_url = await up("thumb", prepared.thumb);
    return { image_url, thumb_url, storage_path: folder, image_width: prepared.width, image_height: prepared.height };
  } catch (err) {
    await removeFolder(folder).catch(() => {});
    throw err;
  }
}

/* ---------------------------------------------------------------- work form */
async function formView(main, id) {
  if (!works.length) await loadWorks();
  const w = id ? works.find((x) => String(x.id) === String(id)) : null;
  if (id && !w) {
    main.innerHTML = `<div class="empty-state">That artwork wasn't found. <a href="#artworks">Back to artworks</a></div>`;
    return;
  }
  const v = w || { category: "oil", status: "available", published: true, featured: false };
  const catMedium = (c) => CATEGORIES.find((x) => x.id === c)?.medium || "";
  main.innerHTML = `
    <div class="main__head"><div><p class="eyebrow"><a href="#artworks">Artworks</a> /</p><h1>${w ? `Edit <i>${esc(w.title)}</i>` : "Add a work"}</h1></div>${w ? `<a class="btn btn--ghost btn--small" href="${workPath(w)}" target="_blank" rel="noopener">View on site ↗</a>` : ""}</div>
    <form class="form" data-form novalidate>
      <div>
        <label class="drop" data-drop tabindex="0">
          <input type="file" accept="image/*" hidden data-file>
          <span data-preview>${w ? `<img src="${esc(safeUrl(w.image_url))}" alt="">` : '<strong style="font-family:var(--font-display);font-size:var(--step-2)">Drop a photo here</strong>'}<p>${w ? "Click or drop to replace the image" : "or click to choose · paste also works"}<br>JPEG, PNG or WebP · resized automatically</p></span>
        </label>
        <p class="error" data-err-image hidden></p>
      </div>
      <div class="form__fields">
        <div class="field"><label for="f-title">Title *</label><input class="input" id="f-title" name="title" maxlength="200" required value="${esc(v.title || "")}"><span class="error" data-err-title hidden></span></div>
        <div class="grid2">
          <div class="field"><label for="f-cat">Category *</label><select class="select input" id="f-cat" name="category">${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === v.category ? "selected" : ""}>${c.label}</option>`).join("")}</select></div>
          <div class="field"><label for="f-med">Medium</label><input class="input" id="f-med" name="medium" maxlength="200" value="${esc(v.medium || "")}" placeholder="${esc(catMedium(v.category))}"></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="f-year">Year</label><input class="input" id="f-year" name="year" inputmode="numeric" value="${esc(v.year ?? "")}" placeholder="${new Date().getFullYear()}"><span class="error" data-err-year hidden></span></div>
          <div class="field"><label for="f-dim">Dimensions</label><input class="input" id="f-dim" name="dimensions" maxlength="120" value="${esc(v.dimensions || "")}"><span class="hint">e.g. 36 × 48 in</span></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="f-price">Price (USD)</label><input class="input" id="f-price" name="price" inputmode="decimal" value="${esc(v.price ?? "")}" placeholder="Blank = Price on request"><span class="error" data-err-price hidden></span></div>
          <div class="field"><label for="f-status">Status</label><select class="select input" id="f-status" name="status">${Object.entries(STATUSES).map(([k, l]) => `<option value="${k}" ${k === v.status ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label for="f-buy">Purchase link</label><input class="input" id="f-buy" name="purchase_url" type="url" value="${esc(v.purchase_url || "")}" placeholder="https://buy.stripe.com/…"><span class="hint">Optional — e.g. a Stripe Payment Link. Shows a "Purchase" button.</span><span class="error" data-err-purchase_url hidden></span></div>
        <div class="field"><label for="f-video">Video link</label><input class="input" id="f-video" name="video_url" value="${esc(v.video_url || "")}" placeholder="https://… .mp4"><span class="hint">Optional — a link to an MP4 of the painting (shown on its page).</span></div>
        <div class="field"><label for="f-desc">Description</label><textarea class="textarea input" id="f-desc" name="description" maxlength="5000">${esc(v.description || "")}</textarea></div>
        <div class="field"><label for="f-alt">Image description (for screen readers)</label><textarea class="textarea input" id="f-alt" name="alt_text" maxlength="600" style="min-height:80px">${esc(v.alt_text || "")}</textarea><span class="hint">One sentence on what the painting shows.</span></div>
        <label class="check"><input type="checkbox" name="featured" ${v.featured ? "checked" : ""}> Feature on the home page</label>
        <label class="check"><input type="checkbox" name="published" ${v.published ? "checked" : ""}> Published (visible on the site)</label>
        <div class="formbar"><button class="btn" type="submit">${w ? "Save changes" : "Add to site"}</button><a class="btn btn--ghost" href="#artworks">Cancel</a><span class="progress" data-progress role="status"></span></div>
      </div>
    </form>`;

  const form = main.querySelector("[data-form]");
  const drop = main.querySelector("[data-drop]");
  const fileIn = main.querySelector("[data-file]");
  const prog = main.querySelector("[data-progress]");
  let prepared = null;
  const setErr = (k, m) => {
    const el = main.querySelector(`[data-err-${k}]`);
    el.hidden = !m;
    el.textContent = m || "";
    const inp = form.elements[k];
    if (inp) m ? inp.setAttribute("aria-invalid", "true") : inp.removeAttribute("aria-invalid");
  };

  form.addEventListener("input", () => (dirty = true));
  form.category.addEventListener("change", () => (form.medium.placeholder = catMedium(form.category.value)));

  async function take(file) {
    if (!file) return;
    setErr("image", "");
    prog.textContent = "Preparing image…";
    try {
      prepared = await prepareImage(file);
      dirty = true;
      main.querySelector("[data-preview]").innerHTML = `<img src="${prepared.preview}" alt=""><p>${prepared.width} × ${prepared.height}px · ${Math.round((prepared.full.blob.size + prepared.thumb.blob.size) / 1024)} KB · click to replace</p>`;
      prog.textContent = "";
    } catch (err) {
      prepared = null;
      prog.textContent = "";
      setErr("image", err.message);
    }
  }
  fileIn.onchange = () => take(fileIn.files[0]);
  drop.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fileIn.click()));
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => (e.preventDefault(), drop.classList.add("over"))));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => (e.preventDefault(), take(e.dataTransfer.files[0])));
  const onPaste = (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith("image/"));
    if (f && document.body.contains(form)) take(f);
  };
  document.addEventListener("paste", onPaste);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    let ok = true;
    const title = d.title.trim();
    setErr("title", title ? "" : "Give the work a title.");
    ok &&= !!title;
    const year = d.year.trim() ? Number(d.year) : null;
    const yearBad = year !== null && !(Number.isInteger(year) && year >= 1900 && year <= 2200);
    setErr("year", yearBad ? "Use a 4-digit year." : "");
    const price = d.price.trim() ? Number(d.price.replace(/[$,\s]/g, "")) : null;
    const priceBad = price !== null && !(Number.isFinite(price) && price >= 0);
    setErr("price", priceBad ? "Use a number like 1200, or leave blank." : "");
    const buy = d.purchase_url.trim();
    const buyBad = buy && !/^https:\/\/\S+$/i.test(buy);
    setErr("purchase_url", buyBad ? "Must start with https://" : "");
    if (!w && !prepared) setErr("image", "Add a photo of the work.");
    ok = ok && !yearBad && !priceBad && !buyBad && (w || prepared);
    if (!ok) return form.querySelector('[aria-invalid="true"]')?.focus();

    const btn = form.querySelector("[type=submit]");
    btn.disabled = true;
    const row = {
      title,
      category: d.category,
      medium: d.medium.trim() || null,
      year,
      dimensions: d.dimensions.trim() || null,
      price,
      status: d.status,
      purchase_url: buy || null,
      video_url: (d.video_url || "").trim() || null,
      description: d.description.trim() || null,
      alt_text: d.alt_text.trim() || null,
      featured: !!d.featured,
      published: !!d.published,
    };
    let uploaded = null;
    try {
      if (prepared) {
        prog.textContent = "Uploading image…";
        uploaded = await uploadImage(prepared);
        Object.assign(row, uploaded);
      }
      prog.textContent = "Saving…";
      if (w) {
        const { error } = await sb.from("artworks").update(row).eq("id", w.id);
        if (error) throw error;
        if (uploaded && w.storage_path) await removeFolder(w.storage_path).catch(() => {});
      } else {
        row.sort_order = works.length ? Math.min(...works.map((x) => x.sort_order || 0)) - 10 : 10;
        const { error } = await sb.from("artworks").insert(row);
        if (error) throw error;
      }
      dirty = false;
      document.removeEventListener("paste", onPaste);
      toast(w ? `Saved "${title}"` : `Added "${title}" to the site`);
      works = [];
      location.hash = "#artworks";
    } catch (err) {
      if (uploaded && !w) await removeFolder(uploaded.storage_path).catch(() => {});
      if (uploaded && w) await removeFolder(uploaded.storage_path).catch(() => {});
      btn.disabled = false;
      prog.textContent = "";
      fail(err, "Couldn't save");
    }
  });
}

/* ---------------------------------------------------------------- inquiries */
let inqFilter = "new";
async function inquiriesView(main) {
  let q = sb.from("inquiries").select("*").order("created_at", { ascending: false }).limit(200);
  if (inqFilter === "new") q = q.eq("status", "new");
  else if (inqFilter === "archived") q = q.eq("status", "archived");
  const [{ data, error }] = await Promise.all([q, works.length ? null : loadWorks()]);
  if (error) throw error;
  const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const kinds = { purchase: "Purchase", commission: "Commission", general: "General" };
  main.innerHTML = `
    <div class="main__head"><div><p class="eyebrow">Studio</p><h1>Inquiries</h1></div></div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Filter">${[["new", "New"], ["all", "All"], ["archived", "Archived"]].map(([id, l]) => `<button type="button" data-f="${id}" aria-pressed="${id === inqFilter}">${l}</button>`).join("")}</div></div>
    <div class="list">${
      (data || []).length
        ? data
            .map((m) => {
              const w = works.find((x) => x.id === m.artwork_id);
              const subject = encodeURIComponent(`Re: ${w ? w.title : "your message"}`);
              return `
        <article class="inq ${m.status === "new" ? "inq--new" : ""}" data-id="${m.id}">
          <div class="inq__head"><div><span class="inq__name">${esc(m.name)}</span> · <a href="mailto:${esc(m.email)}?subject=${subject}">${esc(m.email)}</a></div><span class="muted" style="font-size:var(--step--1)">${esc(kinds[m.kind] || m.kind)} · ${fmt.format(new Date(m.created_at))}</span></div>
          ${w ? `<a class="inq__work" href="${workPath(w)}" target="_blank" rel="noopener"><img src="${esc(safeUrl(w.thumb_url || w.image_url))}" alt="">${esc(w.title)}</a>` : ""}
          ${m.message ? `<div class="inq__msg">${esc(m.message)}</div>` : ""}
          <div class="inq__actions">
            <label class="visually-hidden" for="st-${m.id}">Status</label>
            <select class="select input" id="st-${m.id}" data-status>${["new", "replied", "archived"].map((s) => `<option value="${s}" ${s === m.status ? "selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}</select>
            <a class="btn btn--small" href="mailto:${esc(m.email)}?subject=${subject}">Reply by email</a>
            <button class="btn btn--danger btn--small" data-del>Delete</button>
          </div>
        </article>`;
            })
            .join("")
        : `<div class="empty-state">${inqFilter === "new" ? "No new inquiries. When someone writes from the site, it appears here." : "Nothing here yet."}</div>`
    }</div>`;
  main.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => ((inqFilter = b.dataset.f), inquiriesView(main))));
  main.querySelectorAll(".inq").forEach((el) => {
    const id = el.dataset.id;
    el.querySelector("[data-status]").onchange = async (e) => {
      const { error } = await sb.from("inquiries").update({ status: e.target.value }).eq("id", id);
      if (error) return fail(error, "Couldn't update");
      el.classList.toggle("inq--new", e.target.value === "new");
      toast(`Marked ${e.target.value}`);
      refreshBadge();
    };
    el.querySelector("[data-del]").onclick = async () => {
      if (!(await confirmDialog("Delete this inquiry?", "It will be permanently removed."))) return;
      const { error } = await sb.from("inquiries").delete().eq("id", id);
      if (error) return fail(error, "Couldn't delete");
      el.remove();
      refreshBadge();
    };
  });
}

/* --------------------------------------------------------------------- site */
async function siteView(main) {
  const [{ data, error }] = await Promise.all([sb.from("site_settings").select("*").eq("id", 1).maybeSingle(), loadWorks()]);
  if (error) throw error;
  const s = data || {};
  main.innerHTML = `
    <div class="main__head"><div><p class="eyebrow">Studio</p><h1>Site text</h1></div><a class="btn btn--ghost btn--small" href="/" target="_blank" rel="noopener">Preview site ↗</a></div>
    <form class="panel" data-site novalidate>
      <div class="field"><label for="s-tag">Tagline</label><textarea class="textarea input" id="s-tag" name="tagline" maxlength="300" style="min-height:80px" placeholder="${esc(DEFAULT_SETTINGS.tagline)}">${esc(s.tagline || "")}</textarea><span class="hint">Shown under the headline on the home page.</span></div>
      <div class="field"><label for="s-about">About</label><textarea class="textarea input" id="s-about" name="about" maxlength="6000" style="min-height:220px" placeholder="${esc(DEFAULT_SETTINGS.about)}">${esc(s.about || "")}</textarea><span class="hint">Leave a blank line between paragraphs. Leave empty to use the default text.</span></div>
      <div class="grid2">
        <div class="field"><label for="s-email">Public contact email</label><input class="input" id="s-email" name="contact_email" type="email" maxlength="320" value="${esc(s.contact_email || "")}" placeholder="${esc(DEFAULT_SETTINGS.contact_email)}"><span class="hint">Shown next to forms.</span></div>
        <div class="field"><label for="s-phone">Public phone</label><input class="input" id="s-phone" name="contact_phone" type="tel" maxlength="40" value="${esc(s.contact_phone || "")}" placeholder="${esc(DEFAULT_SETTINGS.contact_phone)}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="s-range">Price range line</label><input class="input" id="s-range" name="price_range" maxlength="120" value="${esc(s.price_range || "")}" placeholder="${esc(DEFAULT_SETTINGS.price_range)}"></div>
        <div class="field"><label for="s-ig">Instagram handle</label><input class="input" id="s-ig" name="instagram" maxlength="60" value="${esc(s.instagram || "stevensosmoore")}"></div>
      </div>
      <div class="field"><label for="s-hero">Home page hero painting</label><select class="select input" id="s-hero" name="hero_artwork_id"><option value="">Automatic (first featured work)</option>${works.map((w) => `<option value="${w.id}" ${String(w.id) === String(s.hero_artwork_id) ? "selected" : ""}>${esc(w.title)}</option>`).join("")}</select></div>
      <div class="formbar"><button class="btn" type="submit">Save</button></div>
    </form>`;
  const f = main.querySelector("[data-site]");
  f.addEventListener("input", () => (dirty = true));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (d.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.contact_email)) return toast("That email doesn't look right.", "error");
    const row = {
      tagline: d.tagline.trim() || null,
      about: d.about.trim() || null,
      contact_email: d.contact_email.trim() || null,
      contact_phone: d.contact_phone.trim() || null,
      price_range: d.price_range.trim() || null,
      instagram: d.instagram.trim().replace(/^@/, "") || "stevensosmoore",
      hero_artwork_id: d.hero_artwork_id ? Number(d.hero_artwork_id) : null,
    };
    const { error } = await sb.from("site_settings").update(row).eq("id", 1);
    if (error) return fail(error, "Couldn't save");
    dirty = false;
    toast("Site text saved — refresh the site to see it.");
  });
}

/* ------------------------------------------------------------------ account */
function accountView(main) {
  main.innerHTML = `
    <div class="main__head"><div><p class="eyebrow">Studio</p><h1>Account</h1></div></div>
    <form class="panel" data-pw novalidate>
      <p>Signed in as <b>${esc(user.email)}</b></p>
      <div class="grid2">
        <div class="field"><label for="a-pw">New password</label><input class="input" id="a-pw" name="pw" type="password" minlength="8" autocomplete="new-password"></div>
        <div class="field"><label for="a-pw2">Repeat new password</label><input class="input" id="a-pw2" name="pw2" type="password" autocomplete="new-password"></div>
      </div>
      <div class="formbar"><button class="btn" type="submit">Change password</button><button class="btn btn--ghost" type="button" data-out>Sign out</button></div>
    </form>`;
  const f = main.querySelector("[data-pw]");
  main.querySelector("[data-out]").onclick = () => sb.auth.signOut();
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (f.pw.value.length < 8) return toast("Use at least 8 characters.", "error");
    if (f.pw.value !== f.pw2.value) return toast("The passwords don't match.", "error");
    const { error } = await sb.auth.updateUser({ password: f.pw.value });
    if (error) return fail(error, "Couldn't change password");
    f.reset();
    toast("Password changed.");
  });
}

boot();
