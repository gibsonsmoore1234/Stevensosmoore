// Local preview server: static files from public/, mirroring vercel.json rewrites.
// Usage: npm run dev   (PORT=3000 by default)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, sep } from "node:path";

await import("./build.mjs");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

async function fileFor(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
  const full = join(publicDir, safe);
  if (!full.startsWith(publicDir + sep) && full !== publicDir) return null;
  for (const c of [full, full + ".html", join(full, "index.html")]) {
    try { if ((await stat(c)).isFile()) return c; } catch {}
  }
  return null;
}

const vercel = JSON.parse(await readFile(join(root, "vercel.json"), "utf8"));
const rewrites = new Map((vercel.rewrites || []).map((r) => [r.source, r.destination]));

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const file = await fileFor(rewrites.get(pathname) || pathname);
  if (!file) return res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  res.end(await readFile(file));
}).listen(port, () => console.log(`▶ Commission preview → http://localhost:${port}`));
