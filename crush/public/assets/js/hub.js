// Tab 2 — Hub: verification & profile, crush picks, mutual-only chat, forums.

import * as data from "./data.js";
import { openCamera, captureLive, prepPhoto } from "./verify.js";
import { escapeHtml as esc } from "./map.js";

const $ = (sel, root = document) => root.querySelector(sel);
let root, section = "profile", stopCamera = null, stopChat = null;

export function initHub(el) {
  root = el;
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-section]");
    if (b) show(b.dataset.section);
  });
}

export async function show(name = section) {
  section = name;
  stopCamera?.(); stopCamera = null;
  stopChat?.(); stopChat = null;
  root.querySelectorAll("[data-section]").forEach((b) => b.classList.toggle("active", b.dataset.section === name));
  const body = $("#hub-body", root);
  body.onclick = null;
  body.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    await { profile: renderProfile, crushes: renderCrushes, chat: renderChat, forums: renderForums }[name](body);
  } catch (ex) {
    body.innerHTML = `<p class="err">${esc(ex.message)}</p>`;
  }
}

const card = (title, inner, extra = "") => `<section class="card ${extra}"><h2>${title}</h2>${inner}</section>`;
const gate = (p) => p.verification === "verified" ? "" :
  `<div class="notice">Finish identity verification in <button class="link" data-section="profile">Profile</button> to use this.</div>`;

// ---------------------------------------------------------------------------
// Module A — Profile & verification
// ---------------------------------------------------------------------------
async function renderProfile(body) {
  const p = await data.getMyProfile();
  const photos = await Promise.all([0, 1].map((i) => data.imageUrl("photos", p.photo_paths[i])));
  const selfies = await Promise.all([0, 1].map((i) => data.imageUrl("selfies", p.selfie_paths[i])));
  const status = { unverified: "Not verified", pending: "Under review", verified: "Verified", rejected: "Not approved — retake selfies" }[p.verification];

  body.innerHTML =
    card("Profile", `
      <form id="profile-form" class="stack">
        <label>Name<input name="display_name" maxlength="60" required value="${esc(p.display_name)}"></label>
        <label>School or area<input name="area" maxlength="80" value="${esc(p.area)}"></label>
        <label>Hobbies<textarea name="hobbies" maxlength="280" rows="2">${esc(p.hobbies)}</textarea></label>
        <div class="photo-row">${[0, 1].map((i) => `
          <label class="photo-slot">${photos[i] ? `<img src="${esc(photos[i])}" alt="">` : `<span>+ Photo ${i + 1}${i ? " (optional)" : ""}</span>`}
            <input type="file" accept="image/*" data-photo="${i}" hidden></label>`).join("")}</div>
        <button class="btn primary">Save profile</button><span class="saved muted" hidden>Saved</span>
      </form>`) +
    card(`Identity verification <span class="tag tag-${p.verification}">${status}</span>`, `
      <p class="muted">Take two live selfies — straight on, then from the side. We check they're live and compare them with your profile photos. Selfies are private and never shown on your profile.</p>
      <div class="selfie-grid">${["Front", "Side"].map((label, i) => `
        <div class="selfie-slot">${selfies[i] ? `<img src="${esc(selfies[i])}" alt="${label} selfie">` : `<span>${label} angle</span>`}</div>`).join("")}</div>
      <div id="cam" hidden>
        <video playsinline muted></video>
        <div class="cam-guide"></div>
        <div class="progress"><i></i></div>
        <p class="cam-hint"></p>
        <div class="row"><button type="button" class="btn ghost" data-cam-cancel>Cancel</button><button type="button" class="btn primary" data-cam-shoot>Capture</button></div>
      </div>
      <p class="err" id="verify-err" hidden></p>
      ${p.verification === "verified" ? "" : `<button class="btn primary" id="start-verify" ${p.verification === "pending" ? "disabled" : ""}>
        ${p.verification === "pending" ? "Waiting for review" : "Start live capture"}</button>`}`) +
    card("Security PIN", `
      <form id="pin-form" class="stack narrow">
        ${p.has_pin ? `<label>Current PIN<input name="current" inputmode="numeric" pattern="\\d{4,6}" maxlength="6" required autocomplete="off"></label>` : ""}
        <label>New PIN (4–6 digits)<input name="pin" inputmode="numeric" pattern="\\d{4,6}" maxlength="6" required autocomplete="off"></label>
        <button class="btn">Change PIN</button><span class="saved muted" hidden>PIN updated</span>
        <p class="err" hidden></p>
      </form>`);

  const form = $("#profile-form", body);
  form.onsubmit = async (e) => {
    e.preventDefault();
    await data.saveProfile({ display_name: form.display_name.value.trim(), area: form.area.value.trim(), hobbies: form.hobbies.value.trim() });
    flash($(".saved", form));
  };
  form.querySelectorAll("[data-photo]").forEach((inp) => inp.onchange = async () => {
    if (!inp.files[0]) return;
    const i = +inp.dataset.photo;
    const path = await data.uploadImage("photos", i, await prepPhoto(inp.files[0]));
    const paths = [...p.photo_paths]; paths[i] = path;
    await data.saveProfile({ photo_paths: paths.filter(Boolean).slice(0, 2) });
    show("profile");
  });

  const pinForm = $("#pin-form", body);
  pinForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await data.setPin(pinForm.pin.value, pinForm.current?.value || null);
      pinForm.reset(); $(".err", pinForm).hidden = true; flash($(".saved", pinForm));
    } catch (ex) { Object.assign($(".err", pinForm), { textContent: ex.message, hidden: false }); }
  };

  $("#start-verify", body)?.addEventListener("click", () => runCapture(body, p));
}

