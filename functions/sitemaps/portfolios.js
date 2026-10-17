// tile-iq.com/sitemaps/portfolios: every switched-on tiler mini website and its published
// projects, for search engines (listed in /robots.txt). Sites on a verified own domain are
// listed at that domain, since that's their canonical address (their domain also serves its
// own /sitemap.xml). Built from the worker's /api/portfolio/sitemap; cached for an hour.
const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const x = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + "/sitemaps/portfolios");
  const hit = await cache.match(key);
  if (hit) return hit;
  const r = await fetch(`${WORKER}/api/portfolio/sitemap`);
  const { sites = [] } = r.ok ? await r.json() : {};
  const day = d => (d ? String(d).slice(0, 10) : "");
  const urls = sites.flatMap(s => [
    { loc: s.root, mod: day(s.updated) },
    ...s.projects.map(p => ({ loc: `${s.root}/${encodeURIComponent(p.slug)}`, mod: day(p.updated) })),
  ]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${x(u.loc)}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>`;
  const out = new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  waitUntil(cache.put(key, out.clone()));
  return out;
}
