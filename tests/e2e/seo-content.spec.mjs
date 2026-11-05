import { test, expect } from "./fixtures.mjs";

// SEO Phase 1: the adhesive guide is linked from the main content of related pages (not only the
// footer), the estimating page carries its keyword and structured data, and existing URLs,
// calculators and the online demo are unchanged.
test.describe("SEO content", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for markup checks");

  const bodyLinkers = [
    "/tiling-material-calculator/", "/floor-tiling-calculator/", "/wall-tiling-calculator/",
    "/guides/how-to-quote-bathroom-tiling/", "/guides/how-to-quote-a-kitchen-floor/",
    "/guides/how-to-price-large-format-porcelain-tiling/", "/guides/tile-wastage-and-materials/",
    "/tiling-estimating-software/",
  ];
  for (const path of bodyLinkers) {
    test(`${path} links to the adhesive guide from its main content`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main a[href="/guides/tile-adhesive-coverage/"]').first()).toBeAttached();
    });
  }

  test("footer links to the adhesive guide", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('footer a[href="/guides/tile-adhesive-coverage/"]')).toHaveCount(1);
  });

  test("adhesive guide keeps its URL and canonical, and links to the calculators", async ({ page }) => {
    await page.goto("/guides/tile-adhesive-coverage/");
    await expect(page).toHaveTitle("How Much Tile Adhesive Do I Need? Per m² and Per 20kg Bag");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://tile-iq.com/guides/tile-adhesive-coverage/");
    for (const href of ["/tiling-material-calculator/", "/floor-tiling-calculator/", "/wall-tiling-calculator/"]) {
      await expect(page.locator(`main a[href="${href}"]`).first()).toBeAttached();
    }
    await expect(page.locator('a[href^="/app/demo"]').first()).toBeAttached();
  });

  test("main tile calculator keeps its SEO title", async ({ page }) => {
    await page.goto("/tiling-material-calculator/");
    await expect(page).toHaveTitle("Tile Calculator UK – How Many Tiles Do I Need? | TileIQ");
  });

  test("estimating page has the keyword in its H1 and valid SoftwareApplication data", async ({ page }) => {
    await page.goto("/tiling-estimating-software/");
    await expect(page.locator("h1")).toContainText("Tiling estimating software");
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    expect(desc.length).toBeLessThanOrEqual(160);
    const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
    const app = ld["@graph"].find(x => x["@type"] === "SoftwareApplication");
    expect(app).toBeTruthy();
    expect(app.offers.map(o => o.price)).toEqual(["0", "9.99", "79.99"]);
    expect(app.aggregateRating).toBeUndefined();   // no reviews yet: never claim a rating
  });

  test("the labour calculator is for tilers and sends homeowners to the rates guide", async ({ page }) => {
    await page.goto("/tiling-labour-cost-calculator/");
    await expect(page).toHaveTitle("Tiling Labour Calculator for Tilers: Price a Job | TileIQ");
    await expect(page.locator("h1")).toHaveText("Tiling labour calculator for tilers");
    await expect(page.locator('.calc-intro a[href="/guides/tiling-labour-rates-uk/"]')).toHaveText("how much a tiler charges");
    await page.goto("/tiling-day-rate-calculator/");
    await expect(page.locator('.calc-intro a[href="/guides/tiling-labour-rates-uk/"]')).toBeAttached();
  });

  test("the rates guide answers per m², per day and per hour, with sourced figures only", async ({ page }) => {
    await page.goto("/guides/tiling-labour-rates-uk/");
    await expect(page).toHaveTitle("How Much Does a Tiler Charge? Per m², Day & Hour (UK 2026)");
    for (const q of ["per hour?", "per day?", "per m²?"]) {
      await expect(page.locator("h3", { hasText: q })).toHaveCount(1);
    }
    // figures that the cited sources no longer support must not come back
    const text = await page.locator("main").innerText();
    for (const gone of ["£20–£50", "£18–£35", "£60–£95", "£80–£130", "by region and tile type"]) expect(text).not.toContain(gone);
  });

  test("no page calls the labour calculator a 'labour cost calculator'", async ({ page }) => {
    for (const path of ["/", "/guides/tiling-labour-rates-uk/", "/tiling-material-calculator/", "/features"]) {
      await page.goto(path);
      const names = await page.locator('a[href="/tiling-labour-cost-calculator/"]').allTextContents();
      expect(names.join(" | ").toLowerCase()).not.toContain("labour cost calculator");
    }
  });

  test("every JSON-LD block on the changed pages parses", async ({ page }) => {
    for (const path of ["/guides/tile-adhesive-coverage/", "/tiling-estimating-software/", "/tiling-material-calculator/"]) {
      await page.goto(path);
      for (const s of await page.locator('script[type="application/ld+json"]').allTextContents()) JSON.parse(s);
    }
  });
});
