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
