// Admin dashboard → Marketing page: images on Facebook Page posts. Both Workers are faked.
// Previews are fetched with the admin password; uploads send the file with its type; saving an edit
// sends the image list (so the new version, and its approval, covers them). Group posts get none.
import { test, expect } from "./fixtures.mjs";

const MAIN = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const MKT = "https://tileiq-marketing.kevin-woodley.workers.dev";
const K1 = `img/${"1".repeat(64)}.jpg`, K2 = `img/${"2".repeat(64)}.png`, NEW = `img/${"3".repeat(64)}.png`;
// A real 1x1 PNG, so the browser can draw the previews
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const BASE = {
  status: { enabled: true, month_used_gbp: 3, monthly_cap_gbp: 20 },
  current: { period: { start: "2026-10-14", end: "2026-11-10", days: 28 }, metrics: { site_visits: 100 } },
  previous: { metrics: {} }, daily: [], runs: [], findings: [], reports: [], health: [], ai_spend: [],
};
const action = o => ({ id: 1, kind: "facebook_page_post", title: "Wet room in Wantage", agent: "social", audience: "sole traders", evidence: "", expected_outcome: "",
  confidence: "medium", est_cost_gbp: 0, risks: "", status: "pending", current_version: 2, content_hash: "a".repeat(64), checks: { blocked: false, problems: [] },
  last_decision: null, updated_at: "2026-11-10T06:00:00Z",
  content: { text: "Finished this wet room today. tile-iq.com/app/demo", call_to_action: "", images: [{ key: K1, sha256: "1".repeat(64), type: "image/jpeg" }, { key: K2, sha256: "2".repeat(64), type: "image/png" }] }, ...o });
const DATA = { ...BASE, approvals_ready: true, publishing_ready: true,
  phase3: { waiting: 2, plan: null, competitor_findings: [], competitor_pages: [], visibility: [],
    queue: [action({}), action({ id: 2, kind: "facebook_group_post", title: "Group post", content: { text: "Hello group", call_to_action: "" } })] },
  phase4: { config: { enabled: true, max_per_day: 1, max_per_week: 3 }, today: 0, this_week: 0, publications: [] } };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
});

async function open(page, calls = []) {
  await page.route(url => url.href.startsWith(MAIN), route => route.fulfill({ json: [] }));
  await page.route(url => url.href.startsWith(MKT), async route => {
    const req = route.request(), url = new URL(req.url());
    const isJson = (req.headers()["content-type"] || "").startsWith("application/json");
    calls.push({ method: req.method(), path: url.pathname, key: url.searchParams.get("key"), type: req.headers()["content-type"],
      secret: req.headers()["x-admin-secret"], size: req.postDataBuffer()?.length || 0, body: req.method() === "POST" && isJson ? req.postDataJSON() : null });
    if (url.pathname === "/api/marketing/dashboard") return route.fulfill({ json: DATA });
    if (url.pathname === "/api/marketing/media" && req.method() === "GET") return route.fulfill({ body: PNG, contentType: "image/png" });
    if (url.pathname === "/api/marketing/media") {                       // a new key per upload (the first is NEW)
      const n = calls.filter(c => c.path === "/api/marketing/media" && c.method === "POST").length;
      const key = n === 1 ? NEW : `img/${String(n + 3).repeat(64).slice(0, 64)}.png`;
      return route.fulfill({ json: { key, sha256: key.slice(4, 68), type: "image/png", bytes: PNG.length } });
    }
    if (url.pathname === "/api/marketing/action/edit") return route.fulfill({ json: { id: 1, version: 3, hash: "b".repeat(64), checks: { blocked: false } } });
    return route.fulfill({ json: { ok: true } });
  });
  await page.goto("/admin/");
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-marketing").click();
  await expect(page.locator("#mkt-body")).toContainText("Website visits");
}

test("previews show the post's images, fetched with the admin password", async ({ page }) => {
  const calls = [];
  await open(page, calls);
  const imgs = page.locator("#mkt-a-1 .mkt-preview img[data-mkt-img]");
  await expect(imgs).toHaveCount(2);
  await expect(imgs.first()).toHaveAttribute("src", /^blob:/);
  const fetched = calls.filter(c => c.path === "/api/marketing/media" && c.method === "GET");
  expect(fetched.map(c => c.key).sort()).toEqual([K1, K2]);
  expect(fetched.every(c => c.secret === "test-pw")).toBe(true);
});

test("edit: add an image (uploaded with its type), remove one, and save sends the list", async ({ page }) => {
  const calls = [];
  await open(page, calls);
  await page.locator("#mkt-a-1").getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#mkt-edit-imgs-1 img")).toHaveCount(2);
  await page.setInputFiles("#mkt-edit-file-1", { name: "after.png", mimeType: "image/png", buffer: PNG });
  await expect(page.locator("#mkt-edit-imgs-1 img")).toHaveCount(3);
  const up = calls.find(c => c.path === "/api/marketing/media" && c.method === "POST");
  expect([up.type, up.secret, up.size]).toEqual(["image/png", "test-pw", PNG.length]);
  await page.locator("#mkt-edit-imgs-1 button[title='Remove']").first().click();       // remove the first
  await expect(page.locator("#mkt-edit-imgs-1 img")).toHaveCount(2);
  await page.locator("#mkt-a-1").getByRole("button", { name: "Save as new version" }).click();
  await expect.poll(() => calls.find(c => c.path === "/api/marketing/action/edit")?.body?.images).toEqual([K2, NEW]);
});

test("edit: wrong file types are refused before uploading; at most 4 images", async ({ page }) => {
  const calls = [];
  await open(page, calls);
  await page.locator("#mkt-a-1").getByRole("button", { name: "Edit" }).click();
  await page.setInputFiles("#mkt-edit-file-1", { name: "notes.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
  await expect(page.locator("#mkt-edit-imgmsg-1")).toContainText("only JPEG, PNG or WebP");
  expect(calls.filter(c => c.path === "/api/marketing/media" && c.method === "POST")).toHaveLength(0);
  const many = [1, 2, 3].map(i => ({ name: `p${i}.png`, mimeType: "image/png", buffer: PNG }));
  await page.setInputFiles("#mkt-edit-file-1", many);                                  // 2 existing + 3 > 4
  await expect(page.locator("#mkt-edit-imgmsg-1")).toContainText("Up to 4 images");
});

test("group posts have no image controls; their edit sends no image list", async ({ page }) => {
  const calls = [];
  await open(page, calls);
  await page.locator("#mkt-a-2").getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#mkt-edit-file-2")).toHaveCount(0);
  await page.locator("#mkt-a-2").getByRole("button", { name: "Save as new version" }).click();
  await expect.poll(() => calls.find(c => c.path === "/api/marketing/action/edit")?.body).toBeTruthy();
  expect("images" in calls.find(c => c.path === "/api/marketing/action/edit").body).toBe(false);
});
