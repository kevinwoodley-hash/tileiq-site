// Admin dashboard → Marketing page: "Prepare…" on a recommendation (Phase C of the 12 Nov 2026 review).
// The button matches the recommendation's type, sends only its id, then shows what was prepared;
// development tasks and SEO proposals get their own labels and a Copy button. Workers faked.
import { test, expect } from "./fixtures.mjs";

const MAIN = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const MKT = "https://tileiq-marketing.kevin-woodley.workers.dev";
const H = "a".repeat(64);
const rec = (id, action_type, extra = {}) => ({ id, kind: "recommendation", title: `Recommendation ${id}`, agent: "manager", audience: "",
  evidence: "2 to 8 Nov: 12 store clicks", expected_outcome: "", confidence: "medium", est_cost_gbp: 0, risks: "", status: "pending",
  current_version: 1, content_hash: H, checks: { blocked: false, internal: true }, last_decision: null, updated_at: "2026-11-16T06:00:00Z",
  content: { text: "Next step", problem: "A problem", why_it_matters: "w", solution: "s", expected_benefit: "b", confidence_reason: "r", action_type }, ...extra });
const TASK = { id: 40, kind: "dev_task", title: "Add campaign tokens to App Store links", agent: "prepare", audience: "", evidence: "", expected_outcome: "",
  confidence: "medium", est_cost_gbp: 0, risks: "", status: "pending", current_version: 1, content_hash: H, checks: { blocked: false, internal: true },
  last_decision: null, updated_at: "2026-11-16T07:00:00Z", content: { text: "Where: Website (tile-iq.com)\n\nTag store links.", from_recommendation: 21 } };
const base = queue => ({
  status: { enabled: true, month_used_gbp: 1, monthly_cap_gbp: 20 },
  current: { period: { start: "2026-11-09", end: "2026-11-15", days: 7 }, metrics: { site_visits: 90 } },
  previous: { metrics: {} }, daily: [], runs: [], findings: [], reports: [], health: [], ai_spend: [], approvals_ready: true,
  phase3: { waiting: queue.length, queue, plan: null, competitor_findings: [], competitor_pages: [], visibility: [] } });

async function open(page, data, calls = [], prepareReply = null) {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
  let current = data;
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    calls.push({ path, body: req.method() === "POST" ? req.postDataJSON() : null });
    if (path === "/api/marketing/dashboard") return route.fulfill({ json: current });
    if (path === "/api/marketing/action/prepare") {
      const r = prepareReply || { status: 200, json: { ok: true, created: [{ id: 40, kind: "dev_task", title: TASK.title }] } };
      if (r.json.ok) current = base([...data.phase3.queue, TASK]);
      return route.fulfill(r);
    }
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/");
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-marketing").click();
  await expect(page.locator("#mkt-body")).toContainText("Website visits");
}

test("each recommendation type gets the right button; look-into-it and old ones get none", async ({ page }) => {
  await open(page, base([rec(21, "dev_task"), rec(22, "tracking"), rec(23, "marketing_draft"), rec(24, "seo_change"),
    rec(25, "investigate"), rec(26, "approve_draft"), rec(27, undefined), rec(28, "dev_task", { status: "done" })]));
  await expect(page.locator("#mkt-a-21 .mkt-prepare")).toHaveText("Prepare development task");
  await expect(page.locator("#mkt-a-22 .mkt-prepare")).toHaveText("Prepare development task");
  await expect(page.locator("#mkt-a-23 .mkt-prepare")).toHaveText("Prepare marketing draft");
  await expect(page.locator("#mkt-a-24 .mkt-prepare")).toHaveText("Prepare SEO improvement");
  for (const id of [25, 26, 27, 28]) await expect(page.locator(`#mkt-a-${id} .mkt-prepare`)).toHaveCount(0);
});

test("preparing sends only the id, then shows the task linked both ways, with its own label and Copy", async ({ page }) => {
  const calls = [];
  await open(page, base([rec(21, "dev_task")]), calls);
  await page.locator("#mkt-a-21 .mkt-prepare").click();
  await expect(page.locator("#mkt-a-40")).toBeVisible();
  expect(calls.find(c => c.path === "/api/marketing/action/prepare").body).toEqual({ id: 21 });
  await expect(page.locator("#mkt-msg-40")).toHaveText("Prepared. Check it, then approve, edit or reject.");
  await expect(page.locator("#mkt-a-40")).toContainText("Development task");
  await expect(page.locator("#mkt-a-40")).toContainText("you build it, nothing changes until you do");
  await expect(page.locator("#mkt-a-40")).toContainText("Prepared from recommendation: Recommendation 21");
  await expect(page.locator("#mkt-a-40").getByRole("button", { name: "Copy text" })).toBeVisible();
  await expect(page.locator("#mkt-a-21")).toContainText("Prepared: Development task: Add campaign tokens to App Store links");
  await expect(page.locator("#mkt-a-21 .mkt-prepare")).toHaveCount(0);           // once per recommendation
});

test("a refusal is shown and the button comes back", async ({ page }) => {
  await open(page, base([rec(24, "seo_change")]), [], { status: 200, json: { ok: false, error: "the recommendation doesn't name a tile-iq.com page" } });
  await page.locator("#mkt-a-24 .mkt-prepare").click();
  await expect(page.locator("#mkt-msg-24")).toHaveText("Not prepared: the recommendation doesn't name a tile-iq.com page");
  await expect(page.locator("#mkt-a-24 .mkt-prepare")).toBeEnabled();
});
