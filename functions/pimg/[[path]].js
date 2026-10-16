// Portfolio photos on the tiler mini websites: tile-iq.com/pimg/<image id>/<t|f>.jpg
// (t = 600px thumbnail, f = full size). Fetched from the worker, which only returns a
// photo while its project is published, it isn't hidden and the tiler's site is on;
// cached here at the edge for 10 minutes, so unpublishing takes effect within that.
const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";

export async function onRequestGet({ request, params, waitUntil }) {
  const parts = [].concat(params.path || []);
  const m = parts.length === 2 && /^[0-9a-f-]{36}$/i.test(parts[0]) && /^(t|f)\.jpg$/.exec(parts[1]);
  if (!m) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  const key = new Request(new URL(request.url).origin + "/pimg/" + parts[0].toLowerCase() + "/" + m[1] + ".jpg");
  const hit = await cache.match(key);
  if (hit) return hit;

  const res = await fetch(`${WORKER}/api/portfolio/img/${parts[0].toLowerCase()}/${m[1]}`);
  const out = new Response(res.ok ? res.body : "Not found", {
    status: res.ok ? 200 : 404,
    headers: {
      "Content-Type": res.ok ? "image/jpeg" : "text/plain",
      "Cache-Control": res.ok ? "public, max-age=600" : "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
  waitUntil(cache.put(key, out.clone()));
  return out;
}
