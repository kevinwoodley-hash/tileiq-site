"""Generates the five calculator pages on tile-iq.com from one template:
/tiling-material-calculator/ (the main 'tile calculator' page), /floor-tiling-calculator/,
/wall-tiling-calculator/, /tiling-day-rate-calculator/ and /tiling-labour-cost-calculator/.

Header and footer are taken from the current material calculator page so they match the site.
Run from the site root:  python3 guides-src/calculators.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://tile-iq.com"
base = open(os.path.join(ROOT, "tiling-material-calculator/index.html"), encoding="utf-8").read()
# The header comes from whichever calculator page was generated last, so clear its
# "current page" marker; page() sets it again for each slug.
HEADER = base[base.index("<body"):base.index("  <main>")].replace(' aria-current="page"', "")
FOOTER = base[base.index("  <footer>"):base.index("<script src=\"/mobile-menu.js\"></script>")]

def page(slug, title, desc, crumb, kicker, h1, intro, calc_html, sections, script, app_name="", features=(), faqs=()):
    url = f"{SITE}/{slug}/"
    graph = [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Guides", "item": SITE + "/guides/"},
            {"@type": "ListItem", "position": 3, "name": crumb, "item": url}]},
        {"@type": "WebPage", "@id": url + "#webpage", "url": url, "name": title, "description": desc,
         "isPartOf": {"@id": SITE + "/#website"}, "about": {"@id": SITE + "/#organization"},
         "mainEntity": {"@id": url + "#calculator"}},
        # The free calculator on the page itself. No ratings: there are none to show.
        {"@type": "WebApplication", "@id": url + "#calculator", "name": app_name or crumb, "url": url + "#calculator",
         "description": desc, "applicationCategory": "UtilitiesApplication", "operatingSystem": "Any",
         "browserRequirements": "Requires JavaScript", "isAccessibleForFree": True, "inLanguage": "en-GB",
         "offers": {"@type": "Offer", "price": "0", "priceCurrency": "GBP"},
         "provider": {"@id": SITE + "/#organization"},
         **({"featureList": list(features)} if features else {})}]
    if faqs:   # only questions that are shown on the page, word for word
        graph.append({"@type": "FAQPage", "@id": url + "#faq", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", a)}}
            for q, a in faqs]})
    ld = {"@context": "https://schema.org", "@graph": graph}
    header = HEADER.replace(f'<a href="/{slug}/">', f'<a href="/{slug}/" aria-current="page">', 1)
    if faqs:
        sections = sections + faq_section(faqs)
    app = f"/app/?tq_src=calc-{slug}&tq_med=calculator"   # not UTM tags: see cta_block in build.py
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
  <meta name="description" content="{desc}" />
  <title>{title}</title>
  <link rel="canonical" href="{url}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="TileIQ" />
  <meta property="og:url" content="{url}" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{desc}" />
  <meta property="og:image" content="https://tile-iq.com/images/og-image.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/site.css" />
  <script type="application/ld+json">
{json.dumps(ld, indent=2, ensure_ascii=False)}
  </script>
</head>
{header}  <main>
    <section class="features-hero calc-hero">
      <div class="container">
        <p class="calc-crumbs"><a href="/">Home</a> › <a href="/guides/">Guides</a> › <span>{crumb}</span></p>
        <span class="kicker">{kicker}</span>
        <h1>{h1}</h1>
        <p class="calc-intro">{intro}</p>
      </div>
    </section>

    <section class="feature-category" id="calculator">
      <div class="container">
        <div class="calc-box" data-calc="{slug}">
{calc_html}
        </div>
      </div>
    </section>
{sections}
    <section class="cta-section">
      <div class="container cta-card">
        <div><h2>Use your rates on every real quote.</h2><p>Try the real TileIQ app free. No sign-up needed, and you can send unlimited quotes free for 2 weeks.</p>
          <p class="calc-demo-link">Just looking? <a href="/app/demo" data-cta-kind="demo">Try the demo</a> (no account, nothing saved).</p></div>
        <a class="btn btn-dark" href="{app}" data-cta-kind="app">Try TileIQ free →</a>
      </div>
    </section>
  </main>

{FOOTER}<script src="/mobile-menu.js"></script>
<script src="/site.js" defer></script>
<script>
(() => {{
  const $ = id => document.getElementById(id);
  const num = id => {{ const v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; }};   // blanks and negatives count as 0
  const gbp = n => '£' + Math.round(n).toLocaleString('en-GB');
  const gbp2 = n => '£' + n.toLocaleString('en-GB', {{minimumFractionDigits: 2, maximumFractionDigits: 2}});
  const box = document.querySelector('.calc-box');
  let used = false;
  // Anonymous events only (no values entered); analytics only exist after consent.
  function track(name, props) {{
    try {{ if (typeof window.gtag === 'function') window.gtag('event', name, props); }} catch (e) {{}}
    try {{ if (window.posthog && window.posthog.__loaded) window.posthog.capture(name, props); }} catch (e) {{}}
  }}
  document.addEventListener('click', ev => {{
    const a = ev.target.closest && ev.target.closest('[data-cta-kind]');
    if (a) track('calculator_cta_click', {{ calculator: box.dataset.calc, cta_kind: a.dataset.ctaKind }});
  }}, true);
{script}
  // calculator_used = first change; calculator_completed = changed at least two different inputs and
  // then paused for 4 seconds (i.e. they put in their own numbers and read the result). Once per visit.
  const changed = new Set(); let done = false, idle;
  box.querySelectorAll('input,select').forEach(el => el.addEventListener('input', () => {{
    calc();
    if (!used) {{ used = true; track('calculator_used', {{ calculator: box.dataset.calc }}); }}
    changed.add(el.id); clearTimeout(idle);
    if (!done && changed.size >= 2) idle = setTimeout(() => {{ done = true; track('calculator_completed', {{ calculator: box.dataset.calc, inputs_changed: changed.size }}); }}, 4000);
  }}));
  calc();
}})();
</script>
</body>
</html>
"""

def row(id_, label, value, step="1", extra=""):
    return f'''          <div class="calc-row"><label for="{id_}">{label}</label><input type="number" id="{id_}" value="{value}" min="0" step="{step}" inputmode="decimal"{extra}></div>'''

def group(t):
    return f'          <h2 class="calc-group">{t}</h2>'

def res(id_, label, big=False):
    cls = ' class="calc-big"' if big else ""
    return f'            <div{cls}><span>{label}</span><b id="{id_}">–</b></div>'

def section(num, kicker, h2, p, articles=""):
    return f"""
    <section class="feature-category">
      <div class="container">
        <div class="feature-category-heading">
          <span class="category-num">{num}</span>
          <div><span class="kicker">{kicker}</span><h2>{h2}</h2><p>{p}</p></div>
        </div>{f'''
        <div class="feature-detail-grid">{articles}</div>''' if articles else ''}
      </div>
    </section>"""

def prose(html):
    """A plain article block (headings, lists, tables) using the site's post-body styles."""
    return f"""
    <section class="post-body-section calc-guide">
      <div class="container post-body">
{html}
      </div>
    </section>"""

def table(head, rows, caption=""):
    th = "".join(f"<th{' class=\"num\"' if i else ''}>{h}</th>" for i, h in enumerate(head))
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    cap = f"<caption>{caption}</caption>" if caption else ""
    return f'<div class="post-table-wrap"><table>{cap}<thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'

