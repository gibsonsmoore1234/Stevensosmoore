// Data layer. Talks to Supabase when public/env.js has a URL + anon key;
// otherwise runs a local DEMO backend in localStorage so the app can be
// previewed with no setup. All privacy rules live in supabase/schema.sql —
// the demo only imitates them for one browser.

const ENV = window.__ENV__ || {};
const sb = ENV.SUPABASE_URL && ENV.SUPABASE_ANON_KEY && window.supabase
  ? window.supabase.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

export const mode = sb ? "supabase" : "demo";
export const TOPICS = { campus: "Campus life", dating: "Dating culture", events: "Events", qa: "Q&A", lifestyle: "Lifestyle" };

const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
const uid = async () => (await getSession())?.user.id;

// ---------------------------------------------------------------------------
// Auth & PIN
// ---------------------------------------------------------------------------
const isPhone = (c) => /^\+?[\d\s().-]{7,}$/.test(c) && !c.includes("@");
const normPhone = (c) => "+" + c.replace(/\D/g, "").replace(/^(?=\d{10}$)/, "1");

export async function getSession() {
  if (!sb) return demo.get("session");
  return (await sb.auth.getSession()).data.session;
}

export async function sendCode(contact) {
  if (!sb) return demo.set("pendingContact", contact);
  must(await sb.auth.signInWithOtp(isPhone(contact) ? { phone: normPhone(contact) } : { email: contact }));
}

export async function verifyCode(contact, token) {
  if (!sb) {
    if (!/^\d{6}$/.test(token)) throw new Error("Enter the 6-digit code (demo: any 6 digits)");
    demo.set("session", { user: { id: "me", contact } });
    return;
  }
  must(await sb.auth.verifyOtp(isPhone(contact) ? { phone: normPhone(contact), token, type: "sms" } : { email: contact, token, type: "email" }));
  const id = await uid();
  await sb.from("profiles").upsert({ id }, { onConflict: "id", ignoreDuplicates: true });
}

export async function signOut() {
  sessionStorage.removeItem("crush.unlocked");
  if (!sb) return demo.set("session", null);
  await sb.auth.signOut();
}

export async function setPin(pin, current = null) {
  if (!/^\d{4,6}$/.test(pin)) throw new Error("PIN must be 4–6 digits");
  if (!sb) {
    const p = demo.profile();
    if (p.pin && p.pin !== current) throw new Error("Current PIN is incorrect");
    return demo.saveProfile({ pin });
  }
  must(await sb.rpc("set_pin", { new_pin: pin, current_pin: current }));
}

export async function checkPin(pin) {
  const ok = sb ? must(await sb.rpc("check_pin", { pin })) : demo.profile().pin === pin;
  if (ok) sessionStorage.setItem("crush.unlocked", "1");
  return ok;
}
export const isUnlocked = () => sessionStorage.getItem("crush.unlocked") === "1";

// ---------------------------------------------------------------------------
// Profile & verification
// ---------------------------------------------------------------------------
export async function getMyProfile() {
  if (!sb) { const p = demo.profile(); return { ...p, has_pin: !!p.pin }; }
  const p = must(await sb.from("profiles").select("id,display_name,area,hobbies,photo_paths,selfie_paths,verification,pin_hash").eq("id", await uid()).maybeSingle());
  if (!p) return null;
  const { pin_hash, ...rest } = p;
  return { ...rest, has_pin: !!pin_hash };
}

export async function saveProfile(fields) {
  if (!sb) return demo.saveProfile(fields);
  must(await sb.from("profiles").update(fields).eq("id", await uid()));
}

// kind: "photos" | "selfies"; returns a storage path (or data URL in demo)
export async function uploadImage(kind, index, blob) {
  if (!sb) return await blobToDataUrl(blob);
  const path = `${await uid()}/${kind}-${index}-${Date.now()}.jpg`;
  must(await sb.storage.from(kind).upload(path, blob, { contentType: "image/jpeg", upsert: true }));
  return path;
}

export async function imageUrl(kind, path) {
  if (!path) return "";
  if (!sb || path.startsWith("data:")) return path;
  return must(await sb.storage.from(kind).createSignedUrl(path, 3600)).signedUrl;
}

export async function submitVerification() {
  if (!sb) {
    // Demo has no reviewer: auto-approve so the rest of the app can be tried.
    demo.saveProfile({ verification: "verified" });
    return "verified";
  }
  must(await sb.rpc("submit_verification"));
  return "pending";
}

// ---------------------------------------------------------------------------
// Map bubbles
// ---------------------------------------------------------------------------
export async function listBubbles() {
  if (!sb) return demo.all("bubbles").map((b) => ({ ...b, members: demo.all("memberships").filter((m) => m.bubble_id === b.id).length }));
  return must(await sb.from("bubble_stats").select("*"));
}

export async function createBubble({ name, lat, lng, county_fips }) {
  if (!sb) {
    if (demo.profile().verification !== "verified") throw new Error("Verify your identity in the Hub before placing a bubble");
    const b = { id: crypto.randomUUID(), name, lat, lng, county_fips, created_at: new Date().toISOString() };
    demo.push("bubbles", b);
    demo.push("memberships", { bubble_id: b.id, user_id: "me" });
    return b;
  }
  const b = must(await sb.from("bubbles").insert({ name, lat, lng, county_fips }).select().single());
  await sb.from("memberships").insert({ bubble_id: b.id });
  return b;
}

