#!/usr/bin/env python3
"""Builds the /guides/ section of tile-iq.com from the source files in this folder.

Each guide is guides-src/<slug>.html: a JSON block between <!--meta and --> followed by the
article body (plain HTML: <h2>, <h3>, <p>, <ul>, <table>...). This script wraps it in the site's
header/footer and the guide template (breadcrumbs, quick answer, contents, sources, related
guides, TileIQ call to action, structured data), writes guides/<slug>/index.html, rebuilds the
hub guides/index.html, and adds the guide URLs to sitemap.xml.

Run from the site root:  python3 guides-src/build.py
Meta fields: title, h1, description, category, published, updated, quick_answer (HTML),
cta (key into CTAS), related (list of slugs), sources (list of [label, url, note]),
status ("draft" = built but noindex and left out of the hub and sitemap).
"""
import html, json, os, re, sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "guides-src")
OUT = os.path.join(ROOT, "guides")
SITE = "https://tile-iq.com"
PLAY = "https://play.google.com/store/apps/details?id=com.tileiqpro.android"
APPLE = "https://apps.apple.com/gb/app/tileiq-pro/id6787447373"
# The author of every guide: a real, qualified tiler, shown in the byline and in structured data.
AUTHOR = {"@type": "Person", "@id": f"{SITE}/about/#kevin", "name": "Kevin", "url": f"{SITE}/about/",
          "jobTitle": "Tiler and founder of TileIQ",
          "hasCredential": {"@type": "EducationalOccupationalCredential", "name": "City & Guilds Level 2, Wall and Floor Tiling"},
          "worksFor": {"@type": "Organization", "@id": f"{SITE}/#organization", "name": "TileIQ"}}
BYLINE = 'By <a href="/about/">Kevin</a>, City &amp; Guilds Level 2 qualified tiler'
CATEGORIES = ["Tiling prices", "Estimating & materials", "Running a tiling business", "Free calculators"]

# The call to action at the end of each guide, matched to its subject. Every one offers the real
# app first (free, no sign-up, first quote free), with the demo as a clearly separate option.
CTAS = {
    "quote": ("Tired of working out every tiling quote by hand?",
              "TileIQ measures the job, works out the materials and labour, and sends a professional quote your customer can accept online."),
    "materials": ("Let TileIQ do the materials maths.",
                  "Measure the room once and TileIQ works out tiles, adhesive, grout, prep and trims for every surface, then puts it straight into the quote."),
    "pricing": ("Price every job the same way, every time.",
                "Set your rates once in TileIQ and every quote uses them: labour, materials, prep and extras, broken down clearly for the customer."),
    "business": ("Run the whole job from one app.",
                 "Enquiries, quotes, scheduling, invoices and getting paid, plus a free portfolio website for your finished work."),
    "portfolio": ("Show off your work and win more jobs.",
                  "TileIQ turns finished jobs into a free portfolio website with a Request a Quote button, and helps you share them to Facebook, Instagram and TikTok."),
}

e = lambda s: html.escape(str(s), quote=True)


def read_guides():
    guides = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".html"):
            continue
        raw = open(os.path.join(SRC, f), encoding="utf-8").read()
        m = re.match(r"\s*<!--meta\s*(\{.*?\})\s*-->\s*(.*)\Z", raw, re.S)
        if not m:
            sys.exit(f"{f}: missing <!--meta {{...}} --> block")
        meta = json.loads(m.group(1))
        meta["slug"] = f[:-5]
        meta["body"] = m.group(2)
        for k in ("title", "h1", "description", "category", "published", "updated", "quick_answer"):
            if not meta.get(k):
                sys.exit(f"{f}: meta '{k}' is required")
        if meta["category"] not in CATEGORIES:
            sys.exit(f"{f}: unknown category {meta['category']!r}")
        guides.append(meta)
    return guides


def site_chrome():
    blog = open(os.path.join(ROOT, "blog", "how-to-measure-a-room-for-tiling", "index.html"), encoding="utf-8").read()
    header = re.search(r"  <header class=\"site-header contact-header\">.*?</header>", blog, re.S).group(0)
    header = header.replace(' class="active" href="/blog/"', ' href="/blog/"')
    header = header.replace('<a href="/guides/">Guides</a>', '<a class="active" href="/guides/">Guides</a>')
    if 'href="/guides/"' not in header:
        header = header.replace('<a href="/blog/">Blog</a>', '<a class="active" href="/guides/">Guides</a>\n        <a href="/blog/">Blog</a>')
    footer = re.search(r"  <footer>.*?</footer>", blog, re.S).group(0)
    return header, footer


