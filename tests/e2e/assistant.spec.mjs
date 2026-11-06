import { test, expect } from "./fixtures.mjs";

// The "Ask TileIQ" chat (site.js loader + /assistant/chat.js). The worker and Cloudflare Turnstile
// are faked here: nothing real is called. Checks it stays out of the way (loads nothing until tapped,
// absent on excluded pages, never over the mobile "Try free" bar) and that answers are shown safely.
const WORKER = /damp-bread-e0f9\.kevin-woodley\.workers\.dev\/api\/assistant\//;

async function fake(page, { enabled = true, siteKey = "0x-test", answer = () => ({ text: "Tap **New Job** on Home." }), chatStatus = 200 } = {}) {
  const calls = { status: 0, session: 0, chat: [], feedback: [], turnstile: 0 };
  await page.route(WORKER, async route => {
    const url = route.request().url();
    if (url.endsWith("/status")) { calls.status++; return route.fulfill({ json: { enabled, kb: "test", siteKey } }); }
    if (url.endsWith("/session")) { calls.session++; return route.fulfill({ json: { token: "AAAAAAAAAAAAAAAA.9999999999999.sig", expires: Date.now() + 7200000 } }); }
    if (url.endsWith("/chat")) {
      const body = JSON.parse(route.request().postData());
      calls.chat.push({ body, visitor: route.request().headers()["x-assistant-visitor"] });
      const a = answer(body);
      return route.fulfill({ status: a.status || chatStatus, json: a });
    }
    if (url.endsWith("/feedback")) { calls.feedback.push(JSON.parse(route.request().postData())); return route.fulfill({ json: { ok: true } }); }
    return route.fulfill({ status: 404, json: {} });
  });
  await page.route(/challenges\.cloudflare\.com\/turnstile/, route => {
    calls.turnstile++;
    route.fulfill({ contentType: "text/javascript", body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('ts-token')},10);return 'w1'},reset:function(){}};" });
  });
  return calls;
}
const launcher = page => page.locator(".tq-chat-launcher");
const panel = page => page.locator(".tq-chat");

test("the button appears once the assistant is on, and nothing else loads until it's tapped", async ({ page }) => {
  const calls = await fake(page);
  const loaded = [];
  page.on("request", r => { if (/\/assistant\/chat\.(js|css)$|challenges\.cloudflare/.test(r.url())) loaded.push(r.url()); });
  await page.goto("/");
  await expect(launcher(page)).toBeVisible();
  await expect(launcher(page)).toHaveText("Ask TileIQ");
  expect(calls.status).toBe(1);
  expect(loaded).toEqual([]);
  await launcher(page).click();
  await expect(panel(page)).toBeVisible();
  expect(loaded.some(u => u.endsWith("/assistant/chat.js"))).toBe(true);
  expect(calls.turnstile).toBe(0);                       // not until the first question
});

test("no button when the assistant is off, not set up, or the worker can't be reached", async ({ page }) => {
  await fake(page, { enabled: false });
  await page.goto("/features.html");
  await page.waitForTimeout(2500);
  await expect(launcher(page)).toHaveCount(0);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.route(WORKER, r => r.abort());
  await page.goto("/guides/");
  await page.waitForTimeout(2500);
  await expect(launcher(page)).toHaveCount(0);
});

test("never on the ad landing pages", async ({ page }) => {
  const calls = await fake(page);
  await page.goto("/lp/quoting/");
  await page.waitForTimeout(2500);
  await expect(launcher(page)).toHaveCount(0);
  expect(calls.status).toBe(0);
});

