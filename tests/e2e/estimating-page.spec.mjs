import { test, expect } from "./fixtures.mjs";

// /tiling-estimating-software/: metadata, the free real-app CTA, the worked bathroom example,
// real screenshots, structured data and links in from related pages.
const PAGE = "/tiling-estimating-software/";

test.describe("Tiling estimating software page", () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE); });

  test("has the new title, H1, description and canonical", async ({ page }) => {
    await expect(page).toHaveTitle("Tiling Estimating Software for UK Tilers | TileIQ");
    await expect(page.locator("h1")).toHaveText(/Tiling estimating software\s*that does the maths for you\./);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc).toBe("Estimate tiling jobs, calculate tiles and materials, price labour and send professional quotes with TileIQ. Try the real app free, no sign-up needed.");
    expect(desc.length).toBeLessThanOrEqual(160);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://tile-iq.com/tiling-estimating-software/");
  });

  test("the main button opens the real app; the demo and both stores are still linked", async ({ page }) => {
    const hero = page.locator(".features-hero");
    await expect(hero.locator("a.btn-primary")).toHaveAttribute("href", "/app/?tq_src=page-tiling-estimating-software&tq_med=page");
    await expect(hero.locator("a.btn-primary")).toContainText("Use the real app free");
    await expect(hero.locator('a[href="https://tile-iq.com/app/demo"]')).toBeVisible();
    await expect(hero.locator(".est-free")).toContainText("no sign-up");
    await expect(page.locator('a[href="https://play.google.com/store/apps/details?id=com.tileiqpro.android"]').first()).toBeAttached();
    await expect(page.locator('a[href="https://apps.apple.com/gb/app/tileiq-pro/id6787447373"]').first()).toBeAttached();
    await expect(page.locator('.cta-section a[href^="/app/?tq_src="]')).toBeAttached();
    await expect(page.locator('.cta-section a[href="https://tile-iq.com/app/demo"]')).toBeAttached();
  });

  test("the bathroom example adds up", async ({ page }) => {
    const t = page.locator(".est-example table");
    await expect(t).toContainText("Walls 25.44 m²");
    await expect(t).toContainText("floor 6.72 m²");
    await expect(t).toContainText("£2,621.19");
    await expect(t).toContainText("£524.24");
    await expect(t).toContainText("£3,145.43");
    // the parts shown on TileIQ's own screen make the room total; VAT at 20% makes the quote
    const parts = 1217.48 + 1116.19 + 149.04 + 122.88 + 15.60;
    expect(parts.toFixed(2)).toBe("2621.19");
    expect((2621.19 * 0.2).toFixed(2)).toBe("524.24");
    expect((2621.19 * 1.2).toFixed(2)).toBe("3145.43");
  });

  test("covers each part of the job, with jump links that work", async ({ page }) => {
    for (const id of ["why", "measure", "example", "quote", "jobs", "expenses", "faq"]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
      await expect(page.locator(`.feature-jump-nav a[href="#${id}"]`)).toHaveCount(1);
    }
    for (const h of ["Room measurements", "Tile quantities with wastage", "Adhesive & grout by coverage", "Labour from your rates",
                     "Sent and accepted online", "Customer records", "Job pipeline", "Scan a receipt"]) {
      await expect(page.locator("h3", { hasText: h })).toHaveCount(1);
    }
  });

  test("uses real app screenshots that load, each with alt text", async ({ page, request }) => {
    const shots = await page.locator("main img").evaluateAll(imgs => imgs.map(i => ({ src: i.getAttribute("src"), alt: i.alt }))
      .filter(i => i.src.startsWith("/")));
    expect(shots.length).toBeGreaterThanOrEqual(8);
    for (const s of shots) {
      expect(s.src).toMatch(/^\/tour\/img\/\d\d-[a-f0-9]+\.webp$/);
      expect(s.alt.length).toBeGreaterThan(10);
      expect((await request.get(s.src)).status(), s.src).toBe(200);
    }
  });

  test("structured data lists features and verified prices, and no ratings", async ({ page }) => {
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    const app = ld["@graph"].find(x => x["@type"] === "SoftwareApplication");
    expect(app.offers.map(o => o.price)).toEqual(["0", "9.99", "79.99"]);
    expect(app.featureList).toContain("Job expenses with receipt scanning");
    expect(app.aggregateRating).toBeUndefined();
    expect(app.review).toBeUndefined();
    const webpage = ld["@graph"].find(x => x["@type"] === "WebPage");
    expect(webpage.name).toBe("Tiling Estimating Software for UK Tilers | TileIQ");
  });

  test("fits the screen without sideways scrolling", async ({ page }) => {
    const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(scroll).toBeLessThanOrEqual(width);
  });
});

test.describe("Links in to the estimating page", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for markup checks");
  for (const path of ["/tiling-material-calculator/", "/guides/how-to-quote-bathroom-tiling/", "/tiling-job-management/",
                      "/tiling-quote-app/", "/guides/tile-adhesive-coverage/"]) {
    test(`${path} links to it from its content`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main a[href="/tiling-estimating-software/"]').first()).toBeAttached();
    });
  }
});
