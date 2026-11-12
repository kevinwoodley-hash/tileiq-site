// Admin dashboard → Marketing page: AI search visibility (Phase D of the 12 Nov 2026 review). Each
// question in each setup (model, with or without web search) as a grid; every answer in full with the
// date, searches made and sources; its own monthly budget. Workers faked.
import { test, expect } from "./fixtures.mjs";

const MAIN = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const MKT = "https://tileiq-marketing.kevin-woodley.workers.dev";
const V = (qid, question, model, mode, named, extra = {}) => ({ question_id: qid, question, question_set: "2026-11-v1", provider: "anthropic", model, mode,
  checked_at: "2026-11-16T05:50:00Z", mentions_tileiq: named, tileiq_cited: false, competitors: ["Tradify"], citations: [], searches: 0, search_queries: [],
  answer: `${model} ${mode} answer`, previous_mentions_tileiq: null, ...extra });
const Q1 = "What is the best quoting app for UK tilers?", Q2 = "Is there software specifically for tiling businesses?";
const DATA = {
  status: { enabled: true, month_used_gbp: 2, monthly_cap_gbp: 20 },
  current: { period: { start: "2026-11-09", end: "2026-11-15", days: 7 }, metrics: { site_visits: 90 } },
  previous: { metrics: {} }, daily: [], runs: [], findings: [], reports: [], health: [], ai_spend: [], approvals_ready: true,
  phase3: { waiting: 0, queue: [], plan: null, competitor_findings: [], competitor_pages: [], visibility_budget: { task: "visibility", cap_gbp: 6, used_gbp: 0.42 },
    visibility: [
      V("best-quote-app", Q1, "claude-haiku-5-5", "web", true, { tileiq_cited: true, searches: 2, search_queries: ["best quoting app UK tilers"],
        citations: [{ url: "https://tile-iq.com/tiling-quote-app/", title: "TileIQ quote app" }, { url: "javascript:alert(1)", title: "bad" }], previous_mentions_tileiq: false }),
      V("best-quote-app", Q1, "claude-haiku-5-5", "plain", false),
      V("best-quote-app", Q1, "claude-sonnet-5-5", "plain", true),
      V("best-quote-app", Q1, "claude-sonnet-5-5", "web", true),
      V("tiling-software", Q2, "claude-haiku-5-5", "web", false, { previous_mentions_tileiq: true }),
      V("tiling-software", Q2, "claude-haiku-5-5", "plain", false),
      V("tiling-software", Q2, "claude-sonnet-5-5", "plain", false),
      V("tiling-software", Q2, "claude-sonnet-5-5", "web", false, { answer: "<img src=x onerror=alert(1)>" }),
    ] } };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), route => route.fulfill({ json: DATA }));
  await page.goto("/admin/");
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-marketing").click();
  await expect(page.locator("#mkt-body")).toContainText("Website visits");
});

test("a grid of questions by setup, with totals, changes and the budget", async ({ page }) => {
  const box = page.locator("#mkt-visibility");
  await expect(box).toContainText("These checks this month: £0.42 of their own £6.00");
  const head = box.locator("thead th");
  await expect(head).toHaveCount(5);
  await expect(head.nth(1)).toContainText("Haiku 5.5");
  await expect(head.nth(1)).toContainText("no web search");
  await expect(head.nth(2)).toContainText("web search");
  const row1 = box.locator("tbody tr").nth(0);
  await expect(row1).toContainText(Q1);
  await expect(row1.locator("td").nth(2)).toContainText("TileIQ named");              // Haiku, web
  await expect(row1.locator("td").nth(2)).toContainText("new");
  await expect(row1.locator("td").nth(2)).toContainText("cited tile-iq.com");
  await expect(box.locator("tbody tr").nth(1).locator("td").nth(2)).toContainText("dropped");
  await expect(box.locator("tbody tr").last()).toContainText("Named in");
  await expect(box.locator("tbody tr").last().locator("td").nth(3)).toHaveText("1 of 2");   // Sonnet, no web search
});

test("every answer in full: model, mode, date, question set, searches, safe sources; AI text never runs", async ({ page }) => {
  let alerted = false;
  page.on("dialog", d => { alerted = true; d.dismiss(); });
  const box = page.locator("#mkt-visibility");
  await box.locator("summary").click();
  await expect(box).toContainText("Haiku 5.5 · with web search · 16/11/2026 · question set 2026-11-v1");
  await expect(box).toContainText("Searched for: “best quoting app UK tilers”");
  await expect(box.getByRole("link", { name: "TileIQ quote app" })).toHaveAttribute("href", "https://tile-iq.com/tiling-quote-app/");
  await expect(box.locator("a", { hasText: "bad" })).toHaveCount(0);
  await expect(box).toContainText("<img src=x onerror=alert(1)>");
  await expect(box.locator("img")).toHaveCount(0);
  expect(alerted).toBe(false);
});
