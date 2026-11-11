// Admin dashboard → Marketing page (Phase 2, read-only). The marketing Worker and the main Worker
// are faked: the page is signed in with a made-up password and every call is answered here.
import { test, expect } from "./fixtures.mjs";

const MAIN = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const MKT = "https://tileiq-marketing.kevin-woodley.workers.dev";

const summary = (visits, extra = {}) => ({
  period: { start: "2026-10-14", end: "2026-11-10", days: 28 },
  metrics: { site_visits: visits, store_clicks: 17, demo_visits: 12, demo_engaged: 4, app_active_users: 40 },
  breakdowns: { campaign_store_clicks: [{ name: "nov-testers", value: 4 }] },
  app_funnel_distinct_tilers: { sign_up: 6, quote_generated: 5, quote_sent: 3 },
  search_console: { days_with_data: 20, clicks: 61, impressions: 2400, top_pages: [], near_first_page: [] },
  meta_ads: { spend_gbp: 24, campaigns: [] },
  installs_entered: [{ week_start: "2026-11-02", store: "google_play", installs: 5 }],
  ...extra,
});

const DATA = {
  status: { enabled: true, month_used_gbp: 16.2, monthly_cap_gbp: 20 },
  current: summary(411),
  previous: summary(300, { search_console: { days_with_data: 20, clicks: 50 }, meta_ads: { spend_gbp: 12 },
    app_funnel_distinct_tilers: { sign_up: 4, quote_generated: 5, quote_sent: 1 } }),
  daily: [],
  runs: [
    { id: "weekly-2026-11-02", kind: "weekly", period_start: "2026-11-02", period_end: "2026-11-08", status: "complete", started_at: "2026-11-09T05:30:00Z", error: null },
    { id: "daily-2026-11-10", kind: "daily", period_start: "2026-11-09", period_end: "2026-11-09", status: "failed", started_at: "2026-11-10T05:30:00Z", error: "Meta refused: token expired" },
  ],
  findings: [
    { id: 7, agent: "seo", title: "Adhesive guide sits just off page one", detail: "Rewrite the title.\nKeep the URL.", evidence: "2,400 impressions, position 9.4",
      expected_benefit: "More clicks", effort: "low", risk: "Low: wording only", confidence: "medium", status: "new", created_at: "2026-11-09T05:40:00Z" },
    { id: 8, agent: "campaign", title: "Ad <img src=x onerror=alert(1)> test", detail: "<b>bold?</b>", evidence: "4 store clicks", expected_benefit: "",
      effort: "low", risk: "", confidence: "low", status: "noted", created_at: "2026-11-09T05:41:00Z" },
  ],
  reports: [{ id: 3, kind: "weekly", period_start: "2026-11-02", period_end: "2026-11-08", emailed_at: "2026-11-09T05:45:00Z" }],
  health: [{ source: "website", last_data_day: "2026-11-09", last_error: null }, { source: "meta_ads", last_data_day: null, last_error: "token expired" }],
  ai_spend: [{ month: "2026-11-01", gbp: 16.2, calls: 40 }],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
});

async function goToMarketing(page) {
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-marketing").click();
}

