// TileIQ website: header dropdowns, workflow tabs, scroll reveal and the mobile "Try free" bar.
// The mobile menu itself (open/close, Escape, outside click) stays in mobile-menu.js.
(() => {
  if (window.__tileiqSiteJs) return;                     // loaded twice: the second copy would undo every click
  window.__tileiqSiteJs = true;
  const header = document.querySelector(".site-header");
  const nav = document.getElementById("site-nav");

  // Header border once the page scrolls
  const onScroll = () => header && header.classList.toggle("scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Lock page scroll while the mobile menu is open
  if (nav) new MutationObserver(() => document.body.classList.toggle("menu-open", nav.classList.contains("mobile-open")))
    .observe(nav, { attributes: true, attributeFilter: ["class"] });

  // Dropdowns: click to toggle, Escape or a click elsewhere closes
  const drops = [...document.querySelectorAll(".nav-drop")];
  const closeDrops = except => drops.forEach(d => {
    if (d === except) return;
    d.classList.remove("open");
    d.querySelector("button").setAttribute("aria-expanded", "false");
  });
  drops.forEach(d => {
    const btn = d.querySelector("button");
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const open = !d.classList.contains("open");
      closeDrops(d);
      d.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", e => { if (!e.target.closest(".nav-drop")) closeDrops(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeDrops(); });

  // Workflow tabs: each step shows its real app screen
  const tabs = [...document.querySelectorAll(".flow-tab")];
  const panel = document.getElementById("flow-panel");
  const shot = panel && panel.querySelector("img");
  const select = (tab, focus) => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", tab.id);
    shot.style.opacity = "0";
    setTimeout(() => {
      shot.src = tab.dataset.src;
      shot.alt = tab.dataset.alt;
      shot.height = Number(tab.dataset.h) || 1246;
      shot.style.opacity = "1";
    }, 150);
    if (focus) tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", e => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      select(tabs[(i + step + tabs.length) % tabs.length], true);
    });
  });
  // Warm the cache so switching steps doesn't flash
  if (tabs.length && "requestIdleCallback" in window) requestIdleCallback(() => tabs.forEach(t => { new Image().src = t.dataset.src; }));

  // Reveal sections as they scroll into view
  const items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    items.forEach(el => io.observe(el));
  } else items.forEach(el => el.classList.add("in"));

  // Mobile: a "Try free" bar once the hero buttons are off screen, hidden again near the footer
  const sticky = document.querySelector(".sticky-cta");
  const heroCta = document.querySelector(".hero-cta");
  const footer = document.querySelector("footer");
  if (sticky && heroCta && "IntersectionObserver" in window) {
    let pastHero = false, atFooter = false;
    const link = sticky.querySelector("a");
    const update = () => {
      const show = pastHero && !atFooter;
      sticky.classList.toggle("show", show);
      sticky.setAttribute("aria-hidden", String(!show));
      link.tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver(([en]) => { pastHero = !en.isIntersecting && en.boundingClientRect.top < 0; update(); }).observe(heroCta);
    if (footer) new IntersectionObserver(([en]) => { atFooter = en.isIntersecting; update(); }).observe(footer);
  }

  // TileIQ assistant: a chat button, bottom right. Nothing loads until the page is idle, and only
  // a small status check then: the chat itself (/assistant/chat.js + .css) loads on the first tap.
  // Not on ad landing pages; the app, admin, sign-up, tour and portfolio pages don't load site.js.
  if (/^\/(lp|app|admin|signup|tour|p|enquire|delete-account|email|training)(\/|$)/.test(location.pathname) || window.self !== window.top) return;
  const API = "https://damp-bread-e0f9.kevin-woodley.workers.dev/api/assistant/status";
  const getStatus = async () => {
    try { const c = JSON.parse(sessionStorage.getItem("tq-assistant-status") || "null"); if (c && Date.now() - c.at < 600000) return c.s; } catch (e) {}
    const s = await fetch(API).then(r => r.ok ? r.json() : null).catch(() => null);
    try { if (s) sessionStorage.setItem("tq-assistant-status", JSON.stringify({ at: Date.now(), s })); } catch (e) {}
    return s;
  };
  const addButton = s => {
    if (!s || !s.enabled || !s.siteKey || document.querySelector(".tq-chat-launcher")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tq-chat-launcher";
    b.setAttribute("aria-label", "Ask the TileIQ assistant");
    b.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 6.5a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01zm5 0a1.5 1.5 0 1 0 0 .01z"/></svg><span>Ask TileIQ</span>';
    b.style.cssText = "position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:160;display:flex;align-items:center;gap:8px;padding:12px 16px;border:0;border-radius:999px;background:#11b8b3;color:#022624;font:700 15px/1 'DM Sans',system-ui,sans-serif;box-shadow:0 12px 30px -8px rgba(0,0,0,.7);cursor:pointer";
    let loading = null;
    b.addEventListener("click", () => {
      if (window.tileiqAssistant) return window.tileiqAssistant.toggle();
      if (loading) return;
      b.setAttribute("aria-busy", "true");
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "/assistant/chat.css";
      document.head.appendChild(css);
      loading = new Promise((ok, fail) => {
        const js = document.createElement("script");
        js.src = "/assistant/chat.js"; js.onload = ok; js.onerror = fail;
        document.head.appendChild(js);
      }).then(() => { b.removeAttribute("aria-busy"); window.tileiqAssistant.start(s, b); })
        .catch(() => { loading = null; b.removeAttribute("aria-busy"); location.href = "/contact.html"; });
    });
    document.body.appendChild(b);
    // Sit above the mobile "Try free" bar when it's showing
    const bar = document.querySelector(".sticky-cta");
    if (bar) new MutationObserver(() => { b.style.bottom = bar.classList.contains("show") ? "calc(84px + env(safe-area-inset-bottom))" : "calc(16px + env(safe-area-inset-bottom))"; })
      .observe(bar, { attributes: true, attributeFilter: ["class"] });
  };
  const later = window.requestIdleCallback || (fn => setTimeout(fn, 1500));
  later(() => getStatus().then(addButton), { timeout: 4000 });
})();
