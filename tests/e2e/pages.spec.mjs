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

test.describe("Shared header", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for the markup check");

  // /tour/ is a full-screen player and /signup/ is the app's sign-up screen: no site header (see tools/site_chrome.py)
  for (const path of paths.filter(p => !["/tour/", "/signup/"].includes(p))) {
    test(`${path} has the shared header, footer and the online demo button`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('link[rel="stylesheet"][href="/site.css"]')).toHaveCount(1);
      await expect(page.locator(".site-header .nav-actions a.btn-primary")).toHaveAttribute("href", "https://tile-iq.com/app/demo");
      await expect(page.locator(".site-header .nav-actions a.btn-primary")).toBeVisible();
      await expect(page.locator("footer .footer-bottom")).toBeVisible();
      // a second copy of site.js toggles every menu twice per click
      await expect(page.locator('script[src="/site.js"], script[src="site.js"]')).toHaveCount(1);
    });
  }
});

test("/signup.html has one h1 naming the page; the after-sign-up message is an h2", async ({ page }) => {
  await page.goto("/signup.html");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Create your TileIQ account");
  await expect(page.locator("#download-panel h2")).toContainText("Account created");
});

test.describe("Training pages (served at training.tile-iq.com)", () => {
  const pages = { "index.html": "https://training.tile-iq.com/",
                  "how-much-to-charge.html": "https://training.tile-iq.com/how-much-to-charge",
                  "pricing-tiling-jobs.html": "https://training.tile-iq.com/pricing-tiling-jobs" };
  for (const [file, canonical] of Object.entries(pages)) {
    test(`${file} has its canonical and links to the main site by full address`, async () => {
      const fs = await import("node:fs");
      const html = fs.readFileSync(new URL(`../../training/${file}`, import.meta.url), "utf8");
      expect(html).toContain(`<link rel="canonical" href="${canonical}">`);
      // On the subdomain a root-relative link like /guides/ would 404; only the training home and its #courses stay relative
      const relative = [...html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map(m => m[1]).filter(p => p !== "/" && p !== "/#courses");
      expect(relative).toEqual([]);
    });
  }
  test("the training sitemap lists the canonical addresses", async () => {
    const fs = await import("node:fs");
    const xml = fs.readFileSync(new URL("../../training/sitemap.xml", import.meta.url), "utf8");
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort()).toEqual(Object.values(pages).sort());
  });
});
