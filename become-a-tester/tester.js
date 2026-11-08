// /become-a-tester: the tester programme's invite page.
//
// TESTERS_LIVE stays false until the app versions with "Help Improve TileIQ" are live in the
// App Store and Google Play. Until then the page only says the programme opens soon: no joining,
// nothing advertised. /become-a-tester?preview=1 shows the full page for checking it.
// Going live also means: remove the noindex meta, add the page to sitemap.xml, link it if wanted.
var TESTERS_LIVE = false;

(function () {
  var params = new URLSearchParams(location.search);
  var live = TESTERS_LIVE || params.get("preview") === "1";
  if (!live) return;
  document.body.classList.add("testers-live");

  var ua = navigator.userAgent || "";
  var android = /Android/i.test(ua);
  var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var inFacebook = /FBAN|FBAV|FB_IAB|FBIOS|Instagram/i.test(ua);
  var src = /^[a-z_]{2,20}$/.test(params.get("src") || "") ? params.get("src") : "landing_page";

  var open = document.getElementById("bt-open");
  var play = document.getElementById("bt-play");
  var appStore = document.getElementById("bt-appstore");
  var web = document.getElementById("bt-web");
  var noStore = document.getElementById("bt-nostore");
  web.href = "/app/?tester=join&src=" + encodeURIComponent(src);

  if (inFacebook) document.getElementById("bt-fb").classList.add("show");

  if (android) {
    // Chrome (and most Android browsers, Facebook's included) open the app if it's installed,
    // and go to Google Play if it isn't.
    open.href = "intent://become-a-tester?src=" + encodeURIComponent(src) +
      "#Intent;scheme=tileiq;package=com.tileiqpro.android;S.browser_fallback_url=" + encodeURIComponent(play.href) + ";end";
    appStore.style.display = "none";
  } else if (ios) {
    open.href = "tileiq://become-a-tester?src=" + encodeURIComponent(src);
    play.style.display = "none";
    // iPhone gives no way to ask whether an app is installed. If tapping didn't leave the page,
    // TileIQ probably isn't on this phone: say so and point at the App Store.
    open.addEventListener("click", function () {
      var left = false;
      var gone = function () { left = true; };
      document.addEventListener("visibilitychange", gone, { once: true });
      window.addEventListener("pagehide", gone, { once: true });
      setTimeout(function () { if (!left && !document.hidden) noStore.classList.add("show"); }, 1800);
    });
  } else {
    // A computer: the app is on phones; joining on the web works here.
    open.setAttribute("href", web.getAttribute("href"));
    open.firstChild.textContent = "Join on the web ";
    document.getElementById("bt-lead").textContent =
      "On your phone? Open this page there to join in the app. On a computer, join on the web with your TileIQ account, or get the app first.";
    web.parentElement.style.display = "none";
  }

  // Which buttons get used (only if the visitor allowed analytics; /analytics.js owns gtag).
  document.querySelectorAll("[data-action]").forEach(function (a) {
    a.addEventListener("click", function () {
      if (typeof window.gtag === "function") window.gtag("event", "tester_page_click",
        { link_location: a.getAttribute("data-action"), in_facebook: inFacebook ? "yes" : "no" });
    });
  });
})();
