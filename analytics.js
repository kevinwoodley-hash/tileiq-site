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
 * - Traffic sources: an anonymous, cookieless beacon to the worker (/api/site-visit) for every
 *   visitor counts where they came from and which source leads to store taps (admin Traffic page),
 *   and Google Play links get that source as an install referrer.
 * - Store links: one listener sends app_download_clicked for any Google Play / App Store
 *   link (plus the demo's existing demo_google_play_click / demo_app_store_click names).
 */
(function () {
  'use strict';
  if (window.tileiqConsent) return;                      // only ever set up once per page

  var GA_ID = 'G-274KES4P2G';
  var PH_CONVERSIONS = ['book_demo_submit', 'contact_form_submit', 'sign_up', 'training_centre_register'];
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
    // Events can flow from here on. The site's conversion events (forms, sign-up, demo
    // start) also go to PostHog, so they can be Goals in its Web analytics.
    window.gtag = function () {
      push.apply(null, arguments);
      if (arguments[0] === 'event' && PH_CONVERSIONS.indexOf(arguments[1]) >= 0 && !framed &&
          window.posthog && window.posthog.__loaded) {
        try { window.posthog.capture(arguments[1], { link_location: location.pathname }); } catch (e) {}
      }
    };
    push('consent', 'update', { analytics_storage: 'granted' });
    if (libraryLoaded) return;
    libraryLoaded = true;
    var cfg = { platform_type: 'web' };                  // on every web event, including the automatic ones
    // Inside the /app/demo wrapper the wrapper page sends the visit's page_view;
    // the app stays configured so its demo_* and other events still go through.
    if (inDemoFrame) cfg.send_page_view = false;
    if (isInternal()) { cfg.traffic_type = 'internal'; cfg.is_internal_test = 'true'; cfg.debug_mode = true; }
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
      '<div style="color:#b9c2c8;margin-bottom:12px">We\'d like to use analytics to see which pages and demo features people use, so we can improve TileIQ: Google Analytics and PostHog, which record the pages you visit, where you came from and how you use them (including screen recordings with anything you type hidden), and in the demo an anonymous record of the steps you take. Nothing is collected unless you accept. <a href="/privacy" style="color:#e6af2e">Privacy policy</a></div>' +
      '<div id="tileiq-consent-settings" style="display:' + (showSettings ? 'block' : 'none') + ';margin-bottom:12px;border-top:1px solid #2a3138;padding-top:10px">' +
        '<label style="display:flex;gap:10px;align-items:flex-start;margin-bottom:8px;color:#8b959b"><input type="checkbox" checked disabled style="margin-top:3px"><span><b style="color:#f4f7f8">Essential</b><br>Needed for the site and app to work (signing in, saving your work). Always on.</span></label>' +
        '<label style="display:flex;gap:10px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="tileiq-consent-analytics"' + (current === 'granted' ? ' checked' : '') + ' style="margin-top:3px"><span><b>Analytics</b><br><span style="color:#b9c2c8">Google Analytics and PostHog: pages visited, where you came from, clicks and screen recordings with anything you type hidden, plus in the demo an anonymous step-by-step record. No names, emails, customer details or quote contents.</span></span></label>' +
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
    source: function () { return source; },                          // where this visit came from (see below), or null
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
    // Inside the web app, data-tq-spot names which prompt the link was in (e.g. #demo_blocked_sheet)
    var spot = a.closest('[data-tq-spot]');
    var where = location.pathname + (spot ? '#' + spot.getAttribute('data-tq-spot') : '');
    var params = { store: store, link_location: where, app_mode: isDemo ? 'demo' : 'live', platform_type: 'web', transport_type: 'beacon' };
    window.gtag('event', 'app_download_clicked', params);
    // The demo's existing event names, kept so current reports carry on working
    if (isDemo) window.gtag('event', store === 'google_play' ? 'demo_google_play_click' : 'demo_app_store_click', { link_url: href, transport_type: 'beacon' });
  }, true);

  // ── Where visitors come from: anonymous, for every visitor ───
  // Separate from Google Analytics and needs no consent: nothing is stored in
  // the browser and nothing identifies the person. One beacon to our worker when
  // someone arrives from outside the site, one when they tap a store link, each
  // carrying only source / medium / campaign, landing page and mobile-or-desktop.
  // The admin Traffic page adds them up. Google Play links also get the source
  // as an install referrer, so Play Console and Firebase can credit the install.
  var WORKER_URL = 'https://damp-bread-e0f9.kevin-woodley.workers.dev';
  var SITE_HOST = /(^|\.)tile-iq\.com$/;
  var SOCIAL = [[/(^|\.)facebook\.com$|^fb\.me$/, 'facebook'], [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)tiktok\.com$/, 'tiktok'], [/(^|\.)youtube\.com$|^youtu\.be$/, 'youtube'], [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'linkedin'],
    [/^(t\.co|x\.com|twitter\.com|mobile\.twitter\.com)$/, 'x'], [/(^|\.)pinterest\./, 'pinterest'], [/(^|\.)reddit\.com$/, 'reddit'],
    [/(^|\.)whatsapp\.com$/, 'whatsapp']];
  // AI assistants and AI search, recorded with medium 'ai'. Matched on the referring host,
  // or on a utm_source they add to links (ChatGPT adds utm_source=chatgpt.com). Many AI apps
  // send no referrer at all; those visits can't be identified and show up as direct.
  var AI = [[/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, 'chatgpt'], [/(^|\.)perplexity\.ai$/, 'perplexity'],
    [/^(gemini|bard)\.google\.com$/, 'gemini'], [/^copilot\.microsoft\.com$|^copilot\.cloud\.microsoft$/, 'copilot'],
    [/(^|\.)claude\.ai$/, 'claude'], [/(^|\.)(grok\.com|x\.ai)$/, 'grok'], [/(^|\.)meta\.ai$/, 'meta_ai'],
    [/(^|\.)deepseek\.com$/, 'deepseek'], [/(^|\.)mistral\.ai$/, 'mistral'], [/(^|\.)you\.com$/, 'you.com'],
    [/(^|\.)phind\.com$/, 'phind'], [/(^|\.)poe\.com$/, 'poe']];
  function aiName(host) {
    host = String(host || '').toLowerCase().replace(/^www\./, '');
    for (var i = 0; i < AI.length; i++) if (AI[i][0].test(host)) return AI[i][1];
    return '';
  }
  function hostOf(u) { try { return new URL(u).hostname.toLowerCase(); } catch (e) { return ''; } }
  // The page the visit is about: the demo wrapper when we're the app inside it
  var topWin = window;
  try { if (framed && window.top.location.href) topWin = window.top; } catch (e) {}
  var landingPath = topWin.location.pathname;
  var device = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';

  // Source of this visit, in order: UTM tags on the link, ad click ids, the
  // referring site, then the in-app browser (Facebook, Instagram and TikTok's
  // built-in browsers usually hide the referrer). null = came from another page
  // of this site, so the original source isn't known here.
  function visitSource() {
    var q = new URLSearchParams(topWin.location.search);
    var camp = q.get('utm_campaign');
    var ai = aiName(q.get('utm_source'));
    if (ai) return { s: ai, m: 'ai', c: camp };
    if (q.get('utm_source')) return { s: q.get('utm_source'), m: q.get('utm_medium') || '(not set)', c: camp };
    if (q.get('gclid') || q.get('gbraid') || q.get('wbraid')) return { s: 'google', m: 'cpc', c: camp };
    if (q.get('ttclid')) return { s: 'tiktok', m: 'paid_social', c: camp };
    if (q.get('msclkid')) return { s: 'bing', m: 'cpc', c: camp };
    var ref = hostOf(topWin.document.referrer);
    if (ref && SITE_HOST.test(ref)) return null;
    if (ref) {
      if (aiName(ref)) return { s: aiName(ref), m: 'ai' };
      for (var i = 0; i < SOCIAL.length; i++) if (SOCIAL[i][0].test(ref)) return { s: SOCIAL[i][1], m: 'social' };
      var se = ref.match(/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu)\./);
      if (se) return { s: se[2], m: 'organic' };
      return { s: ref.replace(/^(www|m|l|lm)\./, ''), m: 'referral' };
    }
    var ua = navigator.userAgent || '';
    if (/FBAN|FBAV|FB_IAB/.test(ua) || q.get('fbclid')) return { s: /Instagram/.test(ua) ? 'instagram' : 'facebook', m: 'social' };
    if (/Instagram/.test(ua)) return { s: 'instagram', m: 'social' };
    if (/musical_ly|BytedanceWebview|TikTok|trill_/i.test(ua)) return { s: 'tiktok', m: 'social' };
    // No referrer and no tags. Arriving straight on an inner page (a guide, a calculator) rather
    // than the homepage is typical of links opened from AI assistants, chat apps and email, so
    // it's kept apart from typed-in / bookmarked homepage visits. Still unattributed, not AI.
    return { s: '(direct)', m: topWin.location.pathname === '/' ? '(none)' : 'deep link' };
  }
  var source = visitSource();

  function beacon(data) {
    if (isInternal()) return;                            // our own testing stays out of the numbers
    var src = source || { s: '(moved between pages)', m: '(not known)' };
    data.s = src.s; data.m = src.m; data.c = src.c || null; data.p = landingPath; data.d = device;
    try { navigator.sendBeacon(WORKER_URL + '/api/site-visit', JSON.stringify(data)); } catch (e) {}
  }

  // A visit = arriving on a website page (or the demo) from outside the site.
  // Reloads and back/forward don't count again; the signed-in web app and admin never count.
  var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
  if (!framed && source && nav.type !== 'reload' && nav.type !== 'back_forward' &&
      !/^\/admin(\/|$)/.test(location.pathname) && (!inApp || isDemo)) {
    beacon({ k: 'visit' });
  }

  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.href || '';
    var store = /play\.google\.com\/store\/apps\/details/.test(href) ? 'google_play' : /apps\.apple\.com\//.test(href) ? 'app_store' : '';
    if (!store) return;
    beacon({ k: 'store_click', st: store });
    if (!framed && window.posthog && window.posthog.__loaded) {
      try { window.posthog.capture('app_download_clicked', { store: store, link_location: landingPath }); } catch (err) {}
    }
    if (store === 'google_play' && !/[?&]referrer=/.test(href)) {
      var src = source && source.s !== '(direct)' ? source : { s: 'tile-iq.com', m: 'website' };
      var ref = 'utm_source=' + encodeURIComponent(src.s) + '&utm_medium=' + encodeURIComponent(src.m) +
        '&utm_campaign=' + encodeURIComponent(src.c || 'website') + '&utm_content=' + encodeURIComponent(landingPath);
      a.href = href + (href.indexOf('?') >= 0 ? '&' : '?') + 'referrer=' + encodeURIComponent(ref);
    }
  }, true);

  // ── PostHog on the website: only with consent ────────────────
  // Same choice as Google Analytics: nothing loads until the visitor accepts, and
  // rejecting later stops it and clears PostHog's stored id. Page views, where the
  // visit came from, clicks and screen recordings; anything typed into a form is
  // hidden. Sent through our /ingest reverse proxy. Same project and same browser
  // storage as the demo app (which runs its own PostHog inside the /app/demo frame),
  // so one visitor's ad → landing page → demo shows as one person in PostHog.
  // Not on the signed-in web app or admin; the demo wrapper sends its page view but
  // leaves clicks and the recording to the app inside the frame.
  var PH_KEY = 'phc_vd8ipzxvGhNkZkFdH3puH4do7hJiSNn4wTBxfPgqA55T';
  var phPage = !framed && !/^\/admin(\/|$)/.test(location.pathname) && (!inApp || isDemo);
  var phLoading = false;
  function startPostHog() {
    if (!phPage) return;
    var p = window.posthog;
    if (p && p.__loaded) { if (p.has_opted_out_capturing()) p.opt_in_capturing(); return; }
    if (phLoading) return;
    phLoading = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = '/app/vendor/posthog.full.js';
    s.onload = function () { try { initPostHog(); } catch (e) {} };
    document.head.appendChild(s);
  }
  function initPostHog() {
    var p = window.posthog;
    if (!p || typeof p.init !== 'function' || lsGet(CONSENT_KEY) !== 'granted') return;
    p.init(PH_KEY, {
      api_host: 'https://tile-iq.com/ingest', ui_host: 'https://eu.posthog.com',
      person_profiles: 'identified_only', persistence: 'localStorage',
      capture_pageview: true, capture_pageleave: true,
      autocapture: !isDemo, rageclick: true, capture_dead_clicks: !isDemo,
      capture_exceptions: true, capture_performance: { web_vitals: true, network_timing: false },
      disable_session_recording: isDemo,                       // the app inside the frame records the demo
      enable_recording_console_log: false,
      session_recording: { maskAllInputs: true, recordHeaders: false, recordBody: false },
      loaded: function (ph) {
        var props = { platform_type: 'web', site_area: isDemo ? 'demo' : 'website', is_internal_test: isInternal() ? 'true' : 'false' };
        // The visit's own source (UTM tags, ad ids, referrer or in-app browser), kept for the
        // rest of the visit's pages; PostHog's $referrer misses Facebook/TikTok in-app browsers
        if (source) { props.traffic_source = source.s; props.traffic_medium = source.m; if (source.c) props.traffic_campaign = source.c; }
        ph.register(props);
      }
    });
  }
  function stopPostHog() {
    var p = window.posthog;
    if (p && p.__loaded) { try { p.reset(); p.opt_out_capturing(); p.set_config({ disable_persistence: true }); } catch (e) {} }
    // Remove PostHog's stored id (ph_…); its opt-out marker (__ph_opt_in_out_…) holds no id and stays
    try { Object.keys(localStorage).forEach(function (k) { if (/^ph_/.test(k)) localStorage.removeItem(k); }); } catch (e) {}
  }
  if (lsGet(CONSENT_KEY) === 'granted') whenReady(startPostHog);
  else if (lsGet(CONSENT_KEY) === 'denied' && !framed) stopPostHog();
  window.tileiqConsent.onChange(function (state) { if (state === 'granted') startPostHog(); else stopPostHog(); });
})();
