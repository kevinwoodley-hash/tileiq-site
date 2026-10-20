// /guides/ pages: records which call-to-action a reader used (real app, Google Play, App Store or the
// demo) and from which guide, so we can see which guides bring tilers into TileIQ. Uses the site's
// existing analytics (/analytics.js), so nothing is sent unless the visitor accepted analytics;
// store taps are also counted anonymously by analytics.js itself. Tables get a scroll wrapper on
// small screens.
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
