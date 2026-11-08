// /become-a-tester: the tester programme's invite page. Until TESTERS_LIVE is switched on it only
// says the programme opens soon (nothing to join, nothing advertised); ?preview=1 shows the full
// page. The "Open TileIQ" button suits the phone: an Android intent link (Google Play if the app
// isn't installed), tileiq:// on iPhone (App Store hint if nothing happens), the web app on a computer.
import fs from "node:fs";
import { test, expect } from "./fixtures.mjs";

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FB_IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.40.97;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.0;FBSS/3;FBID/phone;FBLC/en_GB;FBOP/5]";
const FB_ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.40.97;]";

test.describe("before the programme is live", () => {
  test("only says it opens soon: nothing to join, no store or app buttons", async ({ page }) => {
    await page.goto("/become-a-tester/");
    await expect(page.locator("h1")).toContainText("Help shape the app");
    await expect(page.locator("#bt-soon")).toBeVisible();
    await expect(page.locator("#bt-soon")).toContainText("opens soon");
    await expect(page.locator("#bt-join")).toBeHidden();
    await expect(page.locator("#bt-open")).toBeHidden();
    await expect(page.getByText("You can join from inside TileIQ")).toBeHidden();
  });

  test("is kept out of search, the sitemap and the site's links", async ({ page }) => {
    await page.goto("/become-a-tester/");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    expect(fs.readFileSync(new URL("../../sitemap.xml", import.meta.url), "utf8")).not.toContain("become-a-tester");
    for (const p of ["/", "/features.html", "/signup/", "/lp/full-app/"]) {
      await page.goto(p);
      await expect(page.locator('a[href*="become-a-tester"]')).toHaveCount(0);
    }
  });

  test("the switch is off in the page script", async () => {
    expect(fs.readFileSync(new URL("../../become-a-tester/tester.js", import.meta.url), "utf8")).toMatch(/var TESTERS_LIVE = false;/);
  });
});

test.describe("preview of the live page", () => {
  test("on a computer: join on the web, both stores shown", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "computer layout");
    await page.goto("/become-a-tester/?preview=1");
    await expect(page.locator("#bt-soon")).toBeHidden();
    const open = page.locator("#bt-open");
    await expect(open).toHaveText(/Join on the web/);
    await expect(open).toHaveAttribute("href", "/app/?tester=join&src=landing_page");
    await expect(page.locator("#bt-play")).toBeVisible();
    await expect(page.locator("#bt-appstore")).toBeVisible();
    await expect(page.getByText("You can join from inside TileIQ")).toBeVisible();
    await expect(page.locator("#bt-fb")).toBeHidden();
  });

  test("on Android: opens the app, or Google Play if it isn't installed", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "Android (Pixel 7) layout");
    await page.goto("/become-a-tester/?preview=1&src=invite_link");
    const href = await page.locator("#bt-open").getAttribute("href");
    expect(href).toMatch(/^intent:\/\/become-a-tester\?src=invite_link#Intent;scheme=tileiq;package=com\.tileiqpro\.android;/);
    expect(decodeURIComponent(href.match(/S\.browser_fallback_url=([^;]+)/)[1])).toContain("play.google.com/store/apps/details?id=com.tileiqpro.android");
    await expect(page.locator("#bt-play")).toBeVisible();
    await expect(page.locator("#bt-appstore")).toBeHidden();
    await expect(page.locator("#bt-web")).toHaveAttribute("href", "/app/?tester=join&src=invite_link");
  });

  test("the page fits a phone screen with nothing sideways", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "phone");
    await page.goto("/become-a-tester/?preview=1");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test.describe("on an iPhone", () => {
    test.use({ userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test("opens tileiq://, and says to get the app if nothing happens", async ({ page }) => {
      await page.goto("/become-a-tester/?preview=1");
      const open = page.locator("#bt-open");
      await expect(open).toHaveAttribute("href", "tileiq://become-a-tester?src=landing_page");
      await expect(page.locator("#bt-appstore")).toBeVisible();
      await expect(page.locator("#bt-play")).toBeHidden();
      // The app isn't installed here, so the tap goes nowhere and the page stays: the hint appears.
      await page.evaluate(() => { document.getElementById("bt-open").addEventListener("click", e => e.preventDefault()); });
      await open.click();
      await expect(page.locator("#bt-nostore")).toBeVisible({ timeout: 4000 });
    });
  });

  test.describe("inside Facebook's browser on an iPhone", () => {
    test.use({ userAgent: FB_IPHONE_UA, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    test("explains how to open in Safari, and still offers every way to join", async ({ page }) => {
      await page.goto("/become-a-tester/?preview=1");
      await expect(page.locator("#bt-fb")).toBeVisible();
      await expect(page.locator("#bt-fb")).toContainText("Open in browser");
      await expect(page.locator("#bt-open")).toBeVisible();
      await expect(page.locator("#bt-appstore")).toBeVisible();
      await expect(page.locator("#bt-web")).toBeVisible();
    });
  });

  test.describe("inside Facebook's browser on Android", () => {
    test.use({ userAgent: FB_ANDROID_UA, viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });
    test("uses the intent link and shows the Facebook tip", async ({ page }) => {
      await page.goto("/become-a-tester/?preview=1");
      await expect(page.locator("#bt-fb")).toBeVisible();
      await expect(page.locator("#bt-open")).toHaveAttribute("href", /^intent:\/\/become-a-tester/);
    });
  });

  test("a made-up src can't be passed through", async ({ page }) => {
    await page.goto("/become-a-tester/?preview=1&src=%3Cscript%3E");
    await expect(page.locator("#bt-web")).toHaveAttribute("href", "/app/?tester=join&src=landing_page");
  });
});
