// /guides/ pages: records which call-to-action a reader used (real app, Google Play, App Store or the
// demo) and from which guide, so we can see which guides bring tilers into TileIQ. Uses the site's
// existing analytics (/analytics.js), so nothing is sent unless the visitor accepted analytics;
// store taps are also counted anonymously by analytics.js itself. Tables get a scroll wrapper on
// small screens.
// In-text links inside a guide (not the call-to-action block, which sends guide_cta_click below):
// guide_link_click with the guide, where the link goes and what kind of page it is, so a guide's
// role in sending readers to calculators, other guides and TileIQ can be measured. No values the
// reader typed are sent, and nothing at all without analytics consent (the site's gtag / PostHog).
(function () {
  var guide = (location.pathname.match(/^\/guides\/([^\/]+)\/?$/) || [])[1] || 'hub';
  function kind(path) {
    if (/^\/app(\/|$)/.test(path)) return /^\/app\/demo/.test(path) ? 'demo' : 'web_app';
    if (/-calculator\/$/.test(path)) return 'calculator';
    if (/^\/(guides|blog)\//.test(path)) return 'guide';
    if (/^\/(tiling-estimating-software|tiling-quote-app|tiling-quotation-software|invoice-app-for-tilers|tiling-job-management|software-for-tilers|leica-disto-tiling|tour|features)(\/|$)/.test(path)) return 'tileiq';
    return 'other';
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('.guide-body a[href]');
    if (!a || a.closest('[data-cta]')) return;
    var url; try { url = new URL(a.href, location.href); } catch (e) { return; }
    if (url.origin !== location.origin || url.pathname === location.pathname) return;   // outside sources and in-page links
    var props = { guide: guide, link_type: kind(url.pathname), link_path: url.pathname.slice(0, 100) };
    try { if (typeof window.gtag === 'function') window.gtag('event', 'guide_link_click', props); } catch (e) {}
    try { if (window.posthog && window.posthog.__loaded) window.posthog.capture('guide_link_click', props); } catch (e) {}
  }, true);
})();

(function () {
  document.querySelectorAll('.guide-body table').forEach(function (t) {
    if (t.parentElement && t.parentElement.classList.contains('table-wrap')) return;
    var w = document.createElement('div'); w.className = 'table-wrap';
    t.parentNode.insertBefore(w, t); w.appendChild(t);
  });
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('[data-cta-kind]');
    if (!a) return;
    var props = { cta_kind: a.getAttribute('data-cta-kind'), guide: (a.closest('[data-cta]') || {}).getAttribute ? a.closest('[data-cta]').getAttribute('data-cta') : '' };
    try { if (typeof window.gtag === 'function') window.gtag('event', 'guide_cta_click', props); } catch (e) {}
    try { if (window.posthog && window.posthog.__loaded) window.posthog.capture('guide_cta_click', props); } catch (e) {}
  }, true);
})();

// Tile adhesive calculator on /guides/tile-adhesive-coverage/. Rates are a low–high range in kg/m²
// (the preset values are "low-high" from Mapei's Adesilex P9 data sheet; Custom uses the reader's
// own figure). Bags round up from the top of the range plus the allowance, so it never under-orders.
// Same anonymous calculator_used / calculator_completed events as the calculator pages.
(function () {
  var box = document.querySelector('[data-adhesive-calc]');
  if (!box) return;
  var $ = function (id) { return document.getElementById(id); };
  var num = function (id) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? v : 0; };
  var kg = function (n) { return (Math.round(n * 10) / 10).toLocaleString('en-GB'); };
  var whole = function (n) { return Math.round(n).toLocaleString('en-GB'); };   // results: no false precision
  function track(name, props) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, props); } catch (e) {}
    try { if (window.posthog && window.posthog.__loaded) window.posthog.capture(name, props); } catch (e) {}
  }
  function rates() {
    var t = $('adh-type').value;
    if (t === 'custom') { var r = num('adh-rate'); return [r, r]; }
    var p = t.split('-').map(parseFloat);
    return [p[0], p[1]];
  }
  function calc() {
    var custom = $('adh-type').value === 'custom';
    $('adh-custom-row').hidden = !custom;
    var area = num('adh-area'), bag = num('adh-bag'), allow = num('adh-allow') / 100;
    var r = rates(), lo = area * r[0] * (1 + allow), hi = area * r[1] * (1 + allow);
    if (!area || !r[1]) {
      $('adh-res-kg').textContent = '–';
      $('adh-res-bags').textContent = '–';
      $('adh-res-working').textContent = custom && !r[1] ? 'Enter the kg per m² from your adhesive’s data sheet.' : '';
      return;
    }
    var bags = bag ? Math.ceil(hi / bag - 1e-9) : 0;
    $('adh-res-kg').textContent = whole(lo) === whole(hi) ? 'about ' + whole(hi) + ' kg' : 'about ' + whole(lo) + '–' + whole(hi) + ' kg';
    $('adh-res-bags').textContent = bags ? bags + ' × ' + bag + ' kg' : 'enter a bag size';
    var rateTxt = r[0] === r[1] ? kg(r[0]) : kg(r[0]) + '–' + kg(r[1]);
    $('adh-res-working').textContent = kg(area) + ' m² × ' + rateTxt + ' kg/m²' +
      (allow ? ' + ' + Math.round(allow * 100) + '% allowance' : '') + '. Estimate: check your adhesive’s data sheet.';
  }
  var used = false, done = false, changed = {}, idle;
  box.querySelectorAll('input,select').forEach(function (el) {
    var ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, function () {
      calc();
      if (!used) { used = true; track('calculator_used', { calculator: 'adhesive-guide' }); }
      changed[el.id] = 1; clearTimeout(idle);
      if (!done && Object.keys(changed).length >= 2) idle = setTimeout(function () {
        done = true; track('calculator_completed', { calculator: 'adhesive-guide', inputs_changed: Object.keys(changed).length });
      }, 4000);
    });
  });
  calc();
})();