async function openMarketing(page, calls = [], data = DATA) {
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), async route => {
    const req = route.request(), url = new URL(req.url());
    calls.push({ method: req.method(), path: url.pathname + url.search, secret: req.headers()["x-admin-secret"],
                 body: req.method() === "POST" ? req.postDataJSON() : null });
    if (url.pathname === "/api/marketing/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/marketing/report") return route.fulfill({ json: { id: 3, body_md: "# Weekly marketing report: 2026-11-02 to 2026-11-08\n\n## 1. What happened\n- Website visits: 98 (+12% on the previous period)\n1. **Fix the title** <script>x</script>" } });
    if (url.pathname === "/api/marketing/run") return route.fulfill({ json: { kind: "weekly", id: "weekly-x", started: true } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/");
  await goToMarketing(page);
  await expect(page.locator("#page-marketing")).toBeVisible();
  await expect(page.locator("#mkt-body")).toContainText("Website visits");
}

test("shows the figures with their sources, the AI spend, findings, runs and data health", async ({ page }) => {
  const calls = [];
  await openMarketing(page, calls);
  const body = page.locator("#mkt-body");
  expect(calls[0]).toMatchObject({ method: "GET", path: "/api/marketing/dashboard?days=28", secret: "test-pw" });
  await expect(body).toContainText("Marketing system: On");
  await expect(body).toContainText("AI spending this month: £16.20 of £20.00");
  await expect(body).toContainText("411");
  await expect(body).toContainText("+37% on previous");                       // 411 vs 300
  await expect(body).toContainText("not installs");
  await expect(body).toContainText("Confirmed installs");
  await expect(body).toContainText("Typed in weekly");
  await expect(body).toContainText("£24.00");
  await expect(body).toContainText("+100% on previous");                      // spend £24 vs £12
  await expect(body).not.toContainText("NaN");
  await expect(body).toContainText("£6.00");                                  // £24 ÷ 4 tagged store clicks
  await expect(body).toContainText("Adhesive guide sits just off page one");
  await expect(body).toContainText("Evidence: 2,400 impressions, position 9.4");
  await expect(body).toContainText("Meta refused: token expired");
  await expect(body).toContainText("Website tracking: data up to 2026-11-09");
  await expect(body).toContainText("2026-11: £16.20 (40 calls)");
});

test("AI-written text is shown as text, never run as code", async ({ page }) => {
  let alerted = false;
  page.on("dialog", d => { alerted = true; d.dismiss(); });
  await openMarketing(page);
  const body = page.locator("#mkt-body");
  await expect(body).toContainText("Ad <img src=x onerror=alert(1)> test");
  await expect(body).toContainText("<b>bold?</b>");
  await expect(body.locator("img")).toHaveCount(0);
  await expect(body.locator("b")).toHaveCount(0);
  await page.waitForTimeout(200);
  expect(alerted).toBe(false);
});

test("marks a finding noted or dismissed", async ({ page }) => {
  const calls = [];
  await openMarketing(page, calls);
  await page.locator("#mkt-f-7").getByRole("button", { name: "Noted" }).click();
  await expect.poll(() => calls.find(c => c.path === "/api/marketing/finding")).toMatchObject({ body: { id: 7, status: "noted" } });
  await page.locator("#mkt-f-8").getByRole("button", { name: "Dismiss" }).click();
  await expect.poll(() => calls.filter(c => c.path === "/api/marketing/finding").length).toBe(2);
  expect(calls.filter(c => c.path === "/api/marketing/finding")[1].body).toEqual({ id: 8, status: "dismissed" });
});

test("reads a report, with headings and lists but no HTML from the text", async ({ page }) => {
  await openMarketing(page);
  await page.getByRole("button", { name: "Read" }).click();
  const r = page.locator("#mkt-report");
  await expect(r.locator("h2")).toHaveText("Weekly marketing report: 2026-11-02 to 2026-11-08");
  await expect(r.locator("h3")).toHaveText("1. What happened");
  await expect(r.locator("strong")).toHaveText("Fix the title");
  await expect(r).toContainText("<script>x</script>");
  await expect(r.locator("script")).toHaveCount(0);
});

test("saves a week's installs", async ({ page }) => {
  const calls = [];
  await openMarketing(page, calls);
  await page.locator("#mkt-week").fill("2026-11-02");
  await page.locator("#mkt-store").selectOption("app_store");
  await page.locator("#mkt-installs").fill("3");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#mkt-installs-msg")).toHaveText("Saved.");
  expect(calls.find(c => c.path === "/api/marketing/installs").body).toEqual({ week_start: "2026-11-02", store: "app_store", installs: 3 });
});

test("starts a run by hand, and the off switch asks first", async ({ page }) => {
  const calls = [];
  await openMarketing(page, calls);
  await page.getByRole("button", { name: "Run last week's agents + report" }).click();
  await expect(page.locator("#mkt-run-msg")).toContainText("Started");
  expect(calls.find(c => c.path === "/api/marketing/run").body).toEqual({ kind: "weekly" });

  page.once("dialog", d => d.dismiss());
  await page.locator("#mkt-switch").click();
  await page.waitForTimeout(300);
  expect(calls.some(c => c.path === "/api/marketing/switch")).toBe(false);
  page.once("dialog", d => d.accept());
  await page.locator("#mkt-switch").click();
  await expect.poll(() => calls.find(c => c.path === "/api/marketing/switch")?.body).toEqual({ enabled: false });
});

test("explains what to check if the marketing Worker isn't set up", async ({ page }) => {
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), route => route.fulfill({ status: 401, json: { error: "Unauthorized" } }));
  await page.goto("/admin/");
  await goToMarketing(page);
  await expect(page.locator("#mkt-body")).toContainText("sql/2026-11-marketing.sql");
  await expect(page.locator("#mkt-body")).toContainText("Unauthorized");
});

test("there is nothing on the page that publishes, posts or spends", async ({ page }) => {
  await openMarketing(page);
  const buttons = await page.locator("#page-marketing button").allInnerTexts();
  for (const b of buttons) expect(b).not.toMatch(/publish|post|approve|boost|spend|budget/i);
});
