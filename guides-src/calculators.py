"""Generates the three calculator pages on tile-iq.com from one template:
/tiling-material-calculator/, /tiling-day-rate-calculator/ and /tiling-labour-cost-calculator/.

Header and footer are taken from the current material calculator page so they match the site.
Run from the site root:  python3 guides-src/calculators.py
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://tile-iq.com"
base = open(os.path.join(ROOT, "tiling-material-calculator/index.html"), encoding="utf-8").read()
HEADER = base[base.index("<body"):base.index("  <main>")]
FOOTER = base[base.index("  <footer>"):base.index("<script src=\"/mobile-menu.js\"></script>")]

def page(slug, title, desc, crumb, kicker, h1, intro, calc_html, sections, script):
    url = f"{SITE}/{slug}/"
    ld = {"@context": "https://schema.org", "@graph": [
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "Guides", "item": SITE + "/guides/"},
            {"@type": "ListItem", "position": 3, "name": crumb, "item": url}]},
        {"@type": "WebPage", "@id": url + "#webpage", "url": url, "name": title, "description": desc,
         "isPartOf": {"@id": SITE + "/#website"}, "about": {"@id": SITE + "/#organization"}}]}
    app = f"/app/?utm_source=calc-{slug}&utm_medium=calculator"
    return f"""<!doctype html>
<html lang="en-GB">
<head>
<!-- TileIQ analytics: Google tag G-274KES4P2G with Consent Mode v2 (see /analytics.js) -->
<script src="/analytics.js"></script>
  <meta charset="utf-8" />
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
  <script type="application/ld+json">
{json.dumps(ld, indent=2, ensure_ascii=False)}
  </script>
</head>
{HEADER}  <main>
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
        <div><h2>Use your rates on every real quote.</h2><p>Try the real TileIQ app free. No sign-up needed, and your first quote is free.</p>
          <p class="calc-demo-link">Just looking? <a href="/app/demo" data-cta-kind="demo">Try the demo</a> (no account, nothing saved).</p></div>
        <a class="btn btn-dark" href="{app}" data-cta-kind="app">Try TileIQ free →</a>
      </div>
    </section>
  </main>

{FOOTER}<script src="/mobile-menu.js"></script>
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
    '          </div>',
    '          <p class="calc-note">Planning estimates only. Adhesive figures are typical manufacturer consumption rates (e.g. Mapei Adesilex P9); grout uses the standard formula (L+W)/(L×W) × joint width × tile thickness × 1.6. Always check the data sheet for the product you are using.</p>',
])
mat_script = """
  $('calc-layout').addEventListener('change', () => { $('calc-waste').value = $('calc-layout').value; });
  $('calc-adh-type').addEventListener('change', () => { if ($('calc-adh-type').value) $('calc-adh-rate').value = $('calc-adh-type').value; });
  function calc() {
    const area = num('calc-area'), waste = num('calc-waste'), L = num('calc-tile-l'), W = num('calc-tile-w');
    const boxM2 = num('calc-box-m2'), adhRate = num('calc-adh-rate'), adhBag = num('calc-adh-bag') || 1;
    const joint = num('calc-joint'), thick = num('calc-thick'), groutBag = num('calc-grout-bag') || 1;
    const buy = area * (1 + waste / 100);
    const tileM2 = (L / 1000) * (W / 1000);
    const tiles = tileM2 > 0 ? Math.ceil(buy / tileM2) : 0;
    const adhKg = area * adhRate, adhBags = Math.ceil(adhKg / adhBag);
    const groutPerM2 = L > 0 && W > 0 ? ((L + W) / (L * W)) * joint * thick * 1.6 : 0;
    const groutKg = area * groutPerM2 * 1.1, groutBags = Math.ceil(groutKg / groutBag);
    $('res-tile-area').textContent = buy.toFixed(2) + ' m²';
    $('res-boxes').textContent = boxM2 > 0 ? Math.ceil(buy / boxM2) + ' boxes (' + (Math.ceil(buy / boxM2) * boxM2).toFixed(2) + ' m²)' : 'enter m² per box';
    $('res-tile-count').textContent = tiles ? tiles + ' tiles' : '–';
    $('res-adhesive').textContent = adhKg.toFixed(0) + ' kg (' + adhBags + ' × ' + adhBag + ' kg)';
    $('res-grout').textContent = groutKg.toFixed(1) + ' kg (' + groutBags + ' × ' + groutBag + ' kg)';
  }"""
