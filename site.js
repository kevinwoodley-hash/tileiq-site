// TileIQ website: header dropdowns, workflow tabs, scroll reveal and the mobile "Try free" bar.
// The mobile menu itself (open/close, Escape, outside click) stays in mobile-menu.js.
(() => {
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
})();
