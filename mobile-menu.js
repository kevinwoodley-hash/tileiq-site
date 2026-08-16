document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector(".mobile-menu-btn");
  const nav = document.querySelector(".nav-links");
  if (!button || !nav) return;

  // Use the hamburger navigation at every screen size.
  const style = document.createElement("style");
  style.textContent = `
    .mobile-menu-btn{display:flex!important}
    .nav-links{
      display:none!important;
      position:absolute!important;
      top:calc(100% + 10px)!important;
      right:18px!important;
      left:auto!important;
      width:min(340px,calc(100vw - 36px))!important;
      flex-direction:column!important;
      gap:0!important;
      background:#0a0f11!important;
      border:1px solid #243135!important;
      border-radius:14px!important;
      padding:9px!important;
      box-shadow:0 22px 55px rgba(0,0,0,.45)!important;
      z-index:100!important;
    }
    .nav-links.mobile-open{display:flex!important}
    .nav-links a{
      width:100%!important;
      padding:13px 14px!important;
      border-radius:9px!important;
      font-size:14px!important;
    }
    .nav-links a:hover,.nav-links a.active{
      background:#10191b!important;
      color:var(--yellow)!important;
    }
    .nav{position:relative!important}
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

  nav.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeMenu();
  });

  document.addEventListener("click", e => {
    if (!nav.classList.contains("mobile-open")) return;
    if (!nav.contains(e.target) && !button.contains(e.target)) closeMenu();
  });
});