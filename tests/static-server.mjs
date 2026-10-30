// Serves the site root the way Cloudflare Pages does for these tests:
// /features -> features.html, /about -> about/index.html, unknown paths -> 404.html.
// Pages Functions (functions/) and _redirects are not run here.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".ico": "image/x-icon", ".xml": "application/xml", ".txt": "text/plain",
};

function resolve(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, "");
  const base = path.join(ROOT, clean);
  if (!base.startsWith(ROOT)) return null;
  const candidates = clean.endsWith("/")
    ? [path.join(base, "index.html")]
    : [base, base + ".html", path.join(base, "index.html")];
  return candidates.find(f => fs.existsSync(f) && fs.statSync(f).isFile()) || null;
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const file = resolve(pathname);
  const status = file ? 200 : 404;
  const target = file || path.join(ROOT, "404.html");
  res.writeHead(status, { "Content-Type": TYPES[path.extname(target)] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}).listen(PORT, () => console.log(`Static site on http://localhost:${PORT}`));