def head(title, desc, url, og_type, ld, robots=None, extra=""):
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<!-- TileIQ analytics: Google tag G-274KES4P2G with Consent Mode v2 (see /analytics.js) -->
<script src="/analytics.js"></script>
  <meta charset="utf-8" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}" />
  <link rel="canonical" href="{e(url)}" />
  {f'<meta name="robots" content="{robots}" />' if robots else ''}
  <meta property="og:type" content="{og_type}" />
  <meta property="og:site_name" content="TileIQ" />
  <meta property="og:url" content="{e(url)}" />
  <meta property="og:title" content="{e(title)}" />
  <meta property="og:description" content="{e(desc)}" />
  <meta property="og:image" content="{SITE}/images/og-image.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  {extra}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/guides/guides.css" />
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")}</script>
</head>"""


def cta_block(key, source):
    h, p = CTAS.get(key, CTAS["quote"])
    src = "guide-" + source
    return f"""<section class="guide-cta" data-cta="{e(source)}">
  <h2>{e(h)}</h2>
  <p>{e(p)}</p>
  <p class="guide-cta-free"><strong>Try the real app free.</strong> No sign-up needed, and your first quote is free to send.</p>
  <div class="guide-cta-actions">
    <a class="btn btn-primary" href="/app/?utm_source={src}&amp;utm_medium=guide" data-cta-kind="web_app">Start free in your browser</a>
    <a class="guide-store" href="{PLAY}" data-cta-kind="google_play">Get it on Google Play</a>
    <a class="guide-store" href="{APPLE}" data-cta-kind="app_store">Download on the App Store</a>
  </div>
  <p class="guide-cta-demo">Just want a look first? <a href="/app/demo?utm_source={src}&amp;utm_medium=guide" data-cta-kind="demo">Explore the demo with sample jobs</a> (no account, nothing saved).</p>
</section>"""


def reading_minutes(body):
    words = len(re.sub(r"<[^>]+>", " ", body).split())
    return max(2, round(words / 220))


def fmt_date(d):
    y, m, dd = map(int, d.split("-"))
    return date(y, m, dd).strftime("%-d %B %Y")


def add_ids(body):
    """Give every <h2> an id and return (body, [(id, text)]) for the contents list."""
    toc, used = [], set()
    def rep(m):
        attrs, text = m.group(1), m.group(2)
        plain = html.unescape(re.sub(r"<[^>]+>", "", text)).strip()
        hid = re.search(r'id="([^"]+)"', attrs)
        hid = hid.group(1) if hid else re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:60]
        while hid in used:
            hid += "-2"
        used.add(hid)
        toc.append((hid, plain))
        attrs = attrs if 'id="' in attrs else f'{attrs} id="{hid}"'
        return f"<h2{attrs}>{text}</h2>"
    body = re.sub(r"<h2([^>]*)>(.*?)</h2>", rep, body, flags=re.S)
    return body, toc


def build_guide(g, by_slug, header, footer):
    url = f"{SITE}/guides/{g['slug']}/"
    body, toc = add_ids(g["body"])
    draft = g.get("status") == "draft"
    related = [by_slug[s] for s in g.get("related", []) if s in by_slug and by_slug[s].get("status") != "draft"][:3]
    sources = g.get("sources", [])
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "Tiling guides", "item": f"{SITE}/guides/"},
            {"@type": "ListItem", "position": 3, "name": g["h1"], "item": url}]},
        {"@type": "Article", "mainEntityOfPage": {"@type": "WebPage", "@id": url}, "headline": g["h1"],
         "description": g["description"], "image": f"{SITE}/images/og-image.jpg",
         "datePublished": g["published"], "dateModified": g["updated"], "inLanguage": "en-GB",
         "articleSection": g["category"],
         "author": AUTHOR,
         "publisher": {"@type": "Organization", "name": "TileIQ", "logo": {"@type": "ImageObject", "url": f"{SITE}/images/tileiq-icon-512.png", "width": 512, "height": 512}}}]}
    page = head(g["title"], g["description"], url, "article", ld, robots="noindex" if draft else None,
                extra=f'<meta property="article:published_time" content="{g["published"]}" />\n  <meta property="article:modified_time" content="{g["updated"]}" />')
    toc_html = "".join(f'<li><a href="#{e(i)}">{e(t)}</a></li>' for i, t in toc)
    src_html = "".join(
        f'<li><a href="{e(u)}" rel="noopener" target="_blank">{e(l)}</a>{(" · " + e(n)) if n else ""}</li>'
        for l, u, n in [(s + [""])[:3] for s in sources])
    rel_html = "".join(
        f'<a href="/guides/{e(r["slug"])}/"><span>{e(r["category"])}</span>{e(r["h1"])}</a>' for r in related)
    page += f"""
