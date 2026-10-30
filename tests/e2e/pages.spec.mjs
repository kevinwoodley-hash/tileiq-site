import fs from "node:fs";
import { test, expect } from "./fixtures.mjs";

// Every page listed in the sitemap should load, have a title and a single <h1>,
// keep its canonical on tile-iq.com, and run without JavaScript errors.
const sitemap = fs.readFileSync(new URL("../../sitemap.xml", import.meta.url), "utf8");
const paths = [...sitemap.matchAll(/<loc>https:\/\/tile-iq\.com([^<]*)<\/loc>/g)].map(m => m[1]);

test.describe("Sitemap pages", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for the smoke pass");

  for (const path of paths) {
    test(`${path} loads cleanly`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      const response = await page.goto(path);
      expect(response.status()).toBe(200);
      await expect(page).toHaveTitle(/\S/);
      await expect(page.locator("h1")).toHaveCount(1);
      const canonical = page.locator('link[rel="canonical"]');
      if (await canonical.count()) await expect(canonical).toHaveAttribute("href", /^https:\/\/tile-iq\.com\//);
      expect(errors).toEqual([]);
    });
  }
});

test("unknown pages get the 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response.status()).toBe(404);
  await expect(page.locator("h1")).toBeVisible();
});

test("header and footer links point at pages that exist", async ({ page, request }) => {
  await page.goto("/floor-tiling-calculator/");
  const hrefs = await page.locator('a[href^="/"]').evaluateAll(links =>
    [...new Set(links.map(a => new URL(a.getAttribute("href"), location.origin).pathname))]);
  const skip = /^\/app(\/|$)|^\/book-demo$|^\/contact$/; // served by the app / redirects in production
  for (const path of hrefs.filter(p => !skip.test(p))) {
    const res = await request.get(path);
    expect(res.status(), `${path} should exist`).toBe(200);
  }
});
