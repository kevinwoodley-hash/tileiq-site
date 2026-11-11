// Admin dashboard → Marketing page, Phase 3: approval queue, weekly plan, competitors, AI visibility.
// Both Workers are faked. Approving sends the exact version + hash + authenticator code; nothing is posted anywhere.
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
  evidence: "12 demo visits from Facebook", expected_outcome: "More demo visits", confidence: "medium", est_cost_gbp: 0, risks: "",
  status: "pending", current_version: 2, content_hash: H1, checks: { blocked: false, problems: [] }, last_decision: null,
  content: { text: "Measure the room, price the job, send the quote before you leave.", call_to_action: "Try the demo", angle: "speed", rationale: "Demo visitors convert" },
  updated_at: "2026-11-10T06:00:00Z", ...o });

const PHASE3 = {
  waiting: 2,
  queue: [
    action({}),
    action({ id: 2, kind: "facebook_group_post", title: "Group <img src=x onerror=alert(1)>", content_hash: H2, current_version: 1,
      content: { text: "Used by 5,000 tilers <b>bold</b>", call_to_action: "" },
      checks: { blocked: true, problems: ["Claims a number of users the knowledge base doesn't support"] } }),
    action({ id: 3, kind: "ad_concept", title: "Ad: price a bathroom", status: "approved", content_hash: H3, current_version: 1, est_cost_gbp: 30,
      last_decision: { decision: "approve", note: "" } }),
  ],
  plan: { period_start: "2026-11-09", items: [{ title: "Fix the adhesive guide title", impact: "high", confidence: "medium", effort: "low", cost_gbp: 0,
    next_step: "Rewrite the title tag", evidence: "2,400 impressions at position 9.4" }] },
  competitor_findings: [
    { id: 11, competitor: "Tradify", kind: "price", fact: "UK price shown per user per month", quote: "£39 per user / month", source_url: "https://www.tradifyhq.com/uk/pricing",
      observed_on: "2026-11-09", interpretation: "Priced for teams", tileiq_angle: "One price for a sole trader", status: "new" },
    { id: 12, competitor: "Odd", kind: "other", fact: "Bad link", quote: "x", source_url: "javascript:alert(1)", observed_on: "2026-11-09", interpretation: "", tileiq_angle: "", status: "noted" },
  ],
  competitor_pages: [{ competitor: "Tradify", url: "https://www.tradifyhq.com/uk/pricing", last_changed_at: "2026-11-09T05:35:00Z", last_error: null },
    { competitor: "Mucka", url: "https://mucka.ai/pricing/", last_changed_at: null, last_error: "robots.txt disallows" }],
  visibility: [
    { question_id: "q1", question: "Best app for tilers to quote jobs UK?", provider: "anthropic", model: "claude-sonnet-5-5", checked_at: "2026-11-09T05:50:00Z",
      mentions_tileiq: true, tileiq_cited: true, competitors: ["Tradify"], answer: "TileIQ Pro and Tradify…", previous_mentions_tileiq: false },
    { question_id: "q2", question: "How do I estimate tile adhesive?", provider: "anthropic", model: "claude-sonnet-5-5", checked_at: "2026-11-09T05:51:00Z",
      mentions_tileiq: false, tileiq_cited: false, competitors: [], answer: "Use a calculator…", previous_mentions_tileiq: true },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
});