async function runCapture(body, p) {
  const cam = $("#cam", body), video = $("video", cam), hint = $(".cam-hint", cam), bar = $(".progress i", cam);
  const err = $("#verify-err", body), start = $("#start-verify", body);
  if (!p.photo_paths.length) return Object.assign(err, { textContent: "Add at least one profile photo first — we compare your selfies against it.", hidden: false });
  err.hidden = true; start.hidden = true; cam.hidden = false;
  try { stopCamera = await openCamera(video); } catch (ex) {
    cam.hidden = true; start.hidden = false;
    return Object.assign(err, { textContent: ex.name === "NotAllowedError" ? "Camera access was blocked. Allow it in your browser settings." : ex.message, hidden: false });
  }
  const shots = [];
  const steps = [["front", "Look straight at the camera, blink naturally, then tap Capture."], ["side", "Now turn your head to show your side profile, then tap Capture."]];
  const prompt = () => { hint.textContent = steps[shots.length][1]; cam.dataset.angle = steps[shots.length][0]; bar.style.width = "0"; };
  prompt();

  $("[data-cam-cancel]", cam).onclick = () => show("profile");
  const shoot = $("[data-cam-shoot]", cam);
  shoot.onclick = async () => {
    shoot.disabled = true; err.hidden = true;
    try {
      const { blob } = await captureLive(video, (t) => bar.style.width = `${Math.min(100, t * 100)}%`);
      shots.push(blob);
      if (shots.length < 2) { prompt(); return; }
      hint.textContent = "Uploading securely…";
      const paths = [];
      for (let i = 0; i < 2; i++) paths.push(await data.uploadImage("selfies", i, shots[i]));
      await data.saveProfile({ selfie_paths: paths });
      await data.submitVerification();
      show("profile");
    } catch (ex) {
      Object.assign(err, { textContent: ex.message, hidden: false });
    } finally { shoot.disabled = false; }
  };
}

function flash(el) { el.hidden = false; setTimeout(() => el.hidden = true, 1800); }

