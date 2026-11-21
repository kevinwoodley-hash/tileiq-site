// Admin dashboard → Partners page: each partner's terms, links and counts, the list of signups
// (accounts shown by email from the admin's users list), hiding tests, adding and pausing a partner.
// The worker is faked: every /api/admin/* call is answered here. Nothing real is called.
import { test, expect } from "./fixtures.mjs";

const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const SFT = { id: "p1", name: "Software for Tradespeople", code: "SFT", test_code: "SFT-TEST", contact_email: null,
  commission_pct: 15, commission_basis: "price_ex_vat", commission_months: null, attribution_days: 30, active: true,
  notes: "Agreed 21 Nov 2026", tilers: 1, tilers_30d: 1, test_signups: 1 };
const DATA = {
  partners: [SFT],
  signups: [
    { user_id: "u1", partner_id: "p1", partner: "Software for Tradespeople", code: "SFT", is_test: false, source: "play_referrer",
      platform: "android", claimed_at: "2026-11-21T18:30:00Z", account_created: "2026-11-21T18:29:00Z" },
    { user_id: "u9", partner_id: "p1", partner: "Software for Tradespeople", code: "SFT-TEST", is_test: true, source: "link",
      platform: "web", claimed_at: "2026-11-21T18:27:12Z", account_created: "2026-11-21T18:27:04Z" }
  ]
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
});

async function openPartners(page, { data = DATA, posts = [], answer } = {}) {
  await page.route(url => url.href.startsWith(WORKER), async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === "/api/admin/partners" && req.method() === "GET") return route.fulfill({ json: data });
    if (path === "/api/admin/partners") {
      posts.push(req.postDataJSON());
      return route.fulfill(answer || { json: { ok: true, partner: {} } });
    }
    if (path === "/api/admin/users") return route.fulfill({ json: [{ id: "u1", email: "dave@example.com", name: "Dave Tiler" }] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/");
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-partners").click();
  await expect(page.locator("#page-partners")).toBeVisible();
}

test("shows each partner's terms, links and counts, and every signup", async ({ page }) => {
  await openPartners(page);
  const body = page.locator("#pt-body");
  await expect(body).toContainText("Software for Tradespeople");
  await expect(body).toContainText("15% of the price ex VAT, for as long as they stay subscribed");
  await expect(body).toContainText("tile-iq.com/go/sft");
  await expect(body).toContainText("tile-iq.com/go/sft-test");
  await expect(body).toContainText("Tilers signed up");
  await expect(body).toContainText("dave@example.com");                   // known account by email
  await expect(body).toContainText("Account u9");                         // not in the list: short id
  await expect(body).toContainText("Google Play (their link)");
  await expect(body).toContainText("Android");
  await expect(body).toContainText("TEST");
});

test("tests can be hidden", async ({ page }) => {
  await openPartners(page);
  await page.locator("#pt-hide-tests").check();
  await expect(page.locator("#pt-body")).not.toContainText("Account u9");
  await expect(page.locator("#pt-body")).toContainText("dave@example.com");
});

test("an older worker without the list still shows the partners", async ({ page }) => {
  await openPartners(page, { data: { partners: [SFT] } });
  await expect(page.locator("#pt-body")).toContainText("Deploy the latest worker to see the list of signups");
  await expect(page.locator("#pt-body")).toContainText("Tilers signed up");
});

test("adds a partner with the details typed in", async ({ page }) => {
  const posts = [];
  await openPartners(page, { posts });
  await page.fill("#pt-name", "Trade Directory Ltd");
  await page.fill("#pt-code", "tdl");
  await page.fill("#pt-test", "tdl-test");
  await page.fill("#pt-pct", "12.5");
  await page.fill("#pt-email", "hello@tdl.example");
  await page.click("text=Add partner");
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ name: "Trade Directory Ltd", code: "TDL", test_code: "TDL-TEST", commission_pct: 12.5,
    attribution_days: 30, notes: "", contact_email: "hello@tdl.example", commission_months: null });
});

test("a refused partner shows the worker's reason", async ({ page }) => {
  const posts = [];
  await openPartners(page, { posts, answer: { status: 409, json: { error: "Not saved: that code is already used by a partner." } } });
  await page.fill("#pt-name", "Clash Co");
  await page.fill("#pt-code", "SFT");
  const msg = page.waitForEvent("dialog").then(d => { const m = d.message(); d.dismiss(); return m; });
  await page.click("text=Add partner");
  expect(await msg).toContain("already used");
});

test("pausing asks first, then sends active: false", async ({ page }) => {
  const posts = [];
  await openPartners(page, { posts });
  page.once("dialog", d => d.accept());
  await page.locator("#pt-body button", { hasText: "Pause" }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ id: "p1", active: false });
});