export async function myBubbleIds() {
  if (!sb) return demo.all("memberships").filter((m) => m.user_id === "me").map((m) => m.bubble_id);
  return must(await sb.from("memberships").select("bubble_id").eq("user_id", await uid())).map((r) => r.bubble_id);
}

export async function joinBubble(id) {
  if (!sb) {
    if (demo.profile().verification !== "verified") throw new Error("Verify your identity in the Hub first");
    if (!demo.all("memberships").some((m) => m.bubble_id === id && m.user_id === "me")) demo.push("memberships", { bubble_id: id, user_id: "me" });
    return;
  }
  must(await sb.from("memberships").insert({ bubble_id: id }));
}

export async function leaveBubble(id) {
  if (!sb) return demo.replace("memberships", demo.all("memberships").filter((m) => !(m.bubble_id === id && m.user_id === "me")));
  must(await sb.from("memberships").delete().eq("bubble_id", id).eq("user_id", await uid()));
}

export async function bubbleMembers(id) {
  if (!sb) {
    const ids = demo.all("memberships").filter((m) => m.bubble_id === id).map((m) => m.user_id);
    return demo.people().filter((p) => ids.includes(p.id));
  }
  const ids = must(await sb.from("memberships").select("user_id").eq("bubble_id", id)).map((r) => r.user_id);
  if (!ids.length) return [];
  return must(await sb.from("public_profiles").select("*").in("id", ids));
}

// ---------------------------------------------------------------------------
// Crush rounds
// ---------------------------------------------------------------------------
export async function currentRound() {
  if (!sb) return demo.round();
  const now = new Date().toISOString();
  const rows = must(await sb.from("rounds").select("*").gte("reveal_at", new Date(Date.now() - 7 * 864e5).toISOString()).order("reveal_at").limit(5));
  return rows.find((r) => !r.revealed && r.closes_at >= now) || rows.find((r) => !r.revealed) || rows[rows.length - 1] || null;
}

export async function searchPeople(query, bubbleIds) {
  const q = query.trim().toLowerCase();
  if (!sb) {
    const ids = new Set(demo.all("memberships").filter((m) => bubbleIds.includes(m.bubble_id)).map((m) => m.user_id));
    return demo.people().filter((p) => p.id !== "me" && ids.has(p.id) && p.display_name.toLowerCase().includes(q));
  }
  if (!bubbleIds.length) return [];
  const me = await uid();
  const ids = [...new Set(must(await sb.from("memberships").select("user_id").in("bubble_id", bubbleIds)).map((r) => r.user_id))].filter((i) => i !== me);
  if (!ids.length) return [];
  let req = sb.from("public_profiles").select("*").in("id", ids).limit(30);
  if (q) req = req.ilike("display_name", `%${q}%`);
  return must(await req);
}

export async function myPicks(roundId) {
  if (!sb) return demo.all("picks").filter((p) => p.round_id === roundId).map((p) => p.picked_id);
  return must(await sb.from("crush_picks").select("picked_id").eq("round_id", roundId)).map((r) => r.picked_id);
}

export async function pick(roundId, userId) {
  if (!sb) return demo.push("picks", { round_id: roundId, picked_id: userId });
  must(await sb.from("crush_picks").insert({ round_id: roundId, picked_id: userId }));
}

export async function unpick(roundId, userId) {
  if (!sb) return demo.replace("picks", demo.all("picks").filter((p) => !(p.round_id === roundId && p.picked_id === userId)));
  must(await sb.from("crush_picks").delete().eq("round_id", roundId).eq("picked_id", userId));
}