def faq_section(faqs):
    items = "\n".join(f'          <details><summary>{q}</summary><p>{a}</p></details>' for q, a in faqs)
    return f"""
    <section class="post-body-section calc-faq" id="faq">
      <div class="container post-body">
        <h2>Frequently asked questions</h2>
        <div class="guide-faq">
{items}
        </div>
      </div>
    </section>"""

# ── Material calculator (upgrade of the existing page, same URL) ─────────────
mat_calc = "\n".join([
    group("Area and tiles"),
    row("calc-area", "Area to tile (m²)", "35", "0.1"),
    '''          <div class="calc-row"><label for="calc-layout">Layout</label><select id="calc-layout"><option value="10" selected>Straight (10%)</option><option value="15">Diagonal (15%)</option><option value="25">Herringbone (25%)</option></select></div>''',
    row("calc-waste", "Wastage allowance (%)", "10"),
    row("calc-tile-l", "Tile length (mm)", "600"),
    row("calc-tile-w", "Tile width (mm)", "300"),
    row("calc-box-m2", "m² per box (optional)", "", "0.01", ' placeholder="e.g. 1.44"'),
    group("Adhesive"),
    '''          <div class="calc-row"><label for="calc-adh-type">Tile and bed</label><select id="calc-adh-type"><option value="2">Mosaic, small (2 kg)</option><option value="3" selected>Standard (3 kg)</option><option value="5">Large format (5 kg)</option><option value="">Custom</option></select></div>''',
    row("calc-adh-rate", "Adhesive (kg per m²)", "3", "0.1"),
    row("calc-adh-bag", "Adhesive bag size (kg)", "20"),
    group("Grout"),
    row("calc-joint", "Joint width (mm)", "3", "0.5"),
    row("calc-thick", "Tile thickness (mm)", "9", "0.5"),
    row("calc-grout-bag", "Grout bag size (kg)", "2.5", "0.5"),
    '          <div class="calc-results">',
    res("res-tile-area", "Tile area to buy (with wastage)"),
    res("res-boxes", "Boxes"),
    res("res-tile-count", "Approx. number of tiles"),
    res("res-adhesive", "Adhesive"),
    res("res-grout", "Grout"),
    res("res-cost", "Materials cost"),
    '            <p class="calc-working" id="res-working" aria-live="polite"></p>',
    '            <p class="calc-copy-row"><button type="button" class="calc-copy" id="calc-copy">Copy results</button><span id="calc-copied" role="status"></span></p>',
    '          </div>',
    # After the results, so on phones the answer comes before the optional extras
    group("Prices (optional)"),
    row("calc-price-m2", "Tile price (£ per m²)", "", "0.01"),
    row("calc-price-box", "Or tile price (£ per box)", "", "0.01"),
    row("calc-price-adh", "Adhesive (£ per bag)", "", "0.01"),
    row("calc-price-grout", "Grout (£ per bag)", "", "0.01"),
    '          <p class="calc-note">Planning estimates only. Adhesive figures are typical manufacturer consumption rates (e.g. Mapei Adesilex P9); grout uses the standard formula (L+W)/(L×W) × joint width × tile thickness × 1.6. Always check the data sheet for the product you are using.</p>',
])
mat_script = """
  // Round up, ignoring floating-point noise (18 m² × 1.1 ÷ 0.18 is 110.00000000000001: that's 110 tiles)
  const up = x => Math.ceil(x - 1e-9);
  const n = (x, d) => (+x.toFixed(d)).toLocaleString('en-GB');   // trims trailing zeros: 0.18, 38.5
  $('calc-layout').addEventListener('change', () => { $('calc-waste').value = $('calc-layout').value; });
  $('calc-adh-type').addEventListener('change', () => { if ($('calc-adh-type').value) $('calc-adh-rate').value = $('calc-adh-type').value; });
  let summary = '';
  function calc() {
    const area = num('calc-area'), waste = num('calc-waste'), L = num('calc-tile-l'), W = num('calc-tile-w');
    const boxM2 = num('calc-box-m2'), adhRate = num('calc-adh-rate'), adhBag = num('calc-adh-bag') || 1;
    const joint = num('calc-joint'), thick = num('calc-thick'), groutBag = num('calc-grout-bag') || 1;
    const buy = area * (1 + waste / 100);
    const tileM2 = (L / 1000) * (W / 1000);
    const tiles = tileM2 > 0 ? up(buy / tileM2) : 0;
    const boxes = boxM2 > 0 ? up(buy / boxM2) : 0;
    const adhKg = area * adhRate, adhBags = up(adhKg / adhBag);
    const groutPerM2 = L > 0 && W > 0 ? ((L + W) / (L * W)) * joint * thick * 1.6 : 0;
    const groutKg = area * groutPerM2 * 1.1, groutBags = up(groutKg / groutBag);
    const boxesTxt = boxM2 > 0 ? boxes + ' boxes (' + (boxes * boxM2).toFixed(2) + ' m²)' : 'enter m² per box';
    const adhTxt = adhKg.toFixed(0) + ' kg (' + adhBags + ' × ' + adhBag + ' kg)';
    const groutTxt = groutKg.toFixed(1) + ' kg (' + groutBags + ' × ' + groutBag + ' kg)';
    $('res-tile-area').textContent = buy.toFixed(2) + ' m²';
    $('res-boxes').textContent = boxesTxt;
    $('res-tile-count').textContent = tiles ? tiles + ' tiles' : '–';
    $('res-adhesive').textContent = adhTxt;
    $('res-grout').textContent = groutTxt;

    // Optional prices. Tiles are bought in whole boxes when the box size is known.
    const pM2 = num('calc-price-m2'), pBox = num('calc-price-box'), pAdh = num('calc-price-adh'), pGrout = num('calc-price-grout');
    const tileCost = pBox > 0 ? (boxM2 > 0 ? boxes * pBox : null) : pM2 > 0 ? (boxM2 > 0 ? boxes * boxM2 : buy) * pM2 : 0;
    const adhCost = pAdh * adhBags, groutCost = pGrout * groutBags;
    const priced = pM2 > 0 || pBox > 0 || pAdh > 0 || pGrout > 0;
    let costTxt = 'add prices (optional)';
    if (tileCost === null) costTxt = 'enter m² per box';
    else if (priced) costTxt = gbp2(tileCost + adhCost + groutCost);
    $('res-cost').textContent = costTxt;

    // The working, so every number can be checked (it matches the worked examples below)
    const work = [];
    if (area) work.push(n(area, 2) + ' m² + ' + n(waste, 1) + '% wastage = ' + buy.toFixed(2) + ' m² to buy');
    if (area && tileM2) work.push(buy.toFixed(2) + ' ÷ ' + n(tileM2, 4) + ' m² per tile = ' + n(buy / tileM2, 1) + ', so ' + tiles + ' tiles');
    if (area && boxM2) work.push(buy.toFixed(2) + ' ÷ ' + n(boxM2, 2) + ' m² per box = ' + n(buy / boxM2, 2) + ', so ' + boxes + ' boxes');
    if (area) work.push(n(area, 2) + ' m² × ' + n(adhRate, 1) + ' kg adhesive = ' + adhKg.toFixed(0) + ' kg');
    if (area && groutPerM2) work.push(n(groutPerM2, 3) + ' kg grout per m² × ' + n(area, 2) + ' m² + 10% = ' + groutKg.toFixed(1) + ' kg');
    if (priced && tileCost !== null) work.push('Tiles ' + gbp2(tileCost) + ' + adhesive ' + gbp2(adhCost) + ' + grout ' + gbp2(groutCost));
    $('res-working').textContent = work.join('\\n');

    summary = ['Tile calculator (tile-iq.com)',
      'Area: ' + n(area, 2) + ' m², ' + n(L, 0) + ' × ' + n(W, 0) + ' mm tiles, ' + n(waste, 1) + '% wastage',
      'Tile area to buy: ' + buy.toFixed(2) + ' m²', 'Boxes: ' + boxesTxt, 'Tiles: ' + (tiles || '–'),
      'Adhesive: ' + adhTxt, 'Grout: ' + groutTxt].concat(priced ? ['Materials cost: ' + costTxt] : [])
      .concat(['Estimates only: check the data sheets for the products you use.']).join('\\n');
  }
  // Copy results: plain text for a quote, a supplier order or a message
  $('calc-copy').addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(summary); ok = true; } catch (e) {
      const t = document.createElement('textarea'); t.value = summary; t.setAttribute('readonly', '');
      t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
      try { ok = document.execCommand('copy'); } catch (e2) {}
      t.remove();
    }
    $('calc-copied').textContent = ok ? 'Copied' : 'Copy failed: select the results and copy them by hand';
    setTimeout(() => { $('calc-copied').textContent = ''; }, 3000);
    track('calculator_results_copied', { calculator: box.dataset.calc });
  });"""

