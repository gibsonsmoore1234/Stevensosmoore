// App shell: sign-in (email/phone code) → security PIN → two tabs.

import * as data from "./data.js";
import { initMap, onShow as onMapShow, resetView, refresh as refreshMap, escapeHtml as esc } from "./map.js";
import { initHub, show as showHub } from "./hub.js";

const $ = (s) => document.querySelector(s);
let mapReady = false, started = false;

if (data.mode === "demo") $("#demo-banner").hidden = false;

async function boot() {
  const session = await data.getSession();
  if (!session) return screen("signin");
  const p = await data.getMyProfile();
  if (!p?.has_pin) return screen("setpin");
  if (!data.isUnlocked()) return screen("unlock");
  screen("app");
  if (started) return;
  started = true;
  initHub($("#tab-hub"));
  tab(location.hash === "#hub" ? "hub" : "map");
  updateBadge();
}

function screen(name) {
  document.querySelectorAll("[data-screen]").forEach((s) => (s.hidden = s.dataset.screen !== name));
  const first = document.querySelector(`[data-screen="${name}"] input`);
  first?.focus();
}

function formError(form, msg) {
  const e = form.querySelector(".err");
  e.textContent = msg;
  e.hidden = !msg;
}

// --- Sign in -----------------------------------------------------------------
let contact = "";
$("#signin-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  contact = f.contact.value.trim();
  try {
    await data.sendCode(contact);
    $("#code-to").textContent = contact;
    f.hidden = true;
    $("#code-form").hidden = false;
    $("#code-form").code.focus();
  } catch (ex) { formError(f, ex.message); }
};
$("#code-form").onsubmit = async (e) => {
  e.preventDefault();
  try { await data.verifyCode(contact, e.target.code.value.trim()); boot(); }
  catch (ex) { formError(e.target, ex.message); }
};
$("#code-back").onclick = () => { $("#code-form").hidden = true; $("#signin-form").hidden = false; };

// --- PIN ---------------------------------------------------------------------
$("#setpin-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.pin.value !== f.confirm.value) return formError(f, "PINs don't match");
  try { await data.setPin(f.pin.value); await data.checkPin(f.pin.value); boot(); }
  catch (ex) { formError(f, ex.message); }
};
$("#unlock-form").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    if (await data.checkPin(f.pin.value)) boot();
    else { f.pin.value = ""; formError(f, "Incorrect PIN"); }
  } catch (ex) { formError(f, ex.message); }
};
document.querySelectorAll("[data-signout]").forEach((b) => b.onclick = async () => { await data.signOut(); location.hash = ""; location.reload(); });

// --- Tabs --------------------------------------------------------------------
document.querySelectorAll("[data-tab]").forEach((b) => b.onclick = () => tab(b.dataset.tab));

async function tab(name) {
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === name));
  $("#tab-map").hidden = name !== "map";
  $("#tab-hub").hidden = name !== "hub";
  history.replaceState(null, "", name === "hub" ? "#hub" : "#map");
  if (name === "map" && mapReady) onMapShow();
  else if (name === "map") {
    mapReady = true;
    try { await initMap($("#map"), { onSelect: openDrawer }); }
    catch (ex) { $("#map").innerHTML = `<p class="err center">Map failed to load: ${esc(ex.message)}</p>`; }
  }
  if (name === "hub") showHub();
}
$("#reset-view").onclick = () => resetView();
$("#open-profile").onclick = () => { tab("hub"); showHub("profile"); };
$("#open-matches").onclick = () => { tab("hub"); showHub("chat"); };

async function updateBadge() {
  const n = (await data.myMatches()).length;
  $("#match-dot").hidden = !n;
}
document.addEventListener("crush:matches", updateBadge);

// --- Bubble drawer -----------------------------------------------------------
async function openDrawer(b) {
  const d = $("#drawer");
  d.hidden = false;
  d.innerHTML = `<p class="muted">Loading…</p>`;
  const [ids, me] = await Promise.all([data.myBubbleIds(), data.getMyProfile()]);
  const joined = ids.includes(b.id);
  const members = me.verification === "verified" ? await data.bubbleMembers(b.id) : [];
  d.innerHTML = `
    <button class="close" aria-label="Close">×</button>
    <h2>${esc(b.name)}</h2>
    <div class="stats"><div><b>${b.members}</b><small>members</small></div><div><b>${b.county_fips}</b><small>county FIPS</small></div>
      <div><b>${new Date(b.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</b><small>created</small></div></div>
    <div class="row">
      <button class="btn ${joined ? "" : "primary"}" data-join>${joined ? "Leave" : "Join community"}</button>
      ${joined ? `<button class="btn ghost" data-board>Open board</button>` : ""}
    </div>
    <p class="err" hidden></p>
    <h3>Members</h3>
    ${me.verification === "verified"
      ? `<div class="people">${members.map((m) => `<div class="person"><div class="avatar">${esc((m.display_name || "?")[0])}</div>
          <div><strong>${esc(m.display_name || "Member")}</strong><small>${esc(m.hobbies || "")}</small></div></div>`).join("") || `<p class="muted">No members yet.</p>`}</div>`
      : `<p class="muted">Verify your identity in the Hub to see member profiles.</p>`}`;
  d.querySelector(".close").onclick = () => (d.hidden = true);
  d.querySelector("[data-join]").onclick = async () => {
    try {
      joined ? await data.leaveBubble(b.id) : await data.joinBubble(b.id);
      await refreshMap();
      openDrawer({ ...b, members: b.members + (joined ? -1 : 1) });
    } catch (ex) { Object.assign(d.querySelector(".err"), { textContent: ex.message, hidden: false }); }
  };
  d.querySelector("[data-board]")?.addEventListener("click", () => { d.hidden = true; tab("hub"); showHub("forums"); });
}

boot();
