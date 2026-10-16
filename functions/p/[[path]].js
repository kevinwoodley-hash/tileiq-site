// Tiler mini websites: tile-iq.com/p/<slug> (the tiler's portfolio home page) and
// tile-iq.com/p/<slug>/<project slug> (one published project). Rendered here on the
// server so link previews and search engines see the real content. The data comes
// from the worker's /api/portfolio/site, which only answers when the tiler has
// switched their site on and only returns published projects, shown photos and the
// business details they chose to show (never job or customer data). Photos are
// served by /pimg/. "Request a quote" uses the tiler's existing enquiry form.
// No analytics or third-party scripts: the page is the tiler's, not ours.
//
// Own domains: tile-iq.com/p/<slug>/_d/<path> is the same page rendered for the tiler's own
// domain (work.example.com, example.com or example.com/portfolio): the tileiq-domains worker,
// or the tiler's own web host for a folder, fetches it from there. Links then point at their
// domain, photos and the quote form at tile-iq.com, and once the domain is verified it is the
// canonical address everywhere (including on the tile-iq.com/p/ pages).
const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const SITE = "https://tile-iq.com";

const e = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const paras = s => String(s || "").split(/\n{2,}|\r?\n/).map(x => x.trim()).filter(Boolean).map(x => `<p>${e(x)}</p>`).join("");
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
// Where links, photos and the canonical address point, for tile-iq.com/p/<slug> or the tiler's domain
function links(data, ownDomain) {
  const d = data.business.domain, slug = data.slug;
  const canonRoot = d && d.active ? `https://${d.host}${d.base}` : `${SITE}/p/${slug}`;
  const base = ownDomain ? (d.base || "") : `/p/${slug}`;
  return {
    home: base || "/",
    proj: ps => `${base}/${encodeURIComponent(ps)}`,
    img: (id, size) => `${ownDomain ? SITE : ""}/pimg/${id}/${size}.jpg`,
    imgAbs: (id, size) => `${SITE}/pimg/${id}/${size}.jpg`,
    quote: `${ownDomain ? SITE : ""}/enquire/?t=${encodeURIComponent(slug)}&src=portfolio`,
    canon: sub => canonRoot + (sub ? "/" + sub : ""),
    // the own-domain copy is only indexed once that domain is verified (else it's a duplicate)
    robots: ownDomain && !(d && d.active) ? "noindex" : "index, follow",
    slug,
  };
}
const monthYear = d => { try { return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }); } catch (_) { return ""; } };

async function getSite(slug, origin, waitUntil) {
  const cache = caches.default;
  const key = new Request(origin + "/__portfolio-data/" + slug);
  let res = await cache.match(key);
  if (!res) {
    const r = await fetch(`${WORKER}/api/portfolio/site?slug=${encodeURIComponent(slug)}`);
    res = new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
    waitUntil(cache.put(key, res.clone()));
  }
  if (!res.ok) return null;
  try { return await res.json(); } catch (_) { return null; }
}

export async function onRequestGet({ request, params, waitUntil }) {
  const url = new URL(request.url);
  let parts = [].concat(params.path || []).filter(Boolean).map(s => String(s).toLowerCase());
  const ownDomain = parts[1] === "_d";
  if (ownDomain) parts = [parts[0], ...parts.slice(2)];
  if (!parts.length || parts.length > 2 || !parts.every(p => /^[a-z0-9-]{1,80}$/.test(p))) return notFound();
  const data = await getSite(parts[0], url.origin, waitUntil);
  if (!data || (ownDomain && !data.business.domain)) return notFound();
  const L = links(data, ownDomain);
  if (parts.length === 1) return page(renderHome(data, L));
  const project = data.projects.find(p => p.slug === parts[1]);
  return project ? page(renderProject(data, project, L)) : notFound(data, L);
}