mat_guide = prose("""        <h2 id="how-to-calculate">How to work out how many tiles you need</h2>
        <p>You need three things: the area you're tiling, the size of the tile, and how much extra to allow for cuts and breakages.</p>
        <ol>
          <li><strong>Measure the area in m².</strong> Multiply the length by the width of a floor, or the width by the tiled height of a wall. Split awkward rooms into rectangles and add them up, then take off anything you won't tile.</li>
          <li><strong>Add wastage.</strong> Multiply the area by 1.10 for 10%, 1.15 for 15%, and so on. This is the tile area to buy.</li>
          <li><strong>Divide by the size of one tile</strong> to get the number of tiles, or by the m² in a box to get the number of boxes.</li>
          <li><strong>Round up to full boxes</strong>, and order them all from the same batch so the shade matches.</li>
        </ol>
        <p>If you're measuring a room rather than typing in an area, the <a href="/floor-tiling-calculator/">floor tile calculator</a> works it out from the length and width, and the <a href="/wall-tiling-calculator/">wall tile calculator</a> takes off doors and windows for you.</p>

        <h2 id="worked-example">Worked example: a 12 m² floor in 600 × 600 mm tiles</h2>
        <p>A 12 m² floor, laid straight with 10% wastage, in 600 × 600 mm porcelain that's 9 mm thick, with 3 mm joints. The tiles come in boxes of 1.44 m² (four tiles), and they're large format on a floor, so the adhesive is 5 kg per m².</p>
        """ + table(["Step", "Working", "Result"], [
            ["Tile area to buy", "12 m² × 1.10", "13.20 m²"],
            ["Size of one tile", "0.6 m × 0.6 m", "0.36 m²"],
            ["Number of tiles", "13.20 ÷ 0.36 = 36.7, rounded up", "37 tiles"],
            ["Boxes", "13.20 ÷ 1.44 = 9.17, rounded up", "10 boxes (14.40 m², 40 tiles)"],
            ["Adhesive", "12 m² × 5 kg", "60 kg (3 × 20 kg bags)"],
            ["Grout", "0.144 kg per m² × 12 m², plus 10%", "1.9 kg (1 × 2.5 kg bag)"],
        ]) + """
        <p>Put the same figures into the calculator above and you'll get the same answer. Adhesive and grout are worked out on the area you're actually tiling, not the extra tile you buy for wastage.</p>

        <h2 id="worked-example-walls">Worked example: 18 m² of bathroom walls in 600 × 300 mm tiles</h2>
        <p>Bathroom walls, laid straight with 10% wastage, in 600 × 300 mm ceramic that's 8 mm thick, with 2 mm joints. The tiles come in boxes of 1.08 m² (six tiles). They're standard wall tiles, so the adhesive is 3 kg per m², the top of Mapei's 2.5–3 kg range for normal size tiles.</p>
        """ + table(["Step", "Working", "Result"], [
            ["Tile area to buy", "18 m² × 1.10", "19.80 m²"],
            ["Size of one tile", "0.6 m × 0.3 m", "0.18 m²"],
            ["Number of tiles", "19.80 ÷ 0.18 = 110", "110 tiles"],
            ["Boxes", "19.80 ÷ 1.08 = 18.33, rounded up", "19 boxes (20.52 m², 114 tiles)"],
            ["Adhesive", "18 m² × 3 kg", "54 kg (3 × 20 kg bags)"],
            ["Grout", "0.128 kg per m² × 18 m², plus 10%", "2.5 kg (2 × 2.5 kg bags)"],
        ]) + """
        <p>The grout comes to 2.53 kg, just over one 2.5 kg bag, so the calculator rounds up to two. Walls and floors usually use different tiles and adhesive, so work them out separately and add the results together.</p>

        <h2 id="tiles-per-m2">How many tiles are in a square metre?</h2>
        <p>Convert the tile size to metres and multiply, which gives the area of one tile. Then divide 1 by that. A 600 × 300 mm tile is 0.6 × 0.3 = 0.18 m², so there are 1 ÷ 0.18 = 5.56 tiles in a square metre.</p>
        """ + table(["Tile size", "Area of one tile", "Tiles per m²"], [
            ["100 × 100 mm", "0.01 m²", "100"],
            ["300 × 300 mm", "0.09 m²", "11.1"],
            ["600 × 300 mm", "0.18 m²", "5.56"],
            ["600 × 600 mm", "0.36 m²", "2.78"],
            ["1200 × 600 mm", "0.72 m²", "1.39"],
        ]) + """
        <p>This ignores the grout joints, so the real number laid is slightly lower. That's why it's better to buy by the box and treat the tile count as a check.</p>

        <h2 id="wastage">How much wastage to allow</h2>
        <p>Every job loses tile to cuts, breakages and the odd bad tile in a box. These are the usual UK allowances, and they're what the layout setting in the calculator fills in:</p>
        """ + table(["Layout", "Wastage to add"], [
            ["Straight lay (grid or brick bond)", "10%"],
            ["Diagonal", "15%"],
            ["Herringbone or chevron", "20–25% (the calculator uses 25%)"],
        ]) + """
        <p>Go higher for large-format tiles, small rooms with lots of corners and boxing, patterned tiles that need matching, and fragile tiles like natural stone. The <a href="/guides/tile-wastage-and-materials/">tile wastage guide</a> goes through each case, and there's more on pricing the extra time and tile in <a href="/guides/how-to-price-herringbone-tiling/">how to price herringbone tiling</a> and <a href="/guides/how-to-price-large-format-porcelain-tiling/">how to price large-format porcelain</a>.</p>

        <h2 id="adhesive">How much tile adhesive you need</h2>
        <p>Adhesive depends on the tile and the trowel. Mapei's data sheet for a standard cement-based adhesive (Adesilex P9) gives about 2 kg per m² for mosaics, 2.5–3 kg per m² for standard tiles, and about 5 kg per m² for large-format tiles and external floors. A 20 kg bag covers roughly 6–7.5 m² with a 6 mm notched trowel, or 4–5 m² with a 10 mm one.</p>
        <p>So 10 m² of standard wall tiles at 3 kg per m² needs 30 kg, which is two 20 kg bags. Choose the tile type in the calculator to fill in the rate, or type in the figure from your adhesive's data sheet. For coverage by trowel size, worked examples and an adhesive calculator, see <a href="/guides/tile-adhesive-coverage/">how much tile adhesive you need per m²</a>.</p>

        <h2 id="grout">How much grout you need</h2>
        <p>Grout depends on the tile size, its thickness and the joint width. The calculator uses the formula most grout manufacturers publish, with all sizes in mm:</p>
        <p><strong>(tile length + tile width) ÷ (tile length × tile width) × joint width × tile thickness × 1.6 = kg per m²</strong></p>
        <p>For 600 × 600 mm tiles, 9 mm thick with 3 mm joints, that's 1200 ÷ 360,000 × 3 × 9 × 1.6 = 0.144 kg per m². The same joint on 100 × 100 mm tiles uses 0.864 kg per m², six times as much. The calculator adds 10% for waste. Always check the coverage on the bag of the grout you're using.</p>

        <h2 id="more-calculators">Pricing the job as well?</h2>
        <p>Once you know the materials, the <a href="/tiling-labour-cost-calculator/">tiling labour calculator</a> prices the labour for walls, floors and extras like tanking and levelling. Tilers can do all of it in the <a href="/app/demo" data-cta-kind="demo">TileIQ online app</a>, which works out materials for every wall and floor on a job and puts them into the quote.</p>""")

