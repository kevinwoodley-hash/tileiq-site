document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector(".mobile-menu-btn");
  const nav = document.querySelector(".nav-links");
  if (!button || !nav) return;

  const style = document.createElement("style");
  style.textContent = `
    /* Keep the site header/navigation available while scrolling on every device */
    .site-header{
      position:fixed!important;
      top:0!important;
      left:0!important;
      right:0!important;
      z-index:1000!important;
      background:rgba(7,10,12,.96)!important;
      border-bottom:1px solid #1f2a2d!important;
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
    }
    body{padding-top:78px!important}
    .contact-page{padding-top:78px!important}

    /* Desktop: full navigation stays visible */
    .mobile-menu-btn{display:none!important}
    .nav-links{
      display:flex!important;
      position:static!important;
      flex-direction:row!important;
      gap:26px!important;
      width:auto!important;
      background:transparent!important;
      border:0!important;
      border-radius:0!important;
      padding:0!important;
      box-shadow:none!important;
    }
    .nav-links a{
      width:auto!important;
      padding:0!important;
      font-size:13px!important;
      border-radius:0!important;
      background:transparent!important;
    }
    .desktop-cta{display:inline-flex!important}

    /* Mobile/tablet: fixed hamburger header */
    @media(max-width:900px){
      .mobile-menu-btn{display:flex!important}
      .desktop-cta{display:none!important}
      .nav{position:relative!important}
      .nav-links{
        display:none!important;
        position:fixed!important;
        top:76px!important;
        left:12px!important;
        right:12px!important;
        width:auto!important;
        max-height:calc(100vh - 92px)!important;
        overflow-y:auto!important;
        flex-direction:column!important;
        gap:0!important;
        background:#0a0f11!important;
        border:1px solid #243135!important;
        border-radius:14px!important;
        padding:9px!important;
        box-shadow:0 22px 55px rgba(0,0,0,.45)!important;
        z-index:1100!important;
      }
      .nav-links.mobile-open{display:flex!important}
      .nav-links a{
        width:100%!important;
        padding:14px!important;
        border-radius:9px!important;
        font-size:14px!important;
      }
      .nav-links a:hover,.nav-links a.active{
        background:#10191b!important;
        color:var(--yellow)!important;
      }
    }
  `;
  document.head.appendChild(style);

  const closeMenu = () => {
    nav.classList.remove("mobile-open");
    button.classList.remove("active");
    button.setAttribute("aria-expanded", "false");
  };

  button.addEventListener("click", () => {
    const open = nav.classList.toggle("mobile-open");
    button.classList.toggle("active", open);
    button.setAttribute("aria-expanded", String(open));
  });

  nav.querySelectorAll("a").forEach(link => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
  document.addEventListener("click", e => {
    if (!nav.classList.contains("mobile-open")) return;
    if (!nav.contains(e.target) && !button.contains(e.target)) closeMenu();
  });
});