
document.addEventListener("DOMContentLoaded", () => {
  const button = document.querySelector(".mobile-menu-btn");
  const nav = document.querySelector(".nav-links");
  if (!button || !nav) return;

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