mat_faqs = [
    ("How many tiles do I need for 10m²?",
     "With 10% wastage for a straight lay, you need to buy 11 m² of tile. That's 31 tiles at 600 × 600 mm, 62 tiles at 600 × 300 mm, or 123 tiles at 300 × 300 mm. Round up to full boxes, and allow more wastage for a diagonal or herringbone layout."),
    ("How do I calculate tiles for a bathroom?",
     "Work out the walls and the floor separately, because they usually use different tiles and adhesive. For the walls, add up the width of each wall you're tiling, multiply by the tiled height, and take off the door and window. For the floor, multiply the length by the width and take off anything that sits on an untiled area, like a bath. Add wastage to each, then round each up to full boxes. The <a href=\"/wall-tiling-calculator/\">wall tile calculator</a> and <a href=\"/floor-tiling-calculator/\">floor tile calculator</a> do the take-offs for you."),
    ("How much extra should I allow for wastage?",
     "Allow 10% for a straight lay, 15% for diagonal and 20–25% for herringbone. Go to the top of the range or above it for large-format tiles, small or awkward rooms, and patterned or fragile tiles."),
    ("How many 600 × 600mm tiles are in 1m²?",
     "2.78. One 600 × 600 mm tile covers 0.36 m², and 1 ÷ 0.36 = 2.78. In practice, buy by the box: boxes of 600 × 600 mm tiles usually hold three or four tiles (1.08 or 1.44 m²), so check the label."),
    ("How much tile adhesive do I need?",
     "Allow about 3 kg per m² for standard tiles, 2 kg per m² for mosaics and 5 kg per m² for large-format tiles and floors. That means 10 m² of standard tiles needs about 30 kg, or two 20 kg bags. Check the data sheet for the adhesive you're using, as coverage changes with the trowel size."),
]

mat_sections = mat_guide + \
    section("01", "DOING THIS ON A REAL JOB", "Want TileIQ to calculate this automatically on every job?",
    "On a real job, TileIQ works out tiles, adhesive, grout, sealant and tanking for every wall and floor from the measurements you take, and puts them straight into the quote.",
    """<article><h3>From measurement to quote</h3><p>Material calculations feed straight into a professional quote you can send from site, using TileIQ's <a href="/tiling-estimating-software/">tiling estimating software</a>.</p><a href="/tiling-quote-app/">See the quote app →</a></article>
          <article><h3>Leica Disto™ integration</h3><p>Connect a compatible Leica Disto by Bluetooth for fast, accurate measurements.</p><a href="/leica-disto-tiling/">See how it works →</a></article>
          <article><h3>Measuring a floor or walls?</h3><p>Enter room or wall sizes instead of the area, with doors and units taken off.</p><a href="/floor-tiling-calculator/">Floor calculator →</a> <a href="/wall-tiling-calculator/">Wall calculator →</a></article>""")

# ── Day-rate calculator ──────────────────────────────────────────────────────
day_calc = "\n".join([
    group("What you need to earn"),
    row("dr-income", "Income you want before tax (£ a year)", "45000", "500"),
    row("dr-costs", "Insurance, tools, phone, software (£ a year)", "1000", "50"),
    row("dr-miles", "Business miles a year", "8000", "500"),
    row("dr-rate", "Vehicle cost per mile (£)", "0.55", "0.01"),
    row("dr-other", "Other business costs (£ a year)", "0", "50"),
    group("Days you can bill"),
    row("dr-hol", "Holidays and bank holidays (days)", "28"),
    row("dr-admin", "Quoting, admin, collecting materials (days)", "20"),
    row("dr-lost", "Sickness, weather, gaps between jobs (days)", "12"),
    group("How much you lay"),
    row("dr-walls", "Walls laid per day (m²)", "12", "0.5"),
    row("dr-floors", "Floors laid per day (m²)", "10", "0.5"),
    row("dr-hours", "Hours per working day", "8", "0.5"),
    '          <div class="calc-results">',
    res("dr-res-total", "Total you need to bill a year"),
    res("dr-res-days", "Days you can bill"),
    res("dr-res-day", "Your day rate", True),
    res("dr-res-hour", "Hourly equivalent"),
    res("dr-res-walls", "Per m² on walls"),
    res("dr-res-floors", "Per m² on floors"),
    '          </div>',
    '          <p class="calc-vat" id="dr-vat" hidden>This turnover is over the £90,000 VAT registration threshold. You would need to register for VAT and add it to your prices.</p>',
    '          <p class="calc-note">Example starting values. 55p a mile is HMRC\'s simplified mileage rate for the first 10,000 business miles from 6 April 2026; use your real vehicle costs if they are higher. UK tilers typically charge £200–£350 a day (Checkatrade, 2026). This is a guide, not tax advice.</p>',
])
day_script = """
  function calc() {
    const total = num('dr-income') + num('dr-costs') + num('dr-miles') * num('dr-rate') + num('dr-other');
    const days = Math.max(0, 260 - num('dr-hol') - num('dr-admin') - num('dr-lost'));
    const day = days > 0 ? total / days : 0;
    $('dr-res-total').textContent = gbp(total);
    $('dr-res-days').textContent = days + ' days';
    $('dr-res-day').textContent = days > 0 ? gbp(day) : '–';
    $('dr-res-hour').textContent = days > 0 && num('dr-hours') > 0 ? gbp2(day / num('dr-hours')) : '–';
    $('dr-res-walls').textContent = num('dr-walls') > 0 && days > 0 ? gbp2(day / num('dr-walls')) : '–';
    $('dr-res-floors').textContent = num('dr-floors') > 0 && days > 0 ? gbp2(day / num('dr-floors')) : '–';
    $('dr-vat').hidden = total <= 90000;
  }"""
