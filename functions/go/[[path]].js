// Partner links: tile-iq.com/go/<code> (e.g. /go/sft) is what a partner company puts on its own
// website. The code is checked with the worker (public details only), then the visitor goes to the
// signup page tagged with the partner, plus partner=<CODE>, which analytics.js carries on to the store
// links (Google Play install referrer), the web app and signup, so the tiler's account can be linked
// to the partner for its commission. Nothing is stored in the visitor's browser here.
// Every visitor goes straight to the signup page (Kevin, 21 Nov 2026): the account is made there with
// the partner already attached, then they download the app and sign in. This is also the only way
// an iPhone signup is recorded without typing the code (the App Store passes nothing on).
// Unknown or paused codes go to the plain signup page (no partner). If the worker can't be reached, the visitor
// still gets the code (the app checks it again when it's used), just without the partner's tags.
const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev/api/partner-link";
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,23}$/;

export async function onRequestGet({ request, params }) {
  const url = new URL(request.url);
  const code = String([].concat(params.path || [])[0] || "").trim().toUpperCase();   // /go/sft and /go/sft/ alike
  const go = (path, q) => {
    const to = new URL(path, url.origin);
    for (const [k, v] of Object.entries(q || {})) to.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { Location: to.pathname + to.search, "Cache-Control": "no-store" } });
  };
  if (!CODE_RE.test(code)) return go("/signup.html");
  let p = null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(WORKER + "?code=" + encodeURIComponent(code), { signal: ctl.signal, cf: { cacheTtl: 300 } });
    clearTimeout(t);
    p = r.ok ? await r.json() : null;
    // Only a clear yes or no counts; anything else (e.g. a worker without this endpoint yet) is "unknown".
    if (!p || (p.ok !== true && p.ok !== false) || (p.ok === true && !(p.utm_source && p.utm_campaign && p.code))) p = null;
  } catch (e) { p = null; }
  if (p && p.ok === false) return go("/signup.html");
  const to = "/signup.html";
  if (!p) return go(to, { partner: code });
  return go(to, { utm_source: p.utm_source, utm_medium: "referral", utm_campaign: p.utm_campaign, partner: p.code });
}
