import { test, expect } from "./fixtures.mjs";

// The chat with the cookie banner showing, and when Cloudflare's bot check wants a tick, errors
// or gets stuck. The worker and Turnstile are faked; nothing real is called.
const WORKER = /damp-bread-e0f9\.kevin-woodley\.workers\.dev\/api\/assistant\//;

// mode: "invisible" (passes straight away), "tick" (asks for a tick; window.__tsTick() passes it),
// "stuck" (never answers), "error" (fails)
async function fake(page, mode = "invisible") {
  const calls = { session: 0, chat: 0 };
  await page.route(WORKER, route => {
    const url = route.request().url();
    if (url.endsWith("/status")) return route.fulfill({ json: { enabled: true, kb: "t", siteKey: "0x-test" } });
    if (url.endsWith("/session")) { calls.session++; return route.fulfill({ json: { token: "AAAAAAAAAAAAAAAA.9999999999999.sig", expires: Date.now() + 7200000 } }); }
    if (url.endsWith("/chat")) { calls.chat++; return route.fulfill({ json: { text: "Tap New Job on Home." } }); }
    return route.fulfill({ json: {} });
  });
  await page.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: "text/javascript", body: `
    window.turnstile = { render: function (el, o) {
      var mode = ${JSON.stringify(mode)};
      if (mode === "invisible") setTimeout(function () { o.callback("t"); }, 10);
      if (mode === "error") setTimeout(function () { o["error-callback"]("x"); }, 10);
      if (mode === "tick") setTimeout(function () {
        o["before-interactive-callback"]();
        el.innerHTML = '<label class="fake-ts"><input type="checkbox"> Verify you are human</label>';
        window.__tsTick = function () { o["after-interactive-callback"](); o.callback("t"); };
      }, 10);
      window.__tsOpts = o;
      return "w1";
    }, reset: function () { var o = window.__tsOpts; setTimeout(function () { o.callback("t"); }, 10); } };` }));
  return calls;
}
async function ask(page, q = "What does TileIQ do?") {
  await page.locator(".tq-chat-launcher").click();
  await page.fill("#tq-q", q);
  await page.keyboard.press("Enter");
}

test("an invisible check goes straight through with no prompt", async ({ page }) => {
  const calls = await fake(page, "invisible");
  await page.goto("/");
  await ask(page);
  await expect(page.locator(".tq-bot").last()).toContainText("New Job");
  await expect(page.locator(".tq-note")).toHaveCount(0);
  expect(calls.chat).toBe(1);
});

test("when the bot check wants a tick, the chat says so and sends once it's ticked", async ({ page }) => {
  const calls = await fake(page, "tick");
  await page.goto("/");
  await ask(page);
  await expect(page.locator(".tq-note")).toHaveText(/Tick the box below so we know you're not a bot/);
  await expect(page.locator(".tq-typing-msg")).toHaveCount(0);
  await expect(page.locator(".fake-ts")).toBeVisible();
  await page.waitForTimeout(500);
  expect(calls.session).toBe(0);                          // nothing sent until it's ticked
  await page.evaluate(() => window.__tsTick());
  await expect(page.locator(".tq-bot").last()).toContainText("New Job");
  await expect(page.locator(".tq-note")).toHaveCount(0);
  expect(calls.chat).toBe(1);
});

test("a stuck check gives up with Try again instead of waiting for ever", async ({ page }) => {
  await fake(page, "stuck");
  await page.addInitScript(() => { window.__tqTsWaitMs = 600; });
  await page.goto("/");
  await ask(page);
  await expect(page.locator(".tq-note")).toContainText("We couldn't check you're not a bot", { timeout: 3000 });
  await expect(page.locator("[data-retry]")).toBeVisible();
  await expect(page.locator(".tq-typing-msg")).toHaveCount(0);
  await expect(page.locator(".tq-form button")).toBeEnabled();
});

test("a failed check says so, and Try again then gets through", async ({ page }) => {
  const calls = await fake(page, "error");
  await page.goto("/");
  await ask(page);
  await expect(page.locator(".tq-note")).toContainText("We couldn't check you're not a bot");
  expect(calls.session).toBe(0);
  await page.click("[data-retry]");                       // the fake passes on reset
  await expect(page.locator(".tq-bot").last()).toContainText("New Job");
  await expect(page.locator(".tq-user")).toHaveCount(1);  // the question isn't sent twice
  expect(calls.chat).toBe(1);
});

test.describe("with the cookie banner showing", () => {
  test.use({ freshVisitor: true });

  for (const [name, vp] of [["desktop", { width: 1280, height: 860 }], ["phone", { width: 390, height: 844 }]]) {
    test(`${name}: the button sits above the banner; the open chat covers it and works; the banner is still there after`, async ({ page }) => {
      await page.setViewportSize(vp);
      await fake(page, "tick");
      await page.goto("/");
      const banner = page.locator("#tileiq-consent");
      const btn = page.locator(".tq-chat-launcher");
      await expect(banner).toBeVisible();
      await expect.poll(async () => {
        const c = await btn.boundingBox(), b = await banner.boundingBox();
        return c.y + c.height <= b.y;
      }).toBe(true);
      await btn.click();                                    // tappable: not under the banner
      await page.fill("#tq-q", "Hello");
      await page.keyboard.press("Enter");
      // the bot check box and the question box are on top, not hidden under the banner
      await expect(page.locator(".fake-ts")).toBeVisible();
      const ts = await page.locator(".fake-ts").boundingBox();
      expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".tq-chat"), [ts.x + 5, ts.y + 5])).toBe(true);
      const q = await page.locator("#tq-q").boundingBox();
      expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.id, [q.x + 10, q.y + 10])).toBe("tq-q");
      await page.evaluate(() => window.__tsTick());
      await expect(page.locator(".tq-bot").last()).toContainText("New Job");
      await page.getByRole("button", { name: "Minimise" }).click();
      await expect(banner).toBeVisible();                   // the cookie choice still has to be made
      await banner.getByRole("button", { name: "Reject" }).click();
      await expect(banner).toHaveCount(0);
      await expect.poll(async () => { const c = await btn.boundingBox(); return Math.round(vp.height - (c.y + c.height)); }).toBeLessThanOrEqual(20);
    });
  }
});