<body class="features-page guide-page">
{header}

  <main>
    <article>
      <section class="post-hero">
        <div class="container post-hero-inner">
          <nav class="guide-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/guides/">Tiling guides</a> › <span>{e(g['h1'])}</span></nav>
          <span class="post-category">{e(g['category'])}</span>
          <h1>{e(g['h1'])}</h1>
          <p class="post-meta">Updated {fmt_date(g['updated'])} · {reading_minutes(body)} min read · {BYLINE}</p>
        </div>
      </section>

      <section class="post-body-section">
        <div class="container post-body guide-body">
          <div class="guide-answer" role="note"><span class="guide-answer-label">Quick answer</span>{g['quick_answer']}</div>
          {f'<nav class="guide-toc" aria-label="Contents"><span class="guide-toc-label">In this guide</span><ol>{toc_html}</ol></nav>' if len(toc) > 2 else ''}
{body}
          {f'<section class="guide-sources"><h2 id="sources">Sources</h2><ul>{src_html}</ul><p>Prices change. Figures were checked on {fmt_date(g["updated"])}; always check current costs and your own figures before quoting.</p></section>' if sources else ''}
        </div>
      </section>
    </article>

    <div class="container guide-cta-wrap">{cta_block(g.get('cta', 'quote'), g['slug'])}</div>

    {f'<section class="post-more"><div class="container"><span>Related guides</span><div class="post-more-grid">{rel_html}</div></div></section>' if rel_html else ''}
  </main>

{footer}
<script src="/mobile-menu.js"></script>
<script src="/guides/guides.js" defer></script>
</body>
</html>
"""
    os.makedirs(os.path.join(OUT, g["slug"]), exist_ok=True)
    open(os.path.join(OUT, g["slug"], "index.html"), "w", encoding="utf-8").write(page)


def build_hub(guides, header, footer, tools):
    url = f"{SITE}/guides/"
    live = [g for g in guides if g.get("status") != "draft"]
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "Tiling guides", "item": url}]},
        {"@type": "CollectionPage", "name": "Tiling advice and resources", "url": url,
         "hasPart": [{"@type": "Article", "headline": g["h1"], "url": f"{SITE}/guides/{g['slug']}/"} for g in live]}]}
    desc = "Practical guides for UK tilers: labour and day rates, quoting bathrooms, tile wastage and materials, plus free calculators."
    page = head("Tiling Guides: Prices, Quoting & Calculators | TileIQ", desc, url, "website", ld)
    sections = ""
    for cat in CATEGORIES:
        cards = [g for g in live if g["category"] == cat]
        items = "".join(f'<a class="guide-card" href="/guides/{e(g["slug"])}/"><strong>{e(g["h1"])}</strong><span>{e(g["description"])}</span></a>' for g in cards)
        items += "".join(f'<a class="guide-card" href="{e(t[1])}"><strong>{e(t[0])}</strong><span>{e(t[2])}</span></a>' for t in tools if t[3] == cat)
        if items:
            cid = re.sub(r"[^a-z0-9]+", "-", cat.lower()).strip("-")
            sections += f'<section class="guide-cat" id="{cid}"><h2>{e(cat)}</h2><div class="guide-grid">{items}</div></section>'
    nav = "".join(f'<a href="#{re.sub(r"[^a-z0-9]+", "-", c.lower()).strip("-")}">{e(c)}</a>' for c in CATEGORIES
                  if any(g["category"] == c for g in live) or any(t[3] == c for t in tools))
    page += f"""
