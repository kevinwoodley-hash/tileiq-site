// PostHog reverse proxy: tile-iq.com/ingest/* → PostHog EU cloud.
// The app and web demo send PostHog traffic here instead of *.posthog.com, so ad
// blockers and DNS filters that block PostHog's domains don't drop it. Requests are
// passed through unchanged except: our cookies are never forwarded, and the
// visitor's IP goes in X-Forwarded-For so PostHog's country lookup still works
// (it would otherwise see Cloudflare's IP). Responses, including PostHog's CORS
// headers for the native apps (origin https://localhost), come back as they are.
const API_HOST = "eu.i.posthog.com";
const ASSET_HOST = "eu-assets.i.posthog.com";

export async function onRequest({ request, params }) {
  const url = new URL(request.url);
  const path = "/" + [].concat(params.path || []).join("/");
  const host = path.startsWith("/static/") || path.startsWith("/array/") ? ASSET_HOST : API_HOST;
  const target = new URL("https://" + host + path + url.search);

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.set("host", host);
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  const res = await fetch(target, init);

  const out = new Response(res.body, res);
  out.headers.delete("set-cookie");
  return out;
}