day_sections = section("01", "HOW IT WORKS", "Day rate = what you need ÷ the days you can bill",
    "Add the income you want to your yearly business costs, then divide by the days you can actually bill. Start from 260 weekdays and take off holidays, quoting and admin days, and time lost to sickness, weather and gaps between jobs. Most self-employed tilers end up with around 200 billable days. Dividing the day rate by how much you lay gives a per m² rate. Checkatrade's typical output is 10–15 m² a day on walls and 8–12 m² on floors.",
    """<article><h3>Step-by-step guide</h3><p>The full method, with a worked example and what to include in your costs.</p><a href="/guides/self-employed-tiler-day-rate/">Read the day-rate guide →</a></article>
          <article><h3>Compare with the going rate</h3><p>Typical UK per m², day and hourly rates, and what affects them.</p><a href="/guides/tiling-labour-rates-uk/">How much does a tiler charge? →</a></article>
          <article><h3>Price a job</h3><p>Turn your rates into a labour price for walls, floors and extras.</p><a href="/tiling-labour-cost-calculator/">Labour calculator →</a></article>""")

# ── Labour cost calculator ───────────────────────────────────────────────────
lab_calc = "\n".join([
    group("Areas"),
    row("lc-walls", "Wall tiling (m²)", "20", "0.1"),
    row("lc-floors", "Floor tiling (m²)", "5", "0.1"),
    group("Your rates"),
    row("lc-wrate", "Wall labour rate (£ per m²)", "50", "0.5"),
    row("lc-frate", "Floor labour rate (£ per m²)", "50", "0.5"),
    row("lc-min", "Minimum charge (£)", "0", "10"),
    group("Extras (optional)"),
    row("lc-strip", "Strip-out and making good (£)", "0", "10"),
    row("lc-tank", "Tanking (£)", "0", "10"),
    row("lc-lev-m2", "Levelling (m²)", "0", "0.1"),
    row("lc-lev-rate", "Levelling rate (£ per m²)", "25", "0.5"),
    row("lc-other", "Trims, sealing, other (£)", "0", "10"),
    group("Check against your day rate"),
    row("lc-wout", "Walls laid per day (m²)", "8", "0.5"),
    row("lc-fout", "Floors laid per day (m²)", "8", "0.5"),
    row("lc-dayrate", "Your day rate (£)", "300", "5"),
    '''          <div class="calc-row"><label for="lc-vat">Add VAT (20%)?</label><select id="lc-vat"><option value="0" selected>No</option><option value="1">Yes</option></select></div>''',
    '          <div class="calc-results">',
    res("lc-res-tiling", "Tiling labour"),
    res("lc-res-extras", "Extras"),
    res("lc-res-total", "Labour total", True),
    res("lc-res-vat", "Including VAT"),
    res("lc-res-days", "Estimated days on site"),
    res("lc-res-perday", "Earns per day"),
    '          </div>',
    '          <p class="calc-check" id="lc-check"></p>',
    '          <p class="calc-note">Labour only: tiles, adhesive and grout are extra (see the <a href="/tiling-material-calculator/">material calculator</a>). Starting values are examples: about £50/m² labour and £200–£350 a day are typical UK figures (Checkatrade, 2026). Use your own rates.</p>',
])
lab_script = """
  function calc() {
    const tiling = Math.max(num('lc-walls') * num('lc-wrate') + num('lc-floors') * num('lc-frate'), num('lc-min'));
    const extras = num('lc-strip') + num('lc-tank') + num('lc-lev-m2') * num('lc-lev-rate') + num('lc-other');
    const total = tiling + extras;
    const days = (num('lc-wout') > 0 ? num('lc-walls') / num('lc-wout') : 0) + (num('lc-fout') > 0 ? num('lc-floors') / num('lc-fout') : 0);
    const shown = Math.max(0.5, Math.ceil(days * 2) / 2);
    $('lc-res-tiling').textContent = gbp(tiling);
    $('lc-res-extras').textContent = gbp(extras);
    $('lc-res-total').textContent = gbp(total);
    $('lc-res-vat').textContent = $('lc-vat').value === '1' ? gbp(total * 1.2) : 'not added';
    $('lc-res-days').textContent = days > 0 ? shown + (shown === 1 ? ' day' : ' days') + ' tiling' : '–';
    const perDay = days > 0 ? tiling / shown : 0;
    $('lc-res-perday').textContent = days > 0 ? gbp(perDay) : '–';
    const dr = num('lc-dayrate'), c = $('lc-check');
    if (!days || !dr) { c.textContent = ''; c.className = 'calc-check'; return; }
    const diff = perDay / dr - 1;
    if (diff < -0.1) { c.textContent = 'This works out ' + Math.round(-diff * 100) + '% below your day rate. Consider a higher per m² rate or a minimum charge.'; c.className = 'calc-check low'; }
    else if (diff > 0.25) { c.textContent = 'This works out ' + Math.round(diff * 100) + '% above your day rate. Check it is competitive for the job.'; c.className = 'calc-check high'; }
    else { c.textContent = 'In line with your day rate.'; c.className = 'calc-check ok'; }
  }"""
lab_example = prose("""        <h2 id="worked-example">Worked example: pricing the labour for a bathroom</h2>
        <p>A bathroom with 18 m² of wall tiles at £45 per m² and a 4 m² floor at £50 per m². The shower needs tanking (£250), the floor needs levelling (4 m² at £25 per m²) and the trims and sealing come to £60. You lay about 8 m² a day on walls and floors, and your day rate is £300.</p>
        """ + table(["Step", "Working", "Result"], [
            ["Tiling labour", "18 m² × £45 + 4 m² × £50", "£1,010"],
            ["Extras", "£250 tanking + 4 m² × £25 levelling + £60 trims and sealing", "£410"],
            ["Labour total", "£1,010 + £410", "£1,420"],
            ["Days tiling", "18 ÷ 8 + 4 ÷ 8 = 2.75, rounded up to the half day", "3 days"],
            ["Earns per day", "£1,010 ÷ 3 days", "£337"],
        ]) + """
        <p>£337 a day is in line with a £300 day rate, so the price works. Put the same figures into the calculator above and you'll get the same answer. The extras are left out of the per day figure on purpose: tanking and levelling have their own costs and drying time, so they're priced on their own.</p>
        <p>On a small job the sum often comes out well below your day rate, because the setting up and cutting take as long as on a big one. That's what the minimum charge is for. For a full bathroom quote with materials, see <a href="/guides/how-to-quote-bathroom-tiling/">how to quote a bathroom tiling job</a>.</p>""")

