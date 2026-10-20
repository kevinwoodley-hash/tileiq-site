// Logs when a search or AI crawler fetches a guide, calculator, robots.txt or the sitemap, so the
// admin Traffic page can show when each crawler last read each page. Used by the small
// _middleware.js / route files under functions/. The page is always served exactly as before:
// logging happens after the response, in the background, and any failure is ignored.
//
// Sends only the crawler's name (from its user agent), the path and the status code to the
// worker's /api/crawler-hit, authenticated with CRAWLER_LOG_KEY (a Pages secret that can only
// add rows to the crawler log). Without that secret set, nothing is logged.
const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";

// Order matters where one name contains another (Claude-SearchBot before ClaudeBot etc.)
const BOTS = [
  [/OAI-SearchBot/i, "OAI-SearchBot"], [/ChatGPT-User/i, "ChatGPT-User"], [/GPTBot/i, "GPTBot"],
  [/Google-InspectionTool/i, "Google-InspectionTool"], [/Googlebot/i, "Googlebot"], [/bingbot/i, "Bingbot"],
  [/Perplexity-User/i, "Perplexity-User"], [/PerplexityBot/i, "PerplexityBot"],
  [/Claude-SearchBot/i, "Claude-SearchBot"], [/Claude-User/i, "Claude-User"], [/ClaudeBot/i, "ClaudeBot"],
  [/Applebot/i, "Applebot"], [/DuckDuckBot/i, "DuckDuckBot"], [/YandexBot/i, "YandexBot"],
  [/meta-externalagent|facebookbot/i, "Meta"], [/Amazonbot/i, "Amazonbot"], [/CCBot/i, "CCBot"],
  [/Bytespider/i, "Bytespider"], [/MistralAI-User/i, "MistralAI-User"],
];

export async function logCrawler(context) {
  const response = await context.next();
  try {
    const { request, env } = context;
    const ua = request.headers.get("User-Agent") || "";
    const hit = env.CRAWLER_LOG_KEY && (request.method === "GET" || request.method === "HEAD") && BOTS.find(b => b[0].test(ua));
    if (hit) {
      const cf = request.cf || {};
      const verified = cf.verifiedBotCategory ? true : (cf.botManagement && typeof cf.botManagement.verifiedBot === "boolean" ? cf.botManagement.verifiedBot : null);
      context.waitUntil(fetch(`${WORKER}/api/crawler-hit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Crawler-Key": env.CRAWLER_LOG_KEY },
        body: JSON.stringify({ bot: hit[1], path: new URL(request.url).pathname.slice(0, 120), status: response.status, verified }),
      }).catch(() => {}));
    }
  } catch (e) { /* never affect the page */ }
  return response;
}
