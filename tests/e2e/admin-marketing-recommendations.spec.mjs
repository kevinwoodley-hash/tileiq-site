// Admin dashboard → Marketing page: the Marketing Manager's one list of recommendations (Phase B of
// the 12 Nov 2026 review). Each recommendation shows the full format; agent findings are folded
// away underneath, each saying whether it was merged, set aside or not reviewed. Workers faked.
import { test, expect } from "./fixtures.mjs";

const MAIN = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const MKT = "https://tileiq-marketing.kevin-woodley.workers.dev";

const REC = { id: 21, kind: "recommendation", title: "Tag every store link with its source", agent: "manager", audience: "",
  evidence: "2 to 8 Nov, website tracking: 12 store clicks, 0 tagged", expected_outcome: "Store clicks traceable to a source",
  confidence: "medium", est_cost_gbp: 0, risks: "", status: "pending", current_version: 1, content_hash: "a".repeat(64),
  checks: { blocked: false, internal: true }, last_decision: null, updated_at: "2026-11-09T06:00:00Z",
  content: { text: "Add ct= tokens to the App Store links on the three busiest pages.", problem: "No store click can be tied to a source.",
    why_it_matters: "Without it we can't tell which pages bring tilers who send quotes.", solution: "Campaign tokens on store links.",
    expected_benefit: "Store clicks traceable to a source; too few to estimate", confidence_reason: "The gap is certain; the effect size isn't",
    action_type: "tracking", finding_ids: [7, 8, 9] } };
const plan = { period_start: "2026-11-02", items: [
  { rank: 1, title: REC.title, action_type: "tracking", impact: "medium", confidence: "medium", effort: "low", cost_gbp: 0,
    problem: REC.content.problem, next_action: REC.content.text, finding_ids: [7, 8, 9], action_id: 21, repeat: false },
  { rank: 2, title: "Check the quote that wasn't sent", action_type: "investigate", impact: "low", confidence: "low", effort: "low",
    problem: "One quote created, none sent.", next_action: "Look at that tiler's steps on the Journeys page.", finding_ids: [10], action_id: 5,
    repeat: true, open_since: "2026-10-26" }] };
const F = (id, title, extra) => ({ id, agent: "campaign", title, detail: "d", evidence: "12 store clicks", expected_benefit: "", effort: "low", risk: "",
  confidence: "medium", status: "new", created_at: "2026-11-09T05:40:00Z", period_start: "2026-11-02", period_end: "2026-11-08", ...extra });
const DATA = {
  status: { enabled: true, month_used_gbp: 1, monthly_cap_gbp: 20 },
  current: { period: { start: "2026-11-05", end: "2026-11-11", days: 7 }, metrics: { site_visits: 131 } },
  previous: { period: { start: "2026-10-29", end: "2026-11-04", days: 7 }, metrics: {} }, daily: [], runs: [], reports: [], health: [], ai_spend: [],
  findings: [F(7, "No paid campaigns ran", { merged_into: 21 }), F(8, "Store clicks can't be split by source", { merged_into: 21 }),
    F(9, "No campaign tags", { merged_into: 21 }), F(10, "Quote not sent", { merged_into: 5 }),
    F(11, "Organic traffic too small", { manager_note: "Too little traffic to act on yet" }), F(12, "Missed one")],
  approvals_ready: true,
  phase3: { waiting: 1, queue: [REC], plan, competitor_findings: [], competitor_pages: [], visibility: [] },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), route => route.fulfill({ json: new URL(route.request().url()).pathname === "/api/marketing/dashboard" ? DATA : { ok: true } }));
  await page.goto("/admin/");
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-marketing").click();
  await expect(page.locator("#mkt-body")).toContainText("Website visits");
});

test("the Manager's list: ranked, typed, repeats marked, linked to the card", async ({ page }) => {
  const p = page.locator("#mkt-plan");
  await expect(p).toContainText(/This week's recommendations.*2 Nov.* to 8 Nov/s);
  await expect(p).toContainText("1. Tag every store link with its source");
  await expect(p).toContainText("Tracking · medium impact");
  await expect(p).toContainText("from 3 agent findings");
  await expect(p).toContainText("2. Check the quote that wasn't sent");
  await expect(p).toContainText(/still open since 26 Oct/);
  await expect(p.getByRole("link", { name: "Full details and approval" }).first()).toHaveAttribute("href", "#mkt-a-21");
  // The list sits above the approval queue
  const [planY, queueY] = await Promise.all([p.boundingBox(), page.locator("#mkt-queue").boundingBox()]).then(b => b.map(x => x.y));
  expect(planY).toBeLessThan(queueY);
});

test("a recommendation card shows the full format, with the next action as the wording", async ({ page }) => {
  const card = page.locator("#mkt-a-21");
  for (const t of ["Tracking", "Problem: No store click can be tied to a source.", "Evidence: 2 to 8 Nov, website tracking: 12 store clicks, 0 tagged",
    "Why it matters to TileIQ: Without it", "Proposed solution: Campaign tokens", "Expected benefit: Store clicks traceable",
    "Confidence: medium (The gap is certain; the effect size isn't)", "Next action:", "Add ct= tokens to the App Store links"])
    await expect(card).toContainText(t);
  await expect(card.getByRole("button", { name: "Approve" })).toBeVisible();
});

test("agent findings are folded away, each saying where it went", async ({ page }) => {
  const box = page.locator("#mkt-findings");
  await expect(box).toContainText("6 findings from the agents: 4 merged into recommendations, 1 set aside, 1 not reviewed");
  await expect(page.locator("#mkt-f-7")).toBeHidden();
  await box.locator("summary").click();
  await expect(page.locator("#mkt-f-7 .mkt-fate")).toHaveText("Merged into recommendation 1: Tag every store link with its source");
  await expect(page.locator("#mkt-f-10 .mkt-fate")).toHaveText("Merged into recommendation 2: Check the quote that wasn't sent");
  await expect(page.locator("#mkt-f-11 .mkt-fate")).toHaveText("Set aside by the Manager: Too little traffic to act on yet");
  await expect(page.locator("#mkt-f-12 .mkt-fate")).toHaveText("Not reviewed by the Manager");
});