mat_sections = section("01", "HOW THE NUMBERS WORK", "How much adhesive and grout per m²?",
    "Mapei's data sheet for a standard cement-based adhesive gives about 2 kg/m² for mosaics, 2.5–3 kg/m² for standard tiles and about 5 kg/m² for large-format and external floors. A 20 kg bag covers roughly 6–7.5 m² with a 6 mm notched trowel, or 4–5 m² with a 10 mm one. Grout depends on the tile size, thickness and joint width: narrow joints on big tiles use very little, wide joints on small thick tiles use much more. The calculator adds 10% to the grout for waste.",
    """<article><h3>Tile wastage</h3><p>10% for a straight lay, 15% for diagonal and 20–25% for herringbone. Allow more for large format and small, awkward rooms.</p><a href="/guides/tile-wastage-and-materials/">Read the wastage guide →</a></article>
          <article><h3>Round up to full boxes</h3><p>Order whole boxes from the same batch and leave the customer a few spares for future repairs.</p></article>
          <article><h3>Check the product</h3><p>Coverage changes with the trowel, tile and how flat the surface is. Use the data sheet for the product you are fixing with.</p></article>""") + \
    section("02", "DOING THIS ON A REAL JOB", "Want TileIQ to calculate this automatically on every job?",
    "On a real job, TileIQ works out tiles, adhesive, grout, sealant and tanking for every wall and floor from the measurements you take, and puts them straight into the quote.",
    """<article><h3>From measurement to quote</h3><p>Material calculations feed straight into a professional quote you can send from site.</p><a href="/tiling-quote-app/">See the quote app →</a></article>
          <article><h3>Leica Disto™ integration</h3><p>Connect a compatible Leica Disto by Bluetooth for fast, accurate measurements.</p><a href="/leica-disto-tiling/">See how it works →</a></article>""")

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
          <article><h3>Compare with the going rate</h3><p>Per m², day and hourly rates across the UK, by region and tile type.</p><a href="/guides/tiling-labour-rates-uk/">UK tiling labour rates →</a></article>
          <article><h3>Price a job</h3><p>Turn your rates into a labour price for walls, floors and extras.</p><a href="/tiling-labour-cost-calculator/">Labour cost calculator →</a></article>""")

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
    '          <p class="calc-note">Labour only: tiles, adhesive and grout are extra (see the <a href="/tiling-material-calculator/">material calculator</a>). Starting values are examples: about £50/m² labour and £200–£350 a day are typical UK figures (Checkatrade, 2026), and levelling is around £18–£35/m². Use your own rates.</p>',
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
lab_sections = section("01", "HOW IT WORKS", "Price the labour, then check it against your day rate",
    "Multiply each area by your per m² rate and add any extras priced separately, such as strip-out, tanking and levelling. Then work out how many days the tiling will take from how much you lay a day. Dividing the tiling price by those days shows what the job really earns per day. If it falls well short of your day rate, the job needs a higher rate or a minimum charge. That's common for small bathrooms with lots of cuts.",
    """<article><h3>Quoting a bathroom</h3><p>A step-by-step guide with a worked example for a 2.5 × 2 m bathroom.</p><a href="/guides/how-to-quote-bathroom-tiling/">Read the guide →</a></article>
          <article><h3>Work out your day rate</h3><p>Find the rate that covers your costs and time off.</p><a href="/tiling-day-rate-calculator/">Day-rate calculator →</a></article>
          <article><h3>Going rates</h3><p>What UK tilers charge per m², per day and by region.</p><a href="/guides/tiling-labour-rates-uk/">UK tiling labour rates →</a></article>""")

pages = [
    ("tiling-material-calculator", "Tiling Material Calculator: Tiles, Adhesive and Grout | TileIQ",
     "Free tiling material calculator: work out tiles, boxes, adhesive and grout for any area, with wastage for straight, diagonal and herringbone layouts.",
     "Tiling material calculator", "FREE TILING CALCULATOR", "How much tile, adhesive<br>and grout do you need?",
     "Enter the area, tile size and layout to get tiles, boxes, adhesive and grout. Free, with no sign-up. On a real job, TileIQ works this out from your measurements automatically.",
     mat_calc, mat_sections, mat_script),
    ("tiling-day-rate-calculator", "Tiler Day Rate Calculator (UK) | TileIQ",
     "Free day-rate calculator for self-employed tilers: work out the day rate, hourly rate and per m² rate that cover your income, costs, holidays and quoting days.",
     "Tiler day rate calculator", "FREE TILING CALCULATOR", "Tiler day rate calculator",
     "Work out the day rate you need from what you want to earn, your business costs and the days you can actually bill. You also get your hourly rate and a per m² rate for walls and floors.",
     day_calc, day_sections, day_script),
    ("tiling-labour-cost-calculator", "Tiling Labour Cost Calculator (UK) | TileIQ",
     "Free tiling labour cost calculator: price walls, floors and extras like tanking and levelling, estimate days on site and check the job against your day rate.",
     "Tiling labour cost calculator", "FREE TILING CALCULATOR", "Tiling labour cost calculator",
     "Price the labour for a tiling job from your per m² rates, add extras such as tanking and levelling, and check what the job earns per day against your day rate.",
     lab_calc, lab_sections, lab_script),
]
for slug, title, desc, crumb, kicker, h1, intro, calc_html, sections, script in pages:
    os.makedirs(os.path.join(ROOT, slug), exist_ok=True)
    open(os.path.join(ROOT, slug, "index.html"), "w", encoding="utf-8").write(
        page(slug, title, desc, crumb, kicker, h1, intro, calc_html, sections, script))
    print("wrote", slug)