lab_sections = lab_example + section("01", "HOW IT WORKS", "Price the labour, then check it against your day rate",
    "Multiply each area by your per m² rate and add any extras priced separately, such as strip-out, tanking and levelling. Then work out how many days the tiling will take from how much you lay a day. Dividing the tiling price by those days shows what the job really earns per day. If it falls well short of your day rate, the job needs a higher rate or a minimum charge. That's common for small bathrooms with lots of cuts.",
    """<article><h3>Quoting a bathroom</h3><p>A step-by-step guide with a worked example for a 2.5 × 2 m bathroom.</p><a href="/guides/how-to-quote-bathroom-tiling/">Read the guide →</a></article>
          <article><h3>Work out your day rate</h3><p>Find the rate that covers your costs and time off.</p><a href="/tiling-day-rate-calculator/">Day-rate calculator →</a></article>
          <article><h3>Going rates</h3><p>What UK tilers charge per m², per day and per hour, and what typical jobs cost.</p><a href="/guides/tiling-labour-rates-uk/">How much does a tiler charge? →</a></article>""")

# ── Floor and wall calculators: the material calculator's maths, with the area worked out from
# measurements instead of typed in. Same tile, adhesive and grout formulas as above.
def tile_calc(area_rows, area_js, tile_l, tile_w, adh_opts, adh_default, waste_opts, waste_default, note):
    html = "\n".join([group("Measurements")] + area_rows + [
        group("Tiles"),
        f'''          <div class="calc-row"><label for="calc-layout">Layout</label><select id="calc-layout">{waste_opts}</select></div>''',
        row("calc-waste", "Wastage allowance (%)", waste_default),
        row("calc-tile-l", "Tile length (mm)", tile_l),
        row("calc-tile-w", "Tile width (mm)", tile_w),
        row("calc-box-m2", "m² per box (optional)", "", "0.01", ' placeholder="e.g. 1.44"'),
        group("Adhesive"),
        f'''          <div class="calc-row"><label for="calc-adh-type">Tile and bed</label><select id="calc-adh-type">{adh_opts}<option value="">Custom</option></select></div>''',
        row("calc-adh-rate", "Adhesive (kg per m²)", adh_default, "0.1"),
        row("calc-adh-bag", "Adhesive bag size (kg)", "20"),
        group("Grout"),
        row("calc-joint", "Joint width (mm)", "3", "0.5"),
        row("calc-thick", "Tile thickness (mm)", "9", "0.5"),
        row("calc-grout-bag", "Grout bag size (kg)", "2.5", "0.5"),
        '          <div class="calc-results">',
        res("res-area", "Area to tile", True),
        res("res-tile-area", "Tile area to buy (with wastage)"),
        res("res-boxes", "Boxes"),
        res("res-tile-count", "Approx. number of tiles"),
        res("res-adhesive", "Adhesive"),
        res("res-grout", "Grout"),
        '          </div>',
        f'          <p class="calc-note">{note}</p>'])
    script = """
  $('calc-layout').addEventListener('change', () => { $('calc-waste').value = $('calc-layout').value; });
  $('calc-adh-type').addEventListener('change', () => { if ($('calc-adh-type').value) $('calc-adh-rate').value = $('calc-adh-type').value; });
  const up = x => Math.ceil(x - 1e-9);   // round up, ignoring floating-point noise
  function getArea() { %s }
  function calc() {
    const area = Math.max(0, getArea()), waste = num('calc-waste'), L = num('calc-tile-l'), W = num('calc-tile-w');
    const boxM2 = num('calc-box-m2'), adhRate = num('calc-adh-rate'), adhBag = num('calc-adh-bag') || 1;
    const joint = num('calc-joint'), thick = num('calc-thick'), groutBag = num('calc-grout-bag') || 1;
    const buy = area * (1 + waste / 100);
    const tileM2 = (L / 1000) * (W / 1000);
    const tiles = tileM2 > 0 && area > 0 ? up(buy / tileM2) : 0;
    const adhKg = area * adhRate, adhBags = up(adhKg / adhBag);
    const groutPerM2 = L > 0 && W > 0 ? ((L + W) / (L * W)) * joint * thick * 1.6 : 0;
    const groutKg = area * groutPerM2 * 1.1, groutBags = up(groutKg / groutBag);
    $('res-area').textContent = area.toFixed(2) + ' m²';
    $('res-tile-area').textContent = buy.toFixed(2) + ' m²';
    $('res-boxes').textContent = boxM2 > 0 ? up(buy / boxM2) + ' boxes (' + (up(buy / boxM2) * boxM2).toFixed(2) + ' m²)' : 'enter m² per box';
    $('res-tile-count').textContent = tiles ? tiles + ' tiles' : '–';
    $('res-adhesive').textContent = adhKg.toFixed(0) + ' kg (' + adhBags + ' × ' + adhBag + ' kg)';
    $('res-grout').textContent = groutKg.toFixed(1) + ' kg (' + groutBags + ' × ' + groutBag + ' kg)';
  }""" % area_js
    return html, script

STRAIGHT_DIAG_HB = '<option value="10" selected>Straight (10%)</option><option value="15">Diagonal (15%)</option><option value="25">Herringbone (25%)</option>'
CALC_NOTE = "Planning estimates only. Adhesive figures are typical manufacturer consumption rates (e.g. Mapei Adesilex P9); grout uses the standard formula (L+W)/(L×W) × joint width × tile thickness × 1.6, plus 10%. Always check the data sheet for the product you are using. More on <a href=\"/guides/tile-adhesive-coverage/\">tile adhesive coverage</a>."

floor_calc, floor_script = tile_calc(
    [row("fl-len", "Room length (m)", "4", "0.01"),
     row("fl-wid", "Room width (m)", "3", "0.01"),
     row("fl-extra", "Extra area, e.g. a bay or alcove (m²)", "0", "0.01"),
     row("fl-deduct", "Not tiled, e.g. kitchen units or a bath (m²)", "0", "0.01")],
    "return num('fl-len') * num('fl-wid') + num('fl-extra') - num('fl-deduct');",
    "600", "600",
    '<option value="3">Standard floor tile (3 kg)</option><option value="5" selected>Large format or solid bed (5 kg)</option>', "5",
    STRAIGHT_DIAG_HB, "10", CALC_NOTE)