// Demo only: run the reveal now. In production pg_cron calls reveal_due_rounds().
export function demoRevealNow() {
  const r = demo.round();
  const reciprocal = new Set(demo.people().filter((p) => p.picksBack).map((p) => p.id));
  for (const p of demo.all("picks").filter((x) => x.round_id === r.id && reciprocal.has(x.picked_id))) {
    if (!demo.all("matches").some((m) => m.other_id === p.picked_id)) {
      demo.push("matches", { id: crypto.randomUUID(), round_id: r.id, other_id: p.picked_id, created_at: new Date().toISOString() });
    }
  }
  demo.set("round", { ...r, revealed: true, reveal_at: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Matches & messages
// ---------------------------------------------------------------------------
export async function myMatches() {
  if (!sb) return demo.all("matches").map((m) => ({ ...m, other: demo.people().find((p) => p.id === m.other_id) }));
  const me = await uid();
  const rows = must(await sb.from("matches").select("*").order("created_at", { ascending: false }));
  const others = rows.map((m) => (m.user_a === me ? m.user_b : m.user_a));
  const profiles = others.length ? must(await sb.from("public_profiles").select("*").in("id", others)) : [];
  return rows.map((m, i) => ({ ...m, other: profiles.find((p) => p.id === others[i]) || { display_name: "Match" } }));
}

export async function listMessages(matchId) {
  if (!sb) return demo.all("messages").filter((m) => m.match_id === matchId);
  return must(await sb.from("messages").select("*").eq("match_id", matchId).order("created_at").limit(500));
}

export async function sendMessage(matchId, body) {
  if (!sb) return demo.push("messages", { id: Date.now(), match_id: matchId, sender_id: "me", body, created_at: new Date().toISOString() });
  must(await sb.from("messages").insert({ match_id: matchId, body }));
}

export function subscribeMessages(matchId, onMessage) {
  if (!sb) return () => {};
  const ch = sb.channel(`m:${matchId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` }, (p) => onMessage(p.new))
    .subscribe();
  return () => sb.removeChannel(ch);
}

export const myId = uid;

// ---------------------------------------------------------------------------
// Forums
// ---------------------------------------------------------------------------
export async function listThreads(bubbleId, topic) {
  if (!sb) {
    return demo.all("threads").filter((t) => t.bubble_id === bubbleId && (!topic || t.topic === topic)).reverse().map((t) => ({
      ...t,
      author_name: t.anonymous ? "Anonymous" : demo.profile().display_name || "You",
      replies: demo.all("posts").filter((p) => p.thread_id === t.id).length,
      poll_counts: (t.poll_options || []).map((_, i) => demo.all("votes").filter((v) => v.thread_id === t.id && v.option_index === i).length),
    }));
  }
  let req = sb.from("thread_feed").select("*").eq("bubble_id", bubbleId).order("created_at", { ascending: false }).limit(50);
  if (topic) req = req.eq("topic", topic);
  return must(await req);
}

export async function createThread(t) {
  if (!sb) return demo.push("threads", { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...t });
  must(await sb.from("threads").insert(t));
}

export async function listPosts(threadId) {
  if (!sb) return demo.all("posts").filter((p) => p.thread_id === threadId).map((p) => ({ ...p, author_name: p.anonymous ? "Anonymous" : demo.profile().display_name || "You" }));
  return must(await sb.from("post_feed").select("*").eq("thread_id", threadId).order("created_at"));
}

export async function reply(threadId, body, anonymous) {
  if (!sb) return demo.push("posts", { id: Date.now(), thread_id: threadId, body, anonymous, created_at: new Date().toISOString() });
  must(await sb.from("posts").insert({ thread_id: threadId, body, anonymous }));
}

export async function vote(threadId, optionIndex) {
  if (!sb) {
    if (demo.all("votes").some((v) => v.thread_id === threadId)) throw new Error("You already voted");
    return demo.push("votes", { thread_id: threadId, option_index: optionIndex });
  }
  const { error } = await sb.from("poll_votes").insert({ thread_id: threadId, option_index: optionIndex });
  if (error) throw new Error(error.code === "23505" ? "You already voted" : error.message);
}

// ---------------------------------------------------------------------------
// Demo backend (localStorage)
// ---------------------------------------------------------------------------
function blobToDataUrl(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

const demo = {
  key: (k) => `crush.demo.${k}`,
  get(k) { try { return JSON.parse(localStorage.getItem(this.key(k))); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(this.key(k), JSON.stringify(v)); } catch {} },
  all(k) { return this.get(k) || []; },
  push(k, v) { this.set(k, [...this.all(k), v]); return v; },
  replace(k, arr) { this.set(k, arr); },
  profile() { return this.get("profile") || { id: "me", display_name: "", area: "", hobbies: "", photo_paths: [], selfie_paths: [], verification: "unverified" }; },
  saveProfile(f) { this.set("profile", { ...this.profile(), ...f }); },
  // Sample verified peers so search and reveal can be tried. "picksBack" peers
  // stand in for people who picked you in the same round.
  people() {
    const seed = [
      { id: "p1", display_name: "Jordan", area: "Durham", hobbies: "Climbing, film photography", picksBack: true },
      { id: "p2", display_name: "Riley", area: "Durham", hobbies: "Jazz piano" },
      { id: "p3", display_name: "Sam", area: "Chapel Hill", hobbies: "Running, coffee", picksBack: true },
      { id: "p4", display_name: "Avery", area: "Raleigh", hobbies: "Board games" },
    ].map((p) => ({ ...p, photo_paths: [], verification: "verified" }));
    return [{ ...this.profile(), id: "me" }, ...seed];
  },
  round() {
    let r = this.get("round");
    if (!r) {
      const now = Date.now();
      r = { id: "demo-round", name: "Fall Round", opens_at: new Date(now - 864e5).toISOString(), closes_at: new Date(now + 10 * 864e5).toISOString(), reveal_at: new Date(now + 10 * 864e5).toISOString(), revealed: false };
      this.set("round", r);
    }
    return r;
  },
};

// Seed demo memberships so the sample peers belong to every bubble you create or join.
if (!sb) {
  const orig = demo.push.bind(demo);
  demo.push = (k, v) => {
    const out = orig(k, v);
    if (k === "bubbles") for (const p of ["p1", "p2", "p3", "p4"]) orig("memberships", { bubble_id: v.id, user_id: p });
    return out;
  };
}
