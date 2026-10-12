/* TileIQ web analytics — Google tag (GA4 G-274KES4P2G) behind Google Consent Mode v2.
 *
 * Loaded on every page of tile-iq.com (see add_gtag.py), including the web app (/app) and
 * the demo wrapper (/app/demo). The Android/iOS apps never load this file — they use
 * Firebase Analytics through the code in the app's own script.js.
 *
 * - Consent: analytics is DENIED until the visitor accepts. Until then gtag.js is not
 *   loaded and window.gtag does not exist, so nothing is sent and no cookies are set.
 *   The choice is kept in localStorage and can be changed any time (window.tileiqConsent).
 * - Internal testing: open any page once with ?tileiq_internal=1 (…=0 turns it off).
 *   From then on this browser's events carry traffic_type=internal and debug_mode, so a
 *   GA4 data filter can exclude them and they show in DebugView. No IP addresses involved.
 * - Store links: one listener sends app_download_clicked for any Google Play / App Store
 *   link (plus the demo's existing demo_google_play_click / demo_app_store_click names).
 */
(function () {
  'use strict';
  if (window.tileiqConsent) return;                      // only ever set up once per page

  var GA_ID = 'G-274KES4P2G';
  var CONSENT_KEY = 'tileiq-analytics-consent';          // 'granted' | 'denied' (unset = not asked yet)
  var INTERNAL_KEY = 'tileiq-internal';                  // '1' = this browser is internal testing

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  var qs = new URLSearchParams(location.search);
  var framed = window.self !== window.top;
  var isDemo = qs.get('demo') === '1' || /^\/app\/demo(\.html)?\/?$/.test(location.pathname);
  var inDemoFrame = framed && qs.get('demo') === '1';    // the app inside the /app/demo wrapper
  var inApp = /^\/app(\/|$)/.test(location.pathname);

  // ── Internal testing flag ────────────────────────────────────
  var flag = qs.get('tileiq_internal');
  if (flag === '1') lsSet(INTERNAL_KEY, '1');
  if (flag === '0') lsDel(INTERNAL_KEY);
  function isInternal() { return lsGet(INTERNAL_KEY) === '1'; }

  // ── Consent Mode v2 ──────────────────────────────────────────
  window.dataLayer = window.dataLayer || [];
  function push() { window.dataLayer.push(arguments); }
  // TileIQ runs no advertising tags, so the ad signals stay denied whatever the choice.
  push('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });

  var libraryLoaded = false;
  var listeners = [];

  function grant() {
    window['ga-disable-' + GA_ID] = false;
    window.gtag = push;                                  // events can flow from here on
    push('consent', 'update', { analytics_storage: 'granted' });
    if (libraryLoaded) return;
    libraryLoaded = true;
    var cfg = { platform_type: 'web' };                  // on every web event, including the automatic ones
    // Inside the /app/demo wrapper the wrapper page sends the visit's page_view;
    // the app stays configured so its demo_* and other events still go through.
    if (inDemoFrame) cfg.send_page_view = false;
    if (isInternal()) { cfg.traffic_type = 'internal'; cfg.debug_mode = true; }
    push('js', new Date());
    if (isInternal()) push('set', 'user_properties', { internal_user: 'true' });
    push('config', GA_ID, cfg);
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  function deny() {
    if (libraryLoaded) push('consent', 'update', { analytics_storage: 'denied' });
    window['ga-disable-' + GA_ID] = true;                // Google's own kill switch for this property
    try { delete window.gtag; } catch (e) { window.gtag = undefined; }
    // Remove the analytics cookies set while consent was granted
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (/^_ga(_|$)/.test(name)) {
        var host = location.hostname, base = host.split('.').slice(-2).join('.');
        [host, '.' + host, '.' + base].forEach(function (d) {
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + d;
        });
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      }
    });
  }

  function apply(state) { if (state === 'granted') grant(); else deny(); }

  function setConsent(state) {
    state = state === 'granted' ? 'granted' : 'denied';
    lsSet(CONSENT_KEY, state);
    apply(state);
    closeBanner();
    listeners.forEach(function (cb) { try { cb(state); } catch (e) {} });
  }

  var stored = lsGet(CONSENT_KEY);
  if (stored === 'granted') grant();

  // The wrapper and the app inside it share one choice: follow changes made in the other frame/tab
  window.addEventListener('storage', function (e) {
    if (e.key !== CONSENT_KEY) return;
    apply(e.newValue === 'granted' ? 'granted' : 'denied');
    if (e.newValue) closeBanner();
    listeners.forEach(function (cb) { try { cb(e.newValue); } catch (err) {} });
  });

  // ── Banner (Accept / Reject / Settings) ──────────────────────
  var bannerEl = null;
  function closeBanner() { if (bannerEl) { bannerEl.remove(); bannerEl = null; } }

  function openBanner(showSettings) {
    closeBanner();
    var current = lsGet(CONSENT_KEY);
    var el = document.createElement('div');
    el.id = 'tileiq-consent';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Cookie choices');
    el.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;max-width:560px;margin:0 auto;background:#111418;color:#f4f7f8;border:1px solid #2a3138;border-radius:16px;padding:18px 18px 16px;box-shadow:0 18px 50px rgba(0,0,0,.5);font:14px/1.5 system-ui,-apple-system,"Segoe UI",Arial,sans-serif';
    var btn = 'border:0;border-radius:10px;padding:11px 16px;font:700 14px system-ui,-apple-system,"Segoe UI",Arial,sans-serif;cursor:pointer;flex:1;min-width:96px;';
    el.innerHTML =
      '<div style="font-weight:800;font-size:15px;margin-bottom:6px">Cookies on TileIQ</div>' +
      '<div style="color:#b9c2c8;margin-bottom:12px">We\'d like to use Google Analytics cookies to see which pages and demo features people use, so we can improve TileIQ. Nothing is collected unless you accept. <a href="/privacy" style="color:#e6af2e">Privacy policy</a></div>' +
      '<div id="tileiq-consent-settings" style="display:' + (showSettings ? 'block' : 'none') + ';margin-bottom:12px;border-top:1px solid #2a3138;padding-top:10px">' +
        '<label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;color:#8b959b"><input type="checkbox" checked disabled style="margin-top:3px"><span><b style="color:#f4f7f8">Essential</b><br>Needed for the site and app to work (signing in, saving your work). Always on.</span></label>' +
        '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="tileiq-consent-analytics"' + (current === 'granted' ? ' checked' : '') + ' style="margin-top:3px"><span><b>Analytics</b><br><span style="color:#b9c2c8">Google Analytics: anonymous usage statistics. No names, emails, customer details or quote contents.</span></span></label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button type="button" data-act="accept" style="' + btn + 'background:#e6af2e;color:#111418">Accept</button>' +
        '<button type="button" data-act="reject" style="' + btn + 'background:#e6af2e;color:#111418">Reject</button>' +
        '<button type="button" data-act="settings" style="' + btn + 'background:transparent;color:#f4f7f8;border:1px solid #3a434b">' + (showSettings ? 'Save choices' : 'Settings') + '</button>' +
      '</div>';
    el.addEventListener('click', function (e) {
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'accept') setConsent('granted');
      else if (act === 'reject') setConsent('denied');
      else if (act === 'settings') {
        var panel = el.querySelector('#tileiq-consent-settings');
        if (panel.style.display === 'none') { panel.style.display = 'block'; e.target.textContent = 'Save choices'; }
        else setConsent(el.querySelector('#tileiq-consent-analytics').checked ? 'granted' : 'denied');
      }
    });
    (document.body || document.documentElement).appendChild(el);
    bannerEl = el;
  }

  // ── Public API (used by the app's Settings and by "Cookie settings" links) ──
  window.tileiqConsent = {
    get: function () { return lsGet(CONSENT_KEY); },                 // 'granted' | 'denied' | null
    set: setConsent,
    open: function () { openBanner(true); },
    onChange: function (cb) { listeners.push(cb); },
    isInternal: isInternal,
    setInternal: function (on) { if (on) lsSet(INTERNAL_KEY, '1'); else lsDel(INTERNAL_KEY); }
  };

  function whenReady(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  whenReady(function () {
    // Ask once, on the top-level page only (the demo wrapper asks; the app inside it doesn't)
    if (!framed && !lsGet(CONSENT_KEY)) openBanner(false);
    // A way back to the choice on every website page; the web app has it in Settings instead
    if (!framed && !inApp) {
      var link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Cookie settings';
      link.addEventListener('click', function (e) { e.preventDefault(); openBanner(true); });
      var footer = document.querySelector('footer');
      if (footer) {
        link.style.cssText = 'display:inline-block;margin-top:10px;color:inherit;opacity:.75;font-size:13px;text-decoration:underline';
        var holder = document.createElement('div');
        holder.style.cssText = 'text-align:center;padding:6px 0 14px';
        holder.appendChild(link);
        footer.appendChild(holder);
      } else {
        link.style.cssText = 'position:fixed;left:10px;bottom:8px;z-index:2147482000;font:12px system-ui,Arial,sans-serif;color:#8b959b;text-decoration:underline;background:rgba(17,20,24,.7);padding:3px 7px;border-radius:6px';
        document.body.appendChild(link);
      }
    }
  });

  // ── App store links: one listener, one event per click ───────
  document.addEventListener('click', function (e) {
    if (typeof window.gtag !== 'function') return;       // no consent, nothing sent
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.href || '';
    var store = /play\.google\.com\//.test(href) ? 'google_play' : /apps\.apple\.com\//.test(href) ? 'app_store' : '';
    if (!store) return;
    var params = { store: store, link_location: location.pathname, app_mode: isDemo ? 'demo' : 'live', platform_type: 'web', transport_type: 'beacon' };
    window.gtag('event', 'app_download_clicked', params);
    // The demo's existing event names, kept so current reports carry on working
    if (isDemo) window.gtag('event', store === 'google_play' ? 'demo_google_play_click' : 'demo_app_store_click', { link_url: href, transport_type: 'beacon' });
  }, true);
})();
