// Admin dashboard → Marketing page, Phase 4: publishing approved posts to the TileIQ Facebook Page.
// Both Workers are faked; nothing is posted anywhere. Publish shows the exact words, asks for the
// authenticator code, and sends that exact version + hash.
import { test, expect } from "./fixtures.mjs";

const MAIN = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const MKT = "https://tileiq-marketing.kevin-woodley.workers.dev";
const H1 = "a".repeat(64), H2 = "b".repeat(64), H3 = "c".repeat(64);

const BASE = {
  status: { enabled: true, month_used_gbp: 3, monthly_cap_gbp: 20 },
  current: { period: { start: "2026-10-14", end: "2026-11-10", days: 28 }, metrics: { site_visits: 100 } },
  previous: { metrics: {} }, daily: [], runs: [], findings: [], reports: [], health: [], ai_spend: [],
};
const action = (o) => ({ id: 1, kind: "facebook_page_post", title: "Quote on the van", agent: "social", audience: "sole traders",
  evidence: "12 demo visits", expected_outcome: "More demo visits", confidence: "medium", est_cost_gbp: 0, risks: "",
  status: "approved", current_version: 2, content_hash: H1, checks: { blocked: false, problems: [] }, last_decision: null,
  content: { text: "Measure the room, price the job, send the quote before you leave.", call_to_action: "Try the demo at tile-iq.com/app/demo" },
  updated_at: "2026-11-10T06:00:00Z", ...o });
const PHASE3 = { waiting: 0, plan: null, competitor_findings: [], competitor_pages: [], visibility: [], queue: [
  action({}),
  action({ id: 2, kind: "facebook_group_post", title: "Group post", content_hash: H2, current_version: 1 }),
  action({ id: 3, title: "Posted <img src=x onerror=alert(1)>", status: "done", content_hash: H3, current_version: 1 }),
  action({ id: 4, title: "Stuck one", content_hash: H3, current_version: 1 }),
] };
const PHASE4 = { config: { enabled: true, max_per_day: 1, max_per_week: 3 }, today: 0, this_week: 1, publications: [
  { action_id: 3, title: "Posted <img src=x onerror=alert(1)>", status: "published", post_url: "https://www.facebook.com/123_456", attempts: 1,
    published_at: "2026-11-10T09:00:00Z", reach: 410, reactions: 9, comments: 2, shares: 1, figures_on: "2026-11-11", stuck: false },
  { action_id: 4, title: "Stuck one", status: "publishing", post_url: null, attempts: 1, started_at: "2026-11-11T09:00:00Z", stuck: true },
] };
const READY = { ...BASE, phase3: PHASE3, approvals_ready: true, phase4: PHASE4, publishing_ready: true };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
});

async function open(page, { data = READY, calls = [], publish } = {}) {
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), async route => {
    const req = route.request(), url = new URL(req.url());
    calls.push({ method: req.method(), path: url.pathname, secret: req.headers()["x-admin-secret"], body: req.method() === "POST" ? req.postDataJSON() : null });
    if (url.pathname === "/api/marketing/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/marketing/action/publish") return publish ? publish(route) : route.fulfill({ json: { ok: true, post_url: "https://www.facebook.com/1_2" } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/");
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-marketing").click();
  await expect(page.locator("#mkt-body")).toContainText("Website visits");
}

test("says what to do when Phase 4 isn't set up, or the Page isn't connected", async ({ page }) => {
  await open(page, { data: { ...READY, phase4: null, publishing_ready: false } });
  await expect(page.locator("#mkt-body")).toContainText("sql/2026-11-marketing-phase4.sql");
  await expect(page.locator("#mkt-a-1 .mkt-publish")).toBeDisabled();
});

test("the publishing panel: switch, limits, posts with figures and safe links", async ({ page }) => {
  const calls = [];
  await open(page, { calls });
  const panel = page.locator("#mkt-publishing");
  await expect(panel).toContainText("Publishing is on");
  await expect(panel).toContainText("today 0 of 1, this week 1 of 3");
  await expect(panel).toContainText("reach 410, 9 reactions, 2 comments, 1 shares");
  await expect(panel).toContainText("Posted <img src=x onerror=alert(1)>");          // shown as text, not run
  await expect(panel.getByRole("link", { name: "view" })).toHaveAttribute("href", "https://www.facebook.com/123_456");
  await panel.getByRole("button", { name: "Switch publishing off" }).click();
  await expect.poll(() => calls.find(c => c.path === "/api/marketing/publishing")?.body).toEqual({ enabled: false });
});

test("Publish shows the exact words, asks for the code and sends that exact version", async ({ page }) => {
  const calls = [], dialogs = [];
  page.on("dialog", d => { dialogs.push({ type: d.type(), message: d.message() }); d.type() === "prompt" ? d.accept("123456") : d.accept(); });
  await open(page, { calls });
  await expect(page.locator("#mkt-a-2 .mkt-publish")).toHaveCount(0);              // group posts: copy and paste only
  await page.locator("#mkt-a-1 .mkt-publish").click();
  await expect.poll(() => calls.find(c => c.path === "/api/marketing/action/publish")?.body)
    .toEqual({ id: 1, version: 2, hash: H1, code: "123456" });
  expect(dialogs[0].type).toBe("confirm");
  expect(dialogs[0].message).toContain("Measure the room, price the job, send the quote before you leave.\n\nTry the demo at tile-iq.com/app/demo");
  expect(dialogs[1].type).toBe("prompt");
  expect(calls.find(c => c.path === "/api/marketing/action/publish").secret).toBe("test-pw");
});

test("cancelling sends nothing; a refusal shows the reason", async ({ page }) => {
  const calls = [];
  let answer = "dismiss";
  page.on("dialog", d => answer === "dismiss" ? d.dismiss() : (d.type() === "prompt" ? d.accept("000000") : d.accept()));
  await open(page, { calls, publish: route => route.fulfill({ status: 409, json: { ok: false, reason: "the limit is 1 Page post(s) a day" } }) });
  await page.locator("#mkt-a-1 .mkt-publish").click();
  await page.waitForTimeout(300);
  expect(calls.filter(c => c.path === "/api/marketing/action/publish")).toHaveLength(0);
  answer = "accept";
  await page.locator("#mkt-a-1 .mkt-publish").click();
  await expect(page.locator("#mkt-msg-1")).toContainText("Not posted: the limit is 1 Page post(s) a day");
});

test("a published post links to Facebook; a stuck one offers a retry only after a warning", async ({ page }) => {
  const calls = [], dialogs = [];
  page.on("dialog", d => { dialogs.push(d.message()); d.accept(); });
  await open(page, { calls });
  await expect(page.locator("#mkt-a-3").getByRole("link", { name: "View on Facebook" })).toHaveAttribute("href", "https://www.facebook.com/123_456");
  const stuck = page.locator("#mkt-a-4");
  await expect(stuck).toContainText("never reported back");
  await expect(stuck.locator(".mkt-publish")).toHaveCount(0);
  await stuck.getByRole("button", { name: "It didn't post: allow a retry" }).click();
  await expect.poll(() => calls.find(c => c.path === "/api/marketing/action/publish-reset")?.body).toEqual({ id: 4 });
  expect(dialogs[0]).toMatch(/NOT on the TileIQ Facebook Page/);
});
