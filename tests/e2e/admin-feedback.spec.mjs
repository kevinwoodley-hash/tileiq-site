// Admin dashboard → Feedback page (tester programme). The worker is faked: the page is signed in
// with a made-up password and every /api/admin/* call is answered here. Nothing real is called.
import { test, expect } from "./fixtures.mjs";

const WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev";
const prompt = (key, question, answer_type, extra = {}) => ({
  key, trigger_event: "quote_sent", nth: 1, question, answer_type, choices: null, follow_up: "What would have made it easier?",
  active: true, sort: 10, shown: 0, answered: 0, partial: 0, dismissed: 0, avg_rating: null, answers: {}, ...extra });
const DATA = {
  summary: {
    days: 30,
    testers: { active: 3, left: 1, joined_7d: 2, joined_period: 4, left_period: 1, by_source: { landing_page: 2, app_setting: 1 } },
    totals: { shown: 10, answered: 4, partial: 3, dismissed: 3, people: 3 },
    prompts: [
      prompt("estimate_done", "How easy was it to measure and price that room?", "rating5",
        { trigger_event: "estimate_completed", shown: 6, answered: 3, partial: 2, dismissed: 1, avg_rating: 4.2, answers: { "5": 2, "4": 2, "3": 1 } }),
      prompt("quote_sent", "Was the quote ready to send without changes?", "choice",
        { choices: ["Yes, ready to go", "Needed a few tweaks"], shown: 4, answered: 1, partial: 1, dismissed: 2, answers: { "Needed a few tweaks": 2 } })
    ]
  },
  config: { id: 1, enabled: true, min_hours_between: 72, max_per_week: 2, thank_you_ms: 1500 },
  recent: [
    { id: "1", user_id: "u1", prompt_key: "estimate_done", outcome: "answered", rating: 4, answer: null, comment: "Grout <b>bit</b> was confusing",
      platform: "android", app_version: "1.44", created_at: "2026-11-08T10:00:00Z" },
    { id: "2", user_id: "u2", prompt_key: "quote_sent", outcome: "partial", rating: null, answer: "Needed a few tweaks", comment: null,
      platform: "ios", app_version: "1.44", created_at: "2026-11-07T10:00:00Z" }
  ]
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tileiq_admin_secret", "test-pw");
    localStorage.setItem("tileiq_totp_verified", String(Date.now()));
  });
});

// On a phone the sidebar is behind the ☰ button.
async function goToFeedback(page) {
  const menu = page.locator(".mobile-menu-btn");
  if (await menu.isVisible()) await menu.click();
  await page.locator("#nav-feedback").click();
}

async function openFeedback(page, posts = []) {
  await page.route(url => url.href.startsWith(WORKER), async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path === "/api/admin/feedback") return route.fulfill({ json: DATA });
    if (path.startsWith("/api/admin/feedback/")) { posts.push({ path, body: req.postDataJSON() }); return route.fulfill({ json: { ok: true } }); }
    if (path === "/api/admin/users") return route.fulfill({ json: [{ id: "u1", email: "dave@example.com", name: "Dave Tiler" }] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/");
  await goToFeedback(page);
  await expect(page.locator("#page-feedback")).toBeVisible();
  await expect(page.locator("#fb-body")).toContainText("Testing now");
}

test("shows testers, questions and answers", async ({ page }) => {
  await openFeedback(page);
  const body = page.locator("#fb-body");
  await expect(body).toContainText("Website page 2");
  await expect(body).toContainText("70%");                                   // (4 + 3) of 10 answered
  await expect(body).toContainText("How easy was it to measure and price that room?");
  await expect(body).toContainText("4.2★");
  await expect(body).toContainText("Needed a few tweaks: 2");
  await expect(body).toContainText("Dave Tiler");                            // known tiler by name
  await expect(body).toContainText("Tiler u2");                              // unknown: short id
  await expect(body).toContainText("★★★★☆");
  await expect(body.locator("b")).toHaveCount(0);                            // comments are shown as text, not HTML
  await expect(body).toContainText("Grout <b>bit</b> was confusing");
});

test("filters answers by question and to comments only", async ({ page }) => {
  await openFeedback(page);
  await page.locator("#fb-filter").selectOption("quote_sent");
  await expect(page.locator("#fb-body")).not.toContainText("Grout");
  await page.locator("#fb-filter").selectOption("");
  await page.locator("#fb-comments").check();
  await expect(page.locator("#fb-body")).toContainText("Grout");
  await expect(page.locator("#fb-body")).not.toContainText("Tiler u2");
});

test("switches a question off, edits one, and changes the pacing", async ({ page }) => {
  const posts = [];
  await openFeedback(page, posts);
  await page.getByRole("button", { name: "Switch off" }).nth(1).click();          // first question (0 is the master switch)
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toEqual({ path: "/api/admin/feedback/prompt", body: { key: "estimate_done", active: false } });

  const answers = ["Was measuring the room easy?", "", "2"];
  page.on("dialog", d => d.accept(answers.shift()));
  await page.getByRole("button", { name: "Edit" }).first().click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].body).toEqual({ key: "estimate_done", question: "Was measuring the room easy?", follow_up: "", nth: 2 });

  await page.locator("#fb-hours").fill("48");
  await page.getByRole("button", { name: "Save pacing" }).click();
  await expect.poll(() => posts.length).toBe(3);
  expect(posts[2]).toEqual({ path: "/api/admin/feedback/config", body: { min_hours_between: 48, max_per_week: 2 } });
});

test("the master switch asks first", async ({ page }) => {
  const posts = [];
  await openFeedback(page, posts);
  page.once("dialog", d => d.dismiss());
  await page.getByRole("button", { name: "Switch off" }).first().click();
  await page.waitForTimeout(300);
  expect(posts.length).toBe(0);
});

test("explains what to check if the worker or database isn't ready", async ({ page }) => {
  await page.route(url => url.href.startsWith(WORKER), route =>
    new URL(route.request().url()).pathname === "/api/admin/feedback" ? route.fulfill({ status: 500, json: {} }) : route.fulfill({ json: [] }));
  await page.goto("/admin/");
  await goToFeedback(page);
  await expect(page.locator("#fb-body")).toContainText("2026-11-testers-feedback.sql");
});