<body class="features-page guide-page">
{header}
  <main>
    <section class="post-hero">
      <div class="container post-hero-inner">
        <nav class="guide-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>Tiling guides</span></nav>
        <h1>Tiling advice and resources</h1>
        <p class="post-meta">Practical, UK-focused guides for working tilers: pricing, quoting, materials and running the business.</p>
        <nav class="guide-catnav" aria-label="Categories">{nav}</nav>
      </div>
    </section>
    <section class="post-body-section"><div class="container">{sections}</div></section>
    <div class="container guide-cta-wrap">{cta_block('quote', 'hub')}</div>
  </main>
{footer}
<script src="/mobile-menu.js"></script>
<script src="/guides/guides.js" defer></script>
</body>
</html>
"""
    open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(page)


def build_about(header, footer):
    url = f"{SITE}/about/"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
            {"@type": "ListItem", "position": 2, "name": "About", "item": url}]},
        {"@type": "AboutPage", "url": url, "name": "About TileIQ", "mainEntity": AUTHOR},
        dict(AUTHOR, sameAs=["https://www.checkatrade.com/trades/oxfordshiretiling"])]}
    desc = "TileIQ is built by Kevin, a City & Guilds qualified tiler who runs Oxfordshire Tiling in Wantage, to take the late-night admin out of tiling."
    page = head("About TileIQ: Built by a Tiler, for Tilers", desc, url, "website", ld)
    page += f"""
<body class="features-page guide-page">
{header}
  <main>
    <article>
      <section class="post-hero">
        <div class="container post-hero-inner">
          <nav class="guide-crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>About</span></nav>
          <h1>Built by a tiler, for tilers</h1>
          <p class="post-meta">{BYLINE}</p>
        </div>
      </section>
      <section class="post-body-section">
        <div class="container post-body guide-body">
<p>I'm Kevin, a City &amp; Guilds Level 2 qualified tiler based in Wantage, Oxfordshire. I've run my own tiling business, Oxfordshire Tiling, since 2015, doing bathrooms, kitchens, floors and showers for homeowners across south Oxfordshire.</p>
<p>Like most tilers, I'd spend the day on the tools and the evening doing the paperwork: working out tiles and adhesive from scribbled measurements, typing up quotes, sending invoices and chasing payments. Most trade apps are built for every trade, so they leave the tiling maths to you.</p>
<p>So I built my own. TileIQ measures the room, works out the tiles, adhesive, grout and tanking, prices the job from your own rates and sends the quote, then runs the job through to the invoice and the review request. Every feature is built around how tiling work actually happens.</p>
<h2>The guides on this site</h2>
<p>The guides and calculators here are written for working tilers. They're reviewed by me, and every price and figure links to its source, so you can check it.</p>
<h2>Get in touch</h2>
<p>If you've got a question, a feature you'd like or a correction to one of the guides, email <a href="mailto:info@tile-iq.com">info@tile-iq.com</a> or call 0800 246 1951. You can see reviews of my tiling work on <a href="https://www.checkatrade.com/trades/oxfordshiretiling" rel="noopener" target="_blank">Checkatrade</a>.</p>
        </div>
      </section>
    </article>
    <div class="container guide-cta-wrap">{cta_block('business', 'about')}</div>
  </main>
{footer}
<script src="/mobile-menu.js"></script>
</body>
</html>
"""
    os.makedirs(os.path.join(ROOT, "about"), exist_ok=True)
    open(os.path.join(ROOT, "about", "index.html"), "w", encoding="utf-8").write(page)


def update_sitemap(guides):
    p = os.path.join(ROOT, "sitemap.xml")
    s = open(p, encoding="utf-8").read()
    s = re.sub(r"\s*<url><loc>https://tile-iq\.com/guides/[^<]*</loc>.*?</url>", "", s, flags=re.S)
    live = [g for g in guides if g.get("status") != "draft"]
    entries = "".join(f"\n  <url><loc>{SITE}/guides/{g['slug']}/</loc><lastmod>{g['updated']}</lastmod><priority>0.7</priority></url>" for g in live)
    if live:
        newest = max(g["updated"] for g in live)
        entries = f"\n  <url><loc>{SITE}/guides/</loc><lastmod>{newest}</lastmod><priority>0.8</priority></url>" + entries
    if f"{SITE}/about/" not in s:
        entries += f"\n  <url><loc>{SITE}/about/</loc><priority>0.6</priority></url>"
    s = s.replace("</urlset>", entries + "\n</urlset>")
    open(p, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    guides = read_guides()
    by_slug = {g["slug"]: g for g in guides}
    header, footer = site_chrome()
    # Calculators listed on the hub: (name, url, description, category)
    tools = json.load(open(os.path.join(SRC, "tools.json"), encoding="utf-8")) if os.path.exists(os.path.join(SRC, "tools.json")) else []
    for g in guides:
        build_guide(g, by_slug, header, footer)
    build_hub(guides, header, footer, tools)
    build_about(header, footer)
    update_sitemap(guides)
    print(f"built {len(guides)} guide(s) ({sum(1 for g in guides if g.get('status') == 'draft')} draft) + hub")
