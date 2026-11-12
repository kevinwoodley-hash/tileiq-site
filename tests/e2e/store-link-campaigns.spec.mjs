// Store links carry where the visitor came from, so the stores can report installs by source as totals:
// Google Play gets it as an install referrer, the App Store as an App Store Connect campaign token
// (pt = TileIQ's provider token, ct = "<source>_<page>", at most 40 characters). The page itself is
// unchanged: the link is only rewritten as it's tapped.
import { test, expect } from "./fixtures.mjs";

test.describe("Store link campaigns", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for link checks");

  // Tap the first link for that store without leaving the page; returns the link it would open.
  const tap = (page, store) => page.evaluate(sel => {
    const a = document.querySelector(sel);
    a.addEventListener("click", e => e.preventDefault());
    a.click();
    return a.href;
  }, store === "app_store" ? 'a[href*="apps.apple.com"]' : 'a[href*="play.google.com"]');

  test("App Store: provider token, source and page as the campaign", async ({ page }) => {
    await page.goto("/", { referer: "https://www.google.com/" });
    const before = await page.locator('a[href*="apps.apple.com"]').first().getAttribute("href");
    expect(before).not.toContain("ct=");                                   // the page itself is unchanged
    const href = new URL(await tap(page, "app_store"));
    expect(href.pathname).toContain("/id6787447373");
    expect([href.searchParams.get("pt"), href.searchParams.get("ct"), href.searchParams.get("mt")]).toEqual(["129112372", "google_home", "8"]);
  });

  test("App Store: a direct visit to a guide, trimmed to Apple's 40 characters; tapped twice, tagged once", async ({ page }) => {
    await page.goto("/guides/tile-adhesive-coverage/");
    if (!(await page.locator('a[href*="apps.apple.com"]').count())) await page.evaluate(() =>
      document.body.insertAdjacentHTML("beforeend", '<a href="https://apps.apple.com/gb/app/tileiq-pro/id6787447373">App Store</a>'));
    const first = await tap(page, "app_store");
    const ct = new URL(first).searchParams.get("ct");
    expect(ct).toBe("direct_guides-tile-adhesive-coverage");
    expect(ct.length).toBeLessThanOrEqual(40);
    const second = await tap(page, "app_store");
    expect(second).toBe(first);
  });

  test("a long source and page are cut to 40 characters, with only safe characters", async ({ page }) => {
    await page.goto("/?utm_source=Some%20Very%20Long%20Newsletter%20Name&utm_medium=email");
    const ct = new URL(await tap(page, "app_store")).searchParams.get("ct");
    expect(ct).toMatch(/^[a-z0-9._-]{1,40}$/);
    expect(ct.startsWith("some-very-long-newsletter-name_")).toBe(true);
  });

  test("Google Play still gets the install referrer", async ({ page }) => {
    await page.goto("/", { referer: "https://www.google.com/" });
    const ref = new URL(await tap(page, "google_play")).searchParams.get("referrer");
    expect(ref).toContain("utm_source=google");
    expect(ref).toContain("utm_content=%2F");
  });
});