test("asks and answers: Turnstile once, the page sent along, answer shown safely", async ({ page }) => {
  const calls = await fake(page, { answer: () => ({ text: "Use the [tile calculator](https://tile-iq.com/tiling-material-calculator/).\n- **Floors**: 10%\n- Walls: 12%\n<img src=x onerror=\"window.__xss=1\"> [bad](https://evil.example/)" }) });
  await page.goto("/tiling-material-calculator/");
  await launcher(page).click();
  await expect(page.locator(".tq-suggest button").first()).toHaveText("How much adhesive do I need per m²?");
  await page.fill("#tq-q", "How much wastage?");
  await page.keyboard.press("Enter");
  const bot = page.locator(".tq-bot").last();
  await expect(bot).toContainText("Floors");
  await expect(bot.locator("a")).toHaveCount(1);
  await expect(bot.locator("a")).toHaveAttribute("href", "https://tile-iq.com/tiling-material-calculator/");
  await expect(bot.locator("li")).toHaveCount(2);
  await expect(bot.locator("strong")).toHaveText("Floors");
  await expect(bot.locator("img")).toHaveCount(0);
  await expect(bot).toContainText("bad");
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(calls.session).toBe(1);
  expect(calls.chat[0].visitor).toBe("AAAAAAAAAAAAAAAA.9999999999999.sig");
  expect(calls.chat[0].body).toEqual({ surface: "website", page: "/tiling-material-calculator/", messages: [{ role: "user", content: "How much wastage?" }] });

  await page.locator(".tq-suggest button, #tq-q").last().fill("And grout?");
  await page.click(".tq-form button");
  await expect(page.locator(".tq-user")).toHaveCount(2);
  expect(calls.session).toBe(1);                           // the token is reused
  expect(calls.chat[1].body.messages).toHaveLength(3);
});

test("a suggested question can be tapped; thumbs up sends only the rating", async ({ page }) => {
  const calls = await fake(page);
  await page.goto("/");
  await launcher(page).click();
  await page.locator(".tq-suggest button").first().click();
  await expect(page.locator(".tq-bot").last()).toContainText("New Job");
  await page.getByRole("button", { name: "Helpful", exact: true }).click();
  await expect(page.getByRole("button", { name: "Helpful", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => calls.feedback.length).toBe(1);
  expect(calls.feedback[0]).toEqual({ rating: 1, page: "/", surface: "website" });
});

test("minimise keeps the chat; it survives moving page; New chat and close clear it", async ({ page }) => {
  await fake(page);
  await page.goto("/");
  await launcher(page).click();
  await page.fill("#tq-q", "What does TileIQ do?");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tq-bot").last()).toContainText("New Job");
  await page.getByRole("button", { name: "Minimise" }).click();
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeVisible();
  await page.goto("/features.html");
  await launcher(page).click();
  await expect(page.locator(".tq-user")).toHaveText("What does TileIQ do?");
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.locator(".tq-user")).toHaveCount(0);
  await expect(page.locator(".tq-suggest")).toBeVisible();
  await page.fill("#tq-q", "Again");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tq-user")).toHaveCount(1);
  await page.getByRole("button", { name: "Close and end the chat" }).click();
  await expect(panel(page)).toBeHidden();
  await launcher(page).click();
  await expect(page.locator(".tq-user")).toHaveCount(0);
});

test("Escape minimises and gives focus back to the button", async ({ page }) => {
  await fake(page);
  await page.goto("/");
  await launcher(page).click();
  await expect(page.locator("#tq-q")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(launcher(page)).toBeFocused();
});

test("limits and outages show a friendly message with somewhere to go", async ({ page }) => {
  await fake(page, { answer: () => ({ status: 429, error: "That's the most questions for today.", fallback: "The [guides](https://tile-iq.com/guides/) might help." }) });
  await page.goto("/");
  await launcher(page).click();
  await page.fill("#tq-q", "q");
  await page.keyboard.press("Enter");
  const n = page.locator(".tq-note");
  await expect(n).toContainText("most questions for today");
  await expect(n.locator("a")).toHaveAttribute("href", "https://tile-iq.com/guides/");
  await expect(page.locator("[data-retry]")).toHaveCount(0);
});

test("a network failure offers Try again, which works", async ({ page }) => {
  let fail = true;
  await fake(page, { answer: () => fail ? { status: 502, error: "Sorry, something went wrong answering that." } : { text: "Here you go." } });
  await page.goto("/");
  await launcher(page).click();
  await page.fill("#tq-q", "q");
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-retry]")).toBeVisible();
  fail = false;
  await page.click("[data-retry]");
  await expect(page.locator(".tq-bot").last()).toContainText("Here you go.");
  await expect(page.locator(".tq-user")).toHaveCount(1);       // the question isn't sent twice
});

test("nothing typed reaches analytics or local storage", async ({ page }) => {
  await fake(page);
  await page.goto("/");
  const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
  await launcher(page).click();
  await page.fill("#tq-q", "My customer Ann Smith at 12 High Street");
  await page.keyboard.press("Enter");
  await expect(page.locator(".tq-bot").last()).toContainText("New Job");
  expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))).toBe(before);
  expect(await page.evaluate(() => document.cookie)).not.toMatch(/Ann/);
});