floor_guide = prose("""        <h2 id="worked-example">Worked example: a kitchen floor with units fitted</h2>
        <p>A 4.2 × 3.6 m kitchen, where the units are already in and you're tiling up to the plinths. There's a 4 m run of units, 0.6 m deep, so 2.4 m² isn't tiled. The tiles are 600 × 600 mm porcelain, 9 mm thick, laid straight with 3 mm joints, in boxes of 1.44 m².</p>
        """ + table(["Step", "Working", "Result"], [
            ["Room", "4.2 m × 3.6 m", "15.12 m²"],
            ["Take off the units", "15.12 − 2.4", "12.72 m² to tile"],
            ["Tile area to buy", "12.72 × 1.10", "13.99 m²"],
            ["Floor tiles", "13.99 ÷ 0.36 = 38.9, rounded up", "39 tiles"],
            ["Boxes", "13.99 ÷ 1.44 = 9.7, rounded up", "10 boxes (14.40 m²)"],
            ["Adhesive", "12.72 m² × 5 kg", "64 kg (4 × 20 kg bags)"],
            ["Grout", "0.144 kg per m² × 12.72 m², plus 10%", "2.0 kg (1 × 2.5 kg bag)"],
        ]) + """
        <p>If the floor goes down before the kitchen is fitted, leave the deduction at 0 and tile the whole room.</p>

        <h2 id="measuring">Measuring an awkward floor</h2>
        <ul>
          <li><strong>L-shaped rooms:</strong> split the floor into two rectangles. Put the bigger one in as the length and width, and the other in as extra area.</li>
          <li><strong>Bays, alcoves and door thresholds:</strong> measure each one and add it as extra area. Thresholds are small but they're full of cuts.</li>
          <li><strong>Baths, shower trays and fitted units:</strong> take them off only if they're already in, or going in on an untiled floor.</li>
        </ul>
        <p>Measure to the wall, not the skirting, if the skirting is coming off.</p>

        <h2 id="floor-adhesive">Adhesive and preparation for floor tiles</h2>
        <p>Floor tiles need more adhesive than wall tiles. Most floor tiles are bigger, and a floor needs a solid bed with no hollow spots under the tile. Mapei's data sheet gives about 5 kg per m² for large-format tiles and floors that need a solid bed, which is the starting value here. Smaller floor tiles on a flat floor can use about 3 kg per m². The <a href="/guides/tile-adhesive-coverage/">floor tile adhesive coverage guide</a> has figures by trowel size and worked examples.</p>
        <p>The flatter the floor, the less adhesive you use and the less likely large tiles are to lip. Levelling, priming and boarding should go on the quote as their own lines: see <a href="/guides/how-much-to-charge-for-floor-preparation/">pricing floor preparation</a>.</p>
        <p>Only got the area, or tiling walls and floors together? Use the <a href="/tiling-material-calculator/">tile calculator</a>.</p>""")

floor_faqs = [
    ("How many floor tiles do I need?",
     "Multiply the length of the room by the width, take off anything you won't tile, and add 10% for a straight lay. Divide that by the area of one tile, or by the m² in a box, and round up. For the 12.72 m² kitchen above, that's 13.99 m² to buy: 39 tiles at 600 × 600 mm, or 10 boxes of 1.44 m²."),
    ("How much adhesive do I need for floor tiles?",
     "Plan on about 5 kg per m² for large-format floor tiles and any floor that needs a solid bed, or about 3 kg per m² for smaller tiles on a flat floor. A 20 kg bag at 5 kg per m² covers about 4 m². Check the data sheet for the adhesive you're using."),
    ("Should I add extra for herringbone on a floor?",
     "Yes. Allow 20–25% wastage for herringbone or chevron, compared with 10% for a straight lay, because every tile along the edge of the room is a cut. Choose herringbone in the layout setting to use 25%."),
]

floor_sections = floor_guide + section("01", "FLOOR GUIDES", "Pricing the floor, not just the materials",
    "Floors often need more than tiling: levelling, boarding and slower layouts like herringbone. These guides cover how to price them.",
    """<article><h3>Uneven floors cost time</h3><p>Levelling, priming and boarding should be priced separately from the tiling.</p><a href="/guides/how-much-to-charge-for-floor-preparation/">Pricing floor preparation →</a></article>
          <article><h3>Quoting a kitchen floor</h3><p>What to measure, what to allow for, and how to price it.</p><a href="/guides/how-to-quote-a-kitchen-floor/">Read the guide →</a></article>
          <article><h3>Herringbone and large format</h3><p>Both use more tile and take longer to lay. Price them accordingly.</p><a href="/guides/how-to-price-herringbone-tiling/">Pricing herringbone →</a></article>""") + \
    section("02", "DOING THIS ON A REAL JOB", "Want TileIQ to do this on every job?",
    "Measure the room in TileIQ, or straight from a Leica Disto by Bluetooth, and it works out tiles, adhesive, grout and prep for every floor and wall, then puts them into the quote.",
    """<article><h3>Walls too?</h3><p>Work out tiles, adhesive and grout for walls, with doors and windows taken off.</p><a href="/wall-tiling-calculator/">Wall tile calculator →</a></article>
          <article><h3>Leica Disto™ integration</h3><p>Connect a compatible Leica Disto by Bluetooth for fast, accurate measurements.</p><a href="/leica-disto-tiling/">See how it works →</a></article>""")

wall_calc, wall_script = tile_calc(
    [row("wl-run", "Total width of walls to tile (m)", "8", "0.01"),
     row("wl-height", "Tiled height (m)", "2.4", "0.01"),
     row("wl-extra", "Extra area, e.g. a boxed-in pipe or window reveals (m²)", "0", "0.01"),
     row("wl-doors", "Doors not tiled (number)", "1"),
     row("wl-door-m2", "Size of each door (m²)", "1.6", "0.01"),
     row("wl-deduct", "Windows and other gaps (m²)", "0", "0.01")],
    "return num('wl-run') * num('wl-height') + num('wl-extra') - num('wl-doors') * num('wl-door-m2') - num('wl-deduct');",
    "600", "300",
    '<option value="2">Mosaic, small (2 kg)</option><option value="3" selected>Standard wall tile (3 kg)</option><option value="5">Large format (5 kg)</option>', "3",
    STRAIGHT_DIAG_HB, "10", CALC_NOTE)
wall_guide = prose("""        <h2 id="worked-example">Worked example: tiling a bathroom floor to ceiling</h2>
        <p>A bathroom with walls of 2.4, 1.8, 2.4 and 1.8 m, tiled to a height of 2.4 m. There's one door (about 1.6 m²) and a 0.6 × 0.9 m window (0.54 m²). The tiles are 600 × 300 mm, 9 mm thick, laid straight with 3 mm joints, in boxes of 1.08 m².</p>
        """ + table(["Step", "Working", "Result"], [
            ["Total width of walls", "2.4 + 1.8 + 2.4 + 1.8", "8.4 m"],
            ["Wall area", "8.4 m × 2.4 m", "20.16 m²"],
            ["Take off the door and window", "20.16 − 1.6 − 0.54", "18.02 m² to tile"],
            ["Tile area to buy", "18.02 × 1.10", "19.82 m²"],
            ["Wall tiles", "19.82 ÷ 0.18 = 110.1, rounded up", "111 tiles"],
            ["Boxes", "19.82 ÷ 1.08 = 18.4, rounded up", "19 boxes (20.52 m²)"],
            ["Adhesive", "18.02 m² × 3 kg", "54 kg (3 × 20 kg bags)"],
            ["Grout", "0.216 kg per m² × 18.02 m², plus 10%", "4.3 kg (2 × 2.5 kg bags)"],
        ]) + """
        <p>Window reveals aren't in that figure. Measure their depth around the frame and add them as extra area: they're small, but every piece is a cut.</p>

        <h2 id="measuring">Measuring walls for tiles</h2>
        <ul>
          <li><strong>Behind a bath:</strong> start the tiled height from the top of the bath, not the floor, and measure the bath panel separately if you're tiling it.</li>
          <li><strong>Splashbacks and half-height tiling:</strong> use the height you're actually tiling to, such as the top of the splashback or the dado line.</li>
          <li><strong>Boxing and pipe chases:</strong> add the faces of the boxing as extra area.</li>
          <li><strong>Showers:</strong> the shower walls need tanking before tiling. Price it as its own line: see <a href="/guides/how-much-to-charge-for-tanking/">pricing tanking</a>.</li>
        </ul>

        <h2 id="wall-adhesive">Adhesive for wall tiles</h2>
        <p>Mapei's data sheet gives about 2.5–3 kg per m² for standard wall tiles and about 2 kg per m² for mosaics. Large-format tiles on walls need more, about 5 kg per m², and may need back-buttering. Check the adhesive is rated for the tile's weight and the background, especially on plasterboard. See <a href="/guides/tile-adhesive-coverage/">how much adhesive per m² for wall tiles</a>, including wet walls.</p>
        <p>Only got the area, or tiling a floor too? Use the <a href="/tiling-material-calculator/">tile calculator</a>.</p>""")

