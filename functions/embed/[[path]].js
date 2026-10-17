// Portfolio embed for tilers' existing websites: tile-iq.com/embed/<slug>
//   ?show=featured   only featured projects (default: all published projects)
//   ?brand=0         hide the small "Portfolio powered by TileIQ" line
// A compact, responsive gallery meant for an <iframe>: each project opens its full page
// (at the tiler's canonical address) in a new tab. It tells the parent page its height
// (postMessage {tileiqEmbed, height}) so the snippet from the app can size the iframe.
// Same data and rules as the mini website: only when the site is switched on, only
// published projects and shown photos. Not indexed (robots.txt and noindex).
const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const SITE = "https://tile-iq.com";
const e = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function onRequestGet({ request, params, waitUntil }) {
  const url = new URL(request.url);
  const parts = [].concat(params.path || []).filter(Boolean);
  const slug = String(parts[0] || "").toLowerCase();
  if (parts.length !== 1 || !/^[a-z0-9-]{1,60}$/.test(slug)) return html("<p>Portfolio not found.</p>", 404, "#E07A2F", slug);

  const cache = caches.default;
  const key = new Request(url.origin + "/__portfolio-data/" + slug);
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(`${WORKER}/api/portfolio/site?slug=${encodeURIComponent(slug)}`);
    res = new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
    waitUntil(cache.put(key, res.clone()));
  }
  const data = res.ok ? await res.json().catch(() => null) : null;
  if (!data) return html(`<p class="m">This portfolio isn't available at the moment.</p>`, 404, "#E07A2F", slug);

  const b = data.business, d = b.domain;
  const root = d && d.active ? `https://${d.host}${d.base || ""}` : `${SITE}/p/${slug}`;
  const featuredOnly = url.searchParams.get("show") === "featured";
  const brand = url.searchParams.get("brand") !== "0";
  let projects = data.projects;
  if (featuredOnly && projects.some(p => p.featured)) projects = projects.filter(p => p.featured);
  const cards = projects.map(p => `<a class="c" href="${e(root + "/" + encodeURIComponent(p.slug))}" target="_blank" rel="noopener">
      <img src="${SITE}/pimg/${e(p.cover_image_id)}/t.jpg" alt="${e(p.title)}" loading="lazy" width="600" height="450">
      <span><b>${e(p.title)}</b>${p.category || p.location ? `<i>${e([p.category, p.location].filter(Boolean).join(" · "))}</i>` : ""}</span></a>`).join("");
  const body = `${projects.length ? `<div class="g">${cards}</div>` : `<p class="m">Projects coming soon.</p>`}
  <div class="f"><a class="q" href="${SITE}/enquire/?t=${encodeURIComponent(slug)}&amp;src=portfolio-embed" target="_blank" rel="noopener">Request a quote</a>
  <a class="all" href="${e(root)}" target="_blank" rel="noopener">See all our work →</a></div>
  ${brand ? `<p class="pb"><a href="${SITE}/?utm_source=portfolio-embed&amp;utm_medium=referral&amp;utm_content=${encodeURIComponent(slug)}" target="_blank" rel="noopener">Portfolio powered by TileIQ</a></p>` : ""}`;
  return html(body, 200, b.brandColour, slug);
}

function html(body, status, colour, slug) {
  const c = /^#[0-9a-f]{6}$/i.test(colour || "") ? colour : "#E07A2F";
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Tiling portfolio</title>
<style>
*{box-sizing:border-box}html,body{margin:0;background:transparent}
body{font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#14181d;padding:2px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.c{display:flex;flex-direction:column;background:#fff;border:1px solid #e4e8ec;border-radius:12px;overflow:hidden;text-decoration:none;color:inherit}
.c img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;background:#e4e8ec;display:block}
.c span{padding:9px 11px 11px}.c b{display:block;font-size:15px}.c i{display:block;font-style:normal;font-size:12.5px;color:#5b6670}
.f{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:14px}
.q{background:${c};color:#fff;font-weight:800;text-decoration:none;padding:10px 16px;border-radius:10px}
.all{color:${c};font-weight:700;text-decoration:none}
.pb{margin:10px 0 0;font-size:12px}.pb a{color:#8a94a0}.m{color:#5b6670}
</style></head><body>${body}
<script>
(function () {
  function send() { try { parent.postMessage({ tileiqEmbed: ${JSON.stringify(slug || "")}, height: document.documentElement.scrollHeight }, "*"); } catch (e) {} }
  window.addEventListener("load", send); window.addEventListener("resize", send);
  if (window.ResizeObserver) new ResizeObserver(send).observe(document.body);
  document.querySelectorAll("img").forEach(function (i) { i.addEventListener("load", send); });
})();
</script></body></html>`, { status, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=120", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src https://tile-iq.com data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
  } });
}