// ---------------------------------------------------------------------------
// Module B — Confidential crush selection
// ---------------------------------------------------------------------------
async function renderCrushes(body) {
  const [p, round, bubbleIds] = await Promise.all([data.getMyProfile(), data.currentRound(), data.myBubbleIds()]);
  if (!round) { body.innerHTML = card("Crush rounds", `<p class="muted">No round is scheduled yet.</p>`); return; }

  const now = Date.now();
  const open = !round.revealed && now >= Date.parse(round.opens_at) && now <= Date.parse(round.closes_at);
  const picks = await data.myPicks(round.id);
  const fmt = (d) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

  body.innerHTML = gate(p) + card(`${esc(round.name)} <span class="tag ${open ? "tag-verified" : ""}">${round.revealed ? "Revealed" : open ? "Open" : "Closed"}</span>`, `
    <p class="lede">Reveal: <strong>${fmt(round.reveal_at)}</strong></p>
    <ul class="rules">
      <li>Your picks are sealed. Nobody is notified, and they are never counted or shown.</li>
      <li>At the reveal, you match only if you picked each other this round.</li>
      <li>A match opens a private chat. Everything else stays sealed for good.</li>
    </ul>
    ${p.verification === "verified" && open ? `
      ${bubbleIds.length ? `<input id="people-q" type="search" placeholder="Search people in your communities…" autocomplete="off">` :
        `<div class="notice">Join a community on the Map to find people.</div>`}
      <div id="people" class="people"></div>
      <h3>Your sealed picks <span class="muted">(only you can see these)</span></h3>
      <div id="my-picks" class="people"></div>` : ""}
    ${data.mode === "demo" && !round.revealed ? `<button class="btn ghost" id="demo-reveal">Demo: run reveal now</button>` : ""}
  `);

  const person = (u, picked) => `
    <div class="person"><div class="avatar">${esc((u.display_name || "?")[0])}</div>
      <div><strong>${esc(u.display_name)}</strong><small>${esc(u.area || "")}</small></div>
      <button class="btn ${picked ? "" : "primary"}" data-pick="${esc(u.id)}" data-on="${picked ? 1 : 0}">${picked ? "Remove" : "Pick"}</button></div>`;

  const peopleBox = $("#people", body), picksBox = $("#my-picks", body), q = $("#people-q", body);
  let cache = new Map();
  const refresh = async () => {
    if (!peopleBox) return;
    const found = await data.searchPeople(q?.value || "", bubbleIds);
    found.forEach((u) => cache.set(u.id, u));
    const current = await data.myPicks(round.id);
    peopleBox.innerHTML = found.map((u) => person(u, current.includes(u.id))).join("") || `<p class="muted">No one found.</p>`;
    picksBox.innerHTML = current.map((id) => person(cache.get(id) || { id, display_name: "Someone" }, true)).join("") || `<p class="muted">None yet.</p>`;
  };
  if (picks.length) (await data.searchPeople("", bubbleIds)).forEach((u) => cache.set(u.id, u));
  q?.addEventListener("input", debounce(refresh, 250));
  body.onclick = async (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    b.disabled = true;
    try { b.dataset.on === "1" ? await data.unpick(round.id, b.dataset.pick) : await data.pick(round.id, b.dataset.pick); }
    catch (ex) { alert(ex.message); }
    refresh();
  };
  $("#demo-reveal", body)?.addEventListener("click", () => { data.demoRevealNow(); document.dispatchEvent(new CustomEvent("crush:matches")); show("chat"); });
  refresh();
}

// ---------------------------------------------------------------------------
// Module C — Mutual-only messaging
// ---------------------------------------------------------------------------
async function renderChat(body, openId = null) {
  const matches = await data.myMatches();
  if (!matches.length) {
    body.innerHTML = card("Messages", `<p class="muted">Messaging is closed until a mutual reveal. When you and someone pick each other in the same round, a private chat opens here for both of you.</p>`);
    return;
  }
  const active = matches.find((m) => m.id === openId) || matches[0];
  body.innerHTML = `<div class="chat">
    <aside>${matches.map((m) => `<button class="thread-item ${m.id === active.id ? "active" : ""}" data-match="${esc(m.id)}">
      <div class="avatar">${esc((m.other.display_name || "?")[0])}</div><span>${esc(m.other.display_name)}</span></button>`).join("")}</aside>
    <div class="chat-main">
      <header><strong>${esc(active.other.display_name)}</strong><small class="muted">Matched ${new Date(active.created_at).toLocaleDateString()}</small></header>
      <div class="msgs" id="msgs"></div>
      <form id="send" class="send"><input name="body" maxlength="2000" placeholder="Message…" autocomplete="off" required><button class="btn primary">Send</button></form>
    </div></div>`;

  const me = await data.myId();
  const box = $("#msgs", body);
  const add = (m) => {
    if (box.querySelector(`[data-id="${m.id}"]`)) return;
    box.insertAdjacentHTML("beforeend", `<div class="msg ${m.sender_id === me ? "mine" : ""}" data-id="${esc(m.id)}">${esc(m.body)}</div>`);
    box.scrollTop = box.scrollHeight;
  };
  (await data.listMessages(active.id)).forEach(add);
  stopChat = data.subscribeMessages(active.id, add);

  body.querySelectorAll("[data-match]").forEach((b) => b.onclick = () => { stopChat?.(); renderChat(body, b.dataset.match); });
  const f = $("#send", body);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const text = f.body.value.trim();
    if (!text) return;
    f.body.value = "";
    await data.sendMessage(active.id, text);
    if (data.mode === "demo") (await data.listMessages(active.id)).forEach(add);
  };
}

// ---------------------------------------------------------------------------
// Module D — Community forums
// ---------------------------------------------------------------------------
let forumState = { bubble: null, topic: "" };