function page(html, status = 200, extra = {}) {
  return new Response(html, { status, headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=60",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' https://tile-iq.com https://*.supabase.co data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...extra } });
}

function notFound(data, L) {
  const name = data?.business?.name;
  return page(shell({ title: "Page not found", description: "", canonical: "", robots: "noindex", colour: data?.business?.brandColour, slug: data?.slug, body: `
    <main class="wrap" style="padding:80px 20px;text-align:center;">
      <h1>Page not found</h1>
      <p class="muted">${name && L ? `This project isn't available. <a href="${e(L.home)}">See ${e(name)}'s other work</a>.` : "This portfolio isn't available."}</p>
    </main>` }), 404, { "Cache-Control": "public, max-age=30" });
}

function shell({ title, description, canonical, robots, colour, ogImage, body, jsonLd, type, slug }) {
  const c = /^#[0-9a-f]{6}$/i.test(colour || "") ? colour : "#E07A2F";
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
${description ? `<meta name="description" content="${e(description)}">` : ""}
<meta name="robots" content="${robots || "index, follow"}">
${slug ? `<meta name="tileiq-portfolio" content="${e(slug)}">` : ""}
${canonical ? `<link rel="canonical" href="${e(canonical)}">
<meta property="og:url" content="${e(canonical)}">` : ""}
<meta property="og:type" content="${type || "website"}">
<meta property="og:title" content="${e(title)}">
${description ? `<meta property="og:description" content="${e(description)}">` : ""}
${ogImage ? `<meta property="og:image" content="${e(ogImage)}">
<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<meta name="twitter:title" content="${e(title)}">
${description ? `<meta name="twitter:description" content="${e(description)}">` : ""}
<meta name="theme-color" content="${c}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
<style>
:root{--brand:${c};--ink:#14181d;--muted:#5b6670;--line:#e4e8ec;--bg:#f6f7f9;--card:#fff}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--brand)}img{max-width:100%;display:block}
h1,h2,h3{line-height:1.2;margin:0 0 .5em}h1{font-size:clamp(28px,6vw,44px)}h2{font-size:clamp(22px,4vw,30px)}
.wrap{max-width:1080px;margin:0 auto;padding:0 16px}.muted{color:var(--muted)}
.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.96);border-bottom:1px solid var(--line);backdrop-filter:blur(6px)}
.top .wrap{display:flex;align-items:center;gap:12px;min-height:62px}
.brand{display:flex;align-items:center;gap:10px;flex:1;min-width:0;text-decoration:none;color:var(--ink);font-weight:800;font-size:17px}
.brand img{width:40px;height:40px;object-fit:contain;border-radius:8px}.brand span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:46px;padding:0 20px;border-radius:12px;font-weight:800;font-size:15px;text-decoration:none;border:2px solid var(--brand);cursor:pointer}
.btn-main{background:var(--brand);color:#fff}.btn-alt{background:#fff;color:var(--ink);border-color:var(--line)}
.top .btn{min-height:40px;padding:0 14px;font-size:14px}
.hero{position:relative;color:#fff;background:#1b2a3c center/cover no-repeat}
.hero:before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,14,20,.35),rgba(10,14,20,.78))}
.hero .wrap{position:relative;padding:72px 16px 56px}.hero p{max-width:640px;font-size:18px;color:#e9edf1;margin:0 0 6px}
.hero .area{font-size:15px;color:#cfd6dd}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.hero .btn-alt{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.4)}
section{padding:48px 0}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.chip{border:1px solid var(--line);background:#fff;border-radius:99px;padding:8px 14px;font-size:14px;font-weight:700;cursor:pointer;color:var(--ink)}
.chip[aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;color:var(--ink);display:flex;flex-direction:column}
.card img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;background:var(--line)}
.card div{padding:12px 14px 16px}.card h3{font-size:17px;margin:0 0 4px}.card .muted{font-size:13px}
.badge{display:inline-block;font-size:12px;font-weight:800;color:var(--brand);text-transform:uppercase;letter-spacing:.06em}
.panel{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px}
.two{display:grid;grid-template-columns:1.3fr 1fr;gap:20px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0 0}.tags span{background:var(--bg);border:1px solid var(--line);border-radius:99px;padding:6px 12px;font-size:14px}
.cta{background:var(--ink);color:#fff;border-radius:18px;padding:30px 22px;text-align:center}.cta p{color:#c9d1d9}
.links{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:16px}.links a{color:#fff;font-weight:700}
footer{padding:28px 0 40px;text-align:center;font-size:13px}footer a{color:var(--muted)}
.crumb{display:inline-block;margin:22px 0 10px;font-weight:700;text-decoration:none}
.meta{display:flex;flex-wrap:wrap;gap:6px 14px;color:var(--muted);font-size:15px;margin-bottom:18px}
.ba{position:relative;overflow:hidden;border-radius:16px;background:var(--line);user-select:none;touch-action:pan-y;margin:0 0 8px}
.ba img{width:100%;height:auto}.ba .after{position:absolute;inset:0;clip-path:inset(0 0 0 50%)}.ba .after img{width:100%;height:100%;object-fit:cover}
.ba .line{position:absolute;top:0;bottom:0;left:50%;width:3px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.2);pointer-events:none}
.ba .lbl{position:absolute;top:12px;padding:4px 10px;border-radius:8px;background:rgba(0,0,0,.6);color:#fff;font-size:13px;font-weight:800}
.ba input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0}
.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.gal button{padding:0;border:0;background:var(--line);border-radius:12px;overflow:hidden;cursor:zoom-in}
.gal img{width:100%;height:auto;aspect-ratio:1;object-fit:cover}
.gal figcaption{font-size:13px;color:var(--muted);padding:4px 2px 0}
#lb{position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.92);display:none;align-items:center;justify-content:center;padding:16px}
#lb.on{display:flex}#lb img{max-height:86vh;max-width:100%;border-radius:8px}
#lb button{position:absolute;top:14px;right:14px;width:46px;height:46px;border-radius:23px;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer}
#lb p{position:absolute;bottom:14px;left:16px;right:16px;text-align:center;color:#ddd;margin:0}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 16px;margin:0}dt{font-weight:800}dd{margin:0}
@media(max-width:760px){.two{grid-template-columns:1fr}.hero .wrap{padding:52px 16px 40px}section{padding:36px 0}}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function topBar(b, L) {
  return `<header class="top"><div class="wrap">
    <a class="brand" href="${e(L.home)}">${b.logoUrl ? `<img src="${e(b.logoUrl)}" alt="">` : ""}<span>${e(b.name)}</span></a>
    <a class="btn btn-main" href="${e(L.quote)}">Request a quote</a>
  </div></header>`;
}
function footer(slug) {
  return `<footer class="muted"><div class="wrap">
    <a href="${SITE}/?utm_source=portfolio&amp;utm_medium=referral&amp;utm_campaign=powered_by&amp;utm_content=${encodeURIComponent(slug)}">Portfolio powered by TileIQ</a>
  </div></footer>`;
}
function contactBlock(b, L) {
  const links = [                                   // (the phone has its own Call button above)
    b.email && `<a href="mailto:${e(b.email)}">✉️ ${e(b.email)}</a>`,
    b.links?.facebook && `<a href="${e(b.links.facebook)}" rel="noopener" target="_blank">Facebook</a>`,
    b.links?.instagram && `<a href="${e(b.links.instagram)}" rel="noopener" target="_blank">Instagram</a>`,
    b.links?.tiktok && `<a href="${e(b.links.tiktok)}" rel="noopener" target="_blank">TikTok</a>`,
    b.links?.website && `<a href="${e(b.links.website)}" rel="noopener" target="_blank">Website</a>`,
  ].filter(Boolean);
  return `<div class="cta">
    <h2>Planning some tiling?</h2>
    <p>Tell ${e(b.name)} about your project and get a quote. It only takes a minute.</p>
    <div class="actions" style="justify-content:center;"><a class="btn btn-main" href="${e(L.quote)}">Request a quote</a>
    ${b.phone ? `<a class="btn btn-alt" href="tel:${e(b.phone.replace(/[^\d+]/g, ""))}">Call ${e(b.phone)}</a>` : ""}</div>
    ${links.length ? `<div class="links">${links.join("")}</div>` : ""}
  </div>`;
}
function businessLd(data, url) {
  const b = data.business;
  const ld = { "@context": "https://schema.org", "@type": "HomeAndConstructionBusiness", name: b.name, url };
  if (b.logoUrl) ld.logo = b.logoUrl;
  if (b.about || b.intro) ld.description = clip(b.intro || b.about, 300);
  if (b.phone) ld.telephone = b.phone;
  if (b.email) ld.email = b.email;
  if (b.areas) ld.areaServed = b.areas;
  const same = Object.values(b.links || {}).filter(Boolean);
  if (same.length) ld.sameAs = same;
  return ld;
}

function renderHome(data, L) {
  const b = data.business, slug = data.slug, url = L.canon(""), img = L.img;
  const cats = [...new Set(data.projects.map(p => p.category).filter(Boolean))];
  const heroId = b.headerImageId || data.projects[0]?.cover_image_id;
  const description = b.intro || clip(`Tiling work by ${b.name}${b.areas ? ` in ${b.areas}` : ""}. See completed projects and request a quote.`, 160);
  const cards = data.projects.map(p => `
    <a class="card" href="${e(L.proj(p.slug))}" data-cat="${e(p.category || "")}">
      <img src="${img(p.cover_image_id, "t")}" alt="${e(p.title)}" loading="lazy" width="600" height="450">
      <div>${p.featured ? `<span class="badge">Featured</span>` : ""}<h3>${e(p.title)}</h3>
      <span class="muted">${e([p.category, p.location].filter(Boolean).join(" · "))}</span></div>
    </a>`).join("");
  const body = `
${topBar(b, L)}
<div class="hero"${heroId ? ` style="background-image:url('${img(heroId, "f")}')"` : ""}><div class="wrap">
  <h1>${e(b.name)}</h1>
  ${b.intro ? `<p>${e(b.intro)}</p>` : ""}
  ${b.areas ? `<div class="area">📍 ${e(b.areas)}</div>` : ""}
  <div class="actions"><a class="btn btn-main" href="${e(L.quote)}">Request a quote</a>
  ${data.projects.length ? `<a class="btn btn-alt" href="#work">See our work</a>` : ""}</div>
</div></div>
<main>
<section id="work"><div class="wrap">
  <h2>Our work</h2>
  ${cats.length > 1 ? `<div class="chips" role="group" aria-label="Filter projects">
    <button class="chip" aria-pressed="true" data-f="">All</button>${cats.map(c => `<button class="chip" aria-pressed="false" data-f="${e(c)}">${e(c)}</button>`).join("")}
  </div>` : ""}
  ${data.projects.length ? `<div class="grid" id="grid">${cards}</div>` : `<p class="muted">Projects coming soon.</p>`}
</div></section>
${b.about || b.services.length || b.experience || b.areas ? `<section style="background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line);"><div class="wrap two">
  <div><h2>About ${e(b.name)}</h2>${paras(b.about)}${b.experience ? `<p><strong>${e(b.experience)}</strong></p>` : ""}</div>
  <div>${b.services.length ? `<h3>Services</h3><div class="tags">${b.services.map(s => `<span>${e(s)}</span>`).join("")}</div>` : ""}
  ${b.areas ? `<h3 style="margin-top:20px;">Areas covered</h3><p class="muted" style="margin:0;">${e(b.areas)}</p>` : ""}</div>
</div></section>` : ""}
<section id="contact"><div class="wrap">${contactBlock(b, L)}</div></section>
</main>
${footer(slug)}
${cats.length > 1 ? `<script>
document.querySelectorAll('.chip').forEach(function (c) { c.addEventListener('click', function () {
  var f = c.getAttribute('data-f');
  document.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
  document.querySelectorAll('#grid .card').forEach(function (k) { k.style.display = !f || k.getAttribute('data-cat') === f ? '' : 'none'; });
}); });
</script>` : ""}`;
  return shell({ title: `${b.name} | Tiling portfolio`, description, canonical: url, colour: b.brandColour, robots: L.robots, slug,
    ogImage: heroId ? L.imgAbs(heroId, "f") : null, body, jsonLd: businessLd(data, url) });
}

function renderProject(data, p, L) {
  const b = data.business, slug = data.slug, url = L.canon(p.slug), img = L.img;
  const before = p.images.find(i => i.stage === "before");
  const after = p.images.find(i => i.stage === "after") || p.images.find(i => i.stage === "finished");
  const showBA = before && after && before.id !== after.id;
  const others = data.projects.filter(x => x.id !== p.id).slice(0, 3);
  const when = p.completed_on ? monthYear(p.completed_on) : "";
  const description = clip(p.description || `${p.title} by ${b.name}${p.location ? ` in ${p.location}` : ""}.`, 160);
  const ratio = i => i.width && i.height ? ` width="${i.width}" height="${i.height}"` : "";
  const body = `
${topBar(b, L)}
<main class="wrap">
  <a class="crumb" href="${e(L.home)}">← All projects</a>
  <h1>${e(p.title)}</h1>
  <div class="meta">${[p.category, p.location && `📍 ${p.location}`, when && `Completed ${when}`].filter(Boolean).map(x => `<span>${e(x)}</span>`).join("")}</div>
  ${showBA ? `<div class="ba" id="ba">
      <img src="${img(before.id, "f")}" alt="Before"${ratio(before)}>
      <div class="after" id="ba-after"><img src="${img(after.id, "f")}" alt="After"></div>
      <div class="line" id="ba-line"></div>
      <span class="lbl" style="left:12px;">Before</span><span class="lbl" style="right:12px;">After</span>
      <input type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after" id="ba-range">
    </div><p class="muted" style="margin:0 0 24px;font-size:14px;">Drag across the photo to compare before and after.</p>` : ""}
  <div class="two" style="align-items:start;">
    <div>${paras(p.description) || ""}
      ${p.materials || p.tile_type ? `<div class="panel" style="margin-top:16px;"><dl>
        ${p.tile_type ? `<dt>Tiles</dt><dd>${e(p.tile_type)}</dd>` : ""}${p.materials ? `<dt>Materials</dt><dd>${e(p.materials)}</dd>` : ""}
      </dl></div>` : ""}
    </div>
    <div class="panel"><h3>Like this work?</h3><p class="muted">Ask ${e(b.name)} for a quote for your own project.</p>
      <a class="btn btn-main" style="width:100%;" href="${e(L.quote)}">Request a quote</a></div>
  </div>
  <h2 style="margin-top:36px;">Photos</h2>
  <div class="gal">${p.images.map((i, n) => `<figure style="margin:0;"><button type="button" data-full="${img(i.id, "f")}" data-cap="${e(i.caption || "")}" aria-label="Open photo ${n + 1}">
    <img src="${img(i.id, "t")}" alt="${e(i.caption || `${p.title}, photo ${n + 1}`)}" loading="lazy" width="600" height="600"></button>
    ${i.caption ? `<figcaption>${e(i.caption)}</figcaption>` : ""}</figure>`).join("")}</div>
  ${others.length ? `<h2 style="margin-top:44px;">More work</h2><div class="grid">${others.map(o => `
    <a class="card" href="${e(L.proj(o.slug))}"><img src="${img(o.cover_image_id, "t")}" alt="${e(o.title)}" loading="lazy" width="600" height="450">
    <div><h3>${e(o.title)}</h3><span class="muted">${e([o.category, o.location].filter(Boolean).join(" · "))}</span></div></a>`).join("")}</div>` : ""}
  <section>${contactBlock(b, L)}</section>
</main>
${footer(slug)}
<div id="lb" role="dialog" aria-modal="true" aria-label="Photo"><button type="button" aria-label="Close">✕</button><img alt=""><p></p></div>
<script>
(function () {
  var r = document.getElementById('ba-range');
  if (r) r.addEventListener('input', function () {
    document.getElementById('ba-after').style.clipPath = 'inset(0 0 0 ' + r.value + '%)';
    document.getElementById('ba-line').style.left = r.value + '%';
  });
  var lb = document.getElementById('lb'), li = lb.querySelector('img'), lc = lb.querySelector('p');
  function close() { lb.classList.remove('on'); li.removeAttribute('src'); }
  document.querySelectorAll('.gal button').forEach(function (b) { b.addEventListener('click', function () {
    li.src = b.getAttribute('data-full'); li.alt = b.getAttribute('data-cap') || ''; lc.textContent = b.getAttribute('data-cap') || ''; lb.classList.add('on');
  }); });
  lb.addEventListener('click', function (ev) { if (ev.target !== li) close(); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') close(); });
})();
</script>`;
  const ld = [businessLd(data, L.canon("")), {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: b.name, item: L.canon("") },
      { "@type": "ListItem", position: 2, name: p.title, item: url }] }];
  const cover = p.cover_image_id || p.images[0]?.id;
  return shell({ title: `${p.title} | ${b.name}`, description, canonical: url, colour: b.brandColour, type: "article", robots: L.robots, slug,
    ogImage: cover ? L.imgAbs(cover, "f") : null, body, jsonLd: ld });
}
