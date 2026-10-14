// Local preview server that mirrors vercel.json routing.
// Usage: npm run dev   (PORT=3000 by default)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, sep } from "node:path";

await import("./build.mjs");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

// vercel.json "source" patterns → RegExp (supports :param and :param*)
const toRegex = (source) =>
  new RegExp("^" + source.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\/:(\w+)\*/g, "(?:/.*)?").replace(/:(\w+)/g, "[^/]+") + "$");
const rewrites = (vercel.rewrites || []).map((r) => ({ re: toRegex(r.source), dest: r.destination }));

async function fileFor(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const full = join(publicDir, safe);
  if (!full.startsWith(publicDir + sep) && full !== publicDir) return null;
  const candidates = [full];
  if (vercel.cleanUrls) candidates.push(full + ".html");
  candidates.push(join(full, "index.html"));
  for (const c of candidates) {
    try {
      if ((await stat(c)).isFile()) return c;
    } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  let file = await fileFor(pathname);
  if (!file) {
    const hit = rewrites.find((r) => r.re.test(pathname));
    if (hit) file = await fileFor(hit.dest);
  }
  let status = 200;
  if (!file) {
    status = 404;
    file = await fileFor("/404.html");
  }
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
    return;
  }
  const body = await readFile(file);
  res.writeHead(status, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(body);
}).listen(port, () => console.log(`▶ Stevensosmoore preview → http://localhost:${port}`));