async function renderForums(body) {
  const [p, ids, bubbles] = await Promise.all([data.getMyProfile(), data.myBubbleIds(), data.listBubbles()]);
  const mine = bubbles.filter((b) => ids.includes(b.id));
  if (p.verification !== "verified" || !mine.length) {
    body.innerHTML = gate(p) + card("Community forums", `<p class="muted">Boards belong to communities on the Map. Join or create a bubble there to read and post.</p>`);
    return;
  }
  if (!mine.some((b) => b.id === forumState.bubble)) forumState.bubble = mine[0].id;

  body.innerHTML = `
    <div class="forum-bar">
      <select id="board">${mine.map((b) => `<option value="${esc(b.id)}" ${b.id === forumState.bubble ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>
      <div class="chips"><button class="chip ${!forumState.topic ? "active" : ""}" data-topic="">All</button>
        ${Object.entries(data.TOPICS).map(([k, v]) => `<button class="chip ${forumState.topic === k ? "active" : ""}" data-topic="${k}">${v}</button>`).join("")}</div>
    </div>
    ${card("New post", `
      <form id="new-thread" class="stack">
        <div class="row"><select name="topic">${Object.entries(data.TOPICS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
          <input name="title" required minlength="3" maxlength="140" placeholder="Title"></div>
        <textarea name="body" rows="3" maxlength="5000" placeholder="What's on your mind?"></textarea>
        <details><summary>Add a poll</summary><textarea name="poll" rows="3" placeholder="One option per line (2–6)"></textarea></details>
        <div class="row"><label class="toggle"><input type="checkbox" name="anonymous"><span></span>Post anonymously</label><button class="btn primary">Post</button></div>
        <p class="err" hidden></p>
      </form>`)}
    <div id="threads"></div>`;

  $("#board", body).onchange = (e) => { forumState.bubble = e.target.value; renderForums(body); };
  body.querySelectorAll("[data-topic]").forEach((c) => c.onclick = () => { forumState.topic = c.dataset.topic; renderForums(body); });

  const f = $("#new-thread", body);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const opts = f.poll.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const err = $(".err", f);
    if (opts.length && (opts.length < 2 || opts.length > 6)) return Object.assign(err, { textContent: "Polls need 2–6 options", hidden: false });
    try {
      await data.createThread({ bubble_id: forumState.bubble, topic: f.topic.value, title: f.title.value.trim(), body: f.body.value.trim(), anonymous: f.anonymous.checked, poll_options: opts.length ? opts : null });
      renderForums(body);
    } catch (ex) { Object.assign(err, { textContent: ex.message, hidden: false }); }
  };

  const threads = await data.listThreads(forumState.bubble, forumState.topic);
  $("#threads", body).innerHTML = threads.map((t) => {
    const total = (t.poll_counts || []).reduce((a, b) => a + b, 0);
    return `<article class="card thread" data-thread="${esc(t.id)}">
      <div class="meta"><span class="tag">${esc(data.TOPICS[t.topic])}</span> ${esc(t.author_name)} · ${new Date(t.created_at).toLocaleDateString()}</div>
      <h3>${esc(t.title)}</h3>${t.body ? `<p>${esc(t.body)}</p>` : ""}
      ${t.poll_options ? `<div class="poll">${t.poll_options.map((o, i) => {
        const pct = total ? Math.round((t.poll_counts[i] / total) * 100) : 0;
        return `<button class="poll-opt" data-vote="${i}"><i style="width:${pct}%"></i><span>${esc(o)}</span><b>${pct}%</b></button>`;
      }).join("")}<small class="muted">${total} vote${total === 1 ? "" : "s"}</small></div>` : ""}
      <button class="link" data-open>${t.replies} repl${t.replies === 1 ? "y" : "ies"}</button>
      <div class="replies" hidden></div>
    </article>`;
  }).join("") || `<p class="muted center">No posts yet. Start the conversation.</p>`;

  $("#threads", body).onclick = async (e) => {
    const art = e.target.closest("[data-thread]");
    if (!art) return;
    const id = art.dataset.thread;
    const v = e.target.closest("[data-vote]");
    if (v) { try { await data.vote(id, +v.dataset.vote); renderForums(body); } catch (ex) { alert(ex.message); } return; }
    if (e.target.closest("[data-open]")) openReplies(art, id);
  };
}

async function openReplies(art, id) {
  const box = $(".replies", art);
  box.hidden = !box.hidden;
  if (box.hidden) return;
  const posts = await data.listPosts(id);
  box.innerHTML = posts.map((x) => `<div class="reply"><small>${esc(x.author_name)}</small><p>${esc(x.body)}</p></div>`).join("") + `
    <form class="send"><input name="body" required maxlength="5000" placeholder="Reply…"><label class="toggle small"><input type="checkbox" name="anonymous"><span></span>Anon</label><button class="btn">Reply</button></form>`;
  const f = $("form", box);
  f.onsubmit = async (e) => {
    e.preventDefault();
    await data.reply(id, f.body.value.trim(), f.anonymous.checked);
    box.hidden = true; openReplies(art, id);
  };
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
