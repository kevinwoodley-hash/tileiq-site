import { test, expect } from "./fixtures.mjs";

// The chat on a phone: the button moves above the "Try free" bar instead of covering it,
// and the panel opens as a full-width sheet.
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("on a phone the button sits above the Try free bar and the chat opens full width", async ({ page }) => {
  await page.route(/damp-bread-e0f9\.kevin-woodley\.workers\.dev\/api\/assistant\/status/, r => r.fulfill({ json: { enabled: true, kb: "t", siteKey: "0x" } }));
  await page.goto("/");
  const btn = page.locator(".tq-chat-launcher");
  await expect(btn).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 1600));
  const bar = page.locator(".sticky-cta");
  await expect(bar).toHaveClass(/show/);
  await expect.poll(async () => {
    const b = await btn.boundingBox(), s = await bar.boundingBox();
    return b && s ? b.y + b.height <= s.y : false;
  }).toBe(true);
  await btn.click();
  const box = await page.locator(".tq-chat").boundingBox();
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.x)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