wall_faqs = [
    ("How many wall tiles do I need?",
     "Add up the width of each wall you're tiling, multiply by the tiled height, and take off doors and windows. Add 10% wastage for a straight lay, then divide by the area of one tile, or by the m² in a box, and round up."),
    ("Do I take off doors and windows when measuring for wall tiles?",
     "Yes. Take off each door and window, then add back the window reveals, which you'll tile. A standard internal door is about 0.8 m wide and 2 m high, or roughly 1.6 m²."),
    ("How much adhesive do I need for wall tiles?",
     "About 2.5–3 kg per m² for standard wall tiles, and about 2 kg per m² for mosaics. So 18 m² of standard wall tiles at 3 kg per m² needs 54 kg, which is three 20 kg bags."),
]

wall_sections = wall_guide + section("01", "WALL GUIDES", "Quoting bathroom and shower walls",
    "Bathroom walls bring tanking, boxing and lots of cuts. These guides cover how to price them.",
    """<article><h3>Quoting a bathroom</h3><p>A step-by-step guide with a worked example for a 2.5 × 2 m bathroom.</p><a href="/guides/how-to-quote-bathroom-tiling/">Read the guide →</a></article>
          <article><h3>Showers need tanking</h3><p>Price the waterproofing as its own line on the quote.</p><a href="/guides/how-much-to-charge-for-tanking/">Pricing tanking →</a></article>
          <article><h3>Tile wastage</h3><p>How much extra to allow for each layout, room and tile size.</p><a href="/guides/tile-wastage-and-materials/">Read the wastage guide →</a></article>""") + \
    section("02", "DOING THIS ON A REAL JOB", "Want TileIQ to do this on every job?",
    "Measure each wall in TileIQ, or straight from a Leica Disto by Bluetooth, and it works out tiles, adhesive, grout and tanking for every wall and floor, then puts them into the quote.",
    """<article><h3>Floor too?</h3><p>Work out tiles, adhesive and grout for the floor from the room size.</p><a href="/floor-tiling-calculator/">Floor tile calculator →</a></article>
          <article><h3>Leica Disto™ integration</h3><p>Connect a compatible Leica Disto by Bluetooth for fast, accurate measurements.</p><a href="/leica-disto-tiling/">See how it works →</a></article>""")

MAT_FEATURES = ["Tile area to buy, with wastage for straight, diagonal and herringbone layouts",
                "Number of tiles and boxes", "Tile adhesive in kg and bags", "Grout in kg and bags"]
MAT_PAGE_FEATURES = MAT_FEATURES + ["Optional materials cost from your own prices", "Shows the working for every result"]
pages = [
    ("tiling-material-calculator", "Tile Calculator UK – How Many Tiles Do I Need? | TileIQ",
     "Free tile calculator for floors and walls. Enter your measurements and tile size to calculate tiles, adhesive, grout and wastage. No sign-up needed.",
     "Tile calculator", "FREE TILE CALCULATOR", "Free Tile Calculator – How Many Tiles Do I Need?",
     "Enter the area you're tiling and the tile size to work out how many tiles and boxes you need, plus adhesive and grout, with wastage for straight, diagonal and herringbone layouts. It works for floors and walls, and there's nothing to sign up for.",
     mat_calc, mat_sections, mat_script,
     dict(app_name="TileIQ tile calculator", features=MAT_PAGE_FEATURES, faqs=mat_faqs)),
    ("tiling-day-rate-calculator", "Tiler Day Rate Calculator: Set Your Own Rate (UK) | TileIQ",
     "Free day-rate calculator for self-employed tilers: work out the day rate, hourly rate and per m² rate that cover your income, costs, holidays and quoting days.",
     "Tiler day rate calculator", "FREE TILING CALCULATOR", "Tiler day rate calculator",
     "For self-employed tilers: work out the day rate you need from what you want to earn, your business costs and the days you can actually bill. You also get your hourly rate and a per m² rate for walls and floors. Want to know what tilers typically charge? See <a href=\"/guides/tiling-labour-rates-uk/\">how much a tiler charges</a>.",
     day_calc, day_sections, day_script,
     dict(features=["Day rate", "Hourly rate", "Per m² rate for walls and floors", "VAT threshold check"])),
    ("tiling-labour-cost-calculator", "Tiling Labour Calculator for Tilers: Price a Job | TileIQ",
     "Free labour calculator for tilers: price walls, floors, tanking and levelling from your own rates, see days on site and check the job against your day rate.",
     "Tiling labour calculator", "FREE CALCULATOR FOR TILERS", "Tiling labour calculator for tilers",
     "Price the labour for a job from your own per m² rates, add extras such as tanking and levelling, and see what it earns per day against your day rate. Having a room tiled and want to know what it should cost? See <a href=\"/guides/tiling-labour-rates-uk/\">how much a tiler charges</a>.",
     lab_calc, lab_sections, lab_script,
     dict(features=["Wall and floor labour", "Extras such as tanking and levelling", "Days on site", "Check against your day rate"])),
    ("floor-tiling-calculator", "Floor Tile Calculator: Tiles, Adhesive & Grout | TileIQ",
     "Free floor tile calculator: enter the room length and width, take off units or a bath, and get the floor tiles, boxes, adhesive and grout you need.",
     "Floor tile calculator", "FLOOR TILES", "Floor tile calculator",
     "Enter the length and width of the room, add any bays or alcoves and take off anything you won't tile. You get the floor tiles, boxes, adhesive and grout you need. Free, with no sign-up.",
     floor_calc, floor_sections, floor_script,
     dict(app_name="TileIQ floor tile calculator", features=["Floor area from room length and width", "Extra areas and deductions"] + MAT_FEATURES, faqs=floor_faqs)),
    ("wall-tiling-calculator", "Wall Tile Calculator: Tiles, Adhesive & Grout | TileIQ",
     "Free wall tile calculator: enter the walls and tiled height, take off doors and windows, and get the wall tiles, boxes, adhesive and grout you need.",
     "Wall tile calculator", "WALL TILES", "Wall tile calculator",
     "Enter the width of the walls and the height you're tiling to, take off doors and windows, and get the wall tiles, boxes, adhesive and grout you need. Free, with no sign-up.",
     wall_calc, wall_sections, wall_script,
     dict(app_name="TileIQ wall tile calculator", features=["Wall area from width and tiled height", "Doors, windows and extra areas"] + MAT_FEATURES, faqs=wall_faqs)),
]
for slug, title, desc, crumb, kicker, h1, intro, calc_html, sections, script, extra in pages:
    os.makedirs(os.path.join(ROOT, slug), exist_ok=True)
    open(os.path.join(ROOT, slug, "index.html"), "w", encoding="utf-8").write(
        page(slug, title, desc, crumb, kicker, h1, intro, calc_html, sections, script, **extra))
    print("wrote", slug)