async function open(page, { data = { ...BASE, phase3: PHASE3, approvals_ready: true }, calls = [], decide } = {}) {
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), async route => {
    const req = route.request(), url = new URL(req.url());
    calls.push({ method: req.method(), path: url.pathname + url.search, secret: req.headers()["x-admin-secret"], body: req.method() === "POST" ? req.postDataJSON() : null });
    if (url.pathname === "/api/marketing/dashboard") return route.fulfill({ json: data });
    if (url.pathname === "/api/marketing/action/decide") return decide ? decide(route) : route.fulfill({ json: { ok: true } });
    if (url.pathname === "/api/marketing/action/edit") return route.fulfill({ json: { id: 1, version: 3, hash: "d".repeat(64), checks: { blocked: false } } });
    if (url.pathname === "/api/marketing/action") return route.fulfill({ json: { id: 1, versions: [
        { version: 1, author: "social", content: { text: "First wording" } }, { version: 2, author: "Kevin", content: { text: "Second wording" } }],
      audit: [{ at: "2026-11-10T06:00:00Z", actor: "social", event: "proposed", detail: { version: 1 } },
              { at: "2026-11-10T07:00:00Z", actor: "Kevin", event: "refused", detail: { version: 1, reason: "not the current version" } }] } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/");
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-marketing").click();
  await expect(page.locator("#mkt-body")).toContainText("Website visits");
}

test("says what to do when Phase 3 isn't set up", async ({ page }) => {
  await open(page, { data: { ...BASE, phase3: null, approvals_ready: false } });
  await expect(page.locator("#mkt-body")).toContainText("Not set up yet");
  await expect(page.locator("#mkt-queue")).toHaveCount(0);
});

test("shows the queue as previews, holds back blocked drafts and escapes AI text", async ({ page }) => {
  let dialogs = 0;
  page.on("dialog", d => { dialogs++; d.dismiss(); });
  await open(page);
  const q = page.locator("#mkt-queue");
  await expect(q).toContainText("2 waiting");
  await expect(q).toContainText("nothing is posted");
  await expect(page.locator("#mkt-a-1 .mkt-preview")).toContainText("send the quote before you leave");
  await expect(page.locator("#mkt-a-1")).toContainText("version 2");
  await expect(page.locator("#mkt-a-1 .mkt-approve")).toBeEnabled();
  const blocked = page.locator("#mkt-a-2");
  await expect(blocked).toContainText("Held back by the claims check");
  await expect(blocked).toContainText("number of users");
  await expect(blocked).toContainText("Group <img src=x onerror=alert(1)>");
  await expect(blocked).toContainText("<b>bold</b>");
  await expect(blocked.locator(".mkt-approve")).toBeDisabled();
  await expect(blocked.getByRole("button", { name: "Copy text" })).toBeVisible();
  await expect(page.locator("#mkt-a-3")).toContainText("suggested test budget £30.00");
  await expect(page.locator("#mkt-a-3").getByRole("button", { name: "Approve test budget" })).toBeVisible();
  await expect(page.locator("#mkt-a-3 .mkt-approve")).toHaveCount(0);
  expect(dialogs).toBe(0);
  expect(await page.locator("#mkt-body img").count()).toBe(0);
});

test("approving asks for the authenticator code and sends that exact version", async ({ page }) => {
  const calls = [];
  page.on("dialog", d => d.accept("123456"));
  await open(page, { calls });
  await page.locator("#mkt-a-1 .mkt-approve").click();
  await expect(page.locator("#mkt-msg-1")).toContainText("Approved. Nothing has been posted.");
  const post = calls.find(c => c.path === "/api/marketing/action/decide");
  expect(post).toMatchObject({ secret: "test-pw", body: { id: 1, version: 2, hash: H1, decision: "approve", code: "123456" } });
});

test("a refused decision shows the reason; cancelling the code prompt sends nothing", async ({ page }) => {
  const calls = [];
  let answer = null;
  page.on("dialog", d => answer === null ? d.dismiss() : d.accept(answer));
  await open(page, { calls, decide: r => r.fulfill({ status: 409, json: { ok: false, reason: "this isn't the current version" } }) });
  await page.locator("#mkt-a-1 .mkt-approve").click();
  await page.waitForTimeout(200);
  expect(calls.some(c => c.path.endsWith("/decide"))).toBe(false);
  answer = "000000";
  await page.locator("#mkt-a-1 .mkt-approve").click();
  await expect(page.locator("#mkt-msg-1")).toContainText("Not done: this isn't the current version");
});

test("rejecting asks why; budget approval asks the amount then the code", async ({ page }) => {
  const calls = [];
  const answers = ["Too salesy", "£40", "654321"];
  page.on("dialog", d => d.accept(answers.shift()));
  await open(page, { calls });
  await page.locator("#mkt-a-1").getByRole("button", { name: "Reject" }).click();
  await expect(page.locator("#mkt-msg-1")).toContainText("Rejected.");
  await page.locator("#mkt-a-3").getByRole("button", { name: "Approve test budget" }).click();
  await expect(page.locator("#mkt-msg-3")).toContainText("Budget approved.");
  const posts = calls.filter(c => c.path.endsWith("/decide")).map(c => c.body);
  expect(posts[0]).toMatchObject({ id: 1, version: 2, hash: H1, decision: "reject", note: "Too salesy" });
  expect(posts[1]).toMatchObject({ id: 3, version: 1, hash: H3, decision: "approve_budget", budget_gbp: 40, code: "654321" });
});

test("editing saves a new version; history lists the audit trail and versions", async ({ page }) => {
  const calls = [];
  await open(page, { calls });
  await page.locator("#mkt-a-1").getByRole("button", { name: "Edit" }).click();
  const text = page.locator("#mkt-edit-text-1");
  await expect(text).toHaveValue("Measure the room, price the job, send the quote before you leave.");
  await text.fill("Price the job on site.");
  await page.locator("#mkt-edit-cta-1").fill("See the demo");
  await page.getByRole("button", { name: "Save as new version" }).click();
  await expect(page.locator("#mkt-msg-1")).toContainText("Saved as version 3.");
  expect(calls.find(c => c.path.endsWith("/action/edit")).body).toEqual({ id: 1, text: "Price the job on site.", call_to_action: "See the demo" });
  await page.locator("#mkt-a-1").getByRole("button", { name: "History" }).click();
  const hist = page.locator("#mkt-hist-1");
  await expect(hist).toContainText("proposed");
  await expect(hist).toContainText("refused");
  await expect(hist).toContainText("not the current version");
  await hist.locator("summary").click();
  await expect(hist).toContainText("Second wording");
});

test("warns when approvals aren't set up and disables Approve", async ({ page }) => {
  await open(page, { data: { ...BASE, phase3: PHASE3, approvals_ready: false } });
  await expect(page.locator("#mkt-queue")).toContainText("TOTP_SECRET");
  await expect(page.locator("#mkt-a-1 .mkt-approve")).toBeDisabled();
});

test("shows the plan, quoted competitor facts with safe links, and AI visibility changes", async ({ page }) => {
  const calls = [];
  await open(page, { calls });
  const body = page.locator("#mkt-body");
  await expect(body).toContainText("This week's plan");
  await expect(body).toContainText("1. Fix the adhesive guide title");
  await expect(body).toContainText("2,400 impressions at position 9.4");
  const f = page.locator("#mkt-cf-11");
  await expect(f).toContainText("“£39 per user / month”");
  await expect(f.getByRole("link", { name: "source" })).toHaveAttribute("href", "https://www.tradifyhq.com/uk/pricing");
  await expect(page.locator("#mkt-cf-12 a")).toHaveCount(0);
  await expect(body).toContainText("robots.txt disallows");
  await expect(body).toContainText("TileIQ named");
  await expect(body).toContainText("new");
  await expect(body).toContainText("dropped");
  await f.getByRole("button", { name: "Noted" }).click();
  await expect.poll(() => calls.find(c => c.path.endsWith("/competitor-finding"))?.body).toEqual({ id: 11, status: "noted" });
});
