import { test, expect } from "./fixtures.mjs";

const fill = async (page, values) => {
  for (const [id, value] of Object.entries(values)) await page.locator(`#${id}`).fill(String(value));
};

test.describe("Floor tiling calculator", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/floor-tiling-calculator/"); });

  test("shows results for the default 4 × 3 m room", async ({ page }) => {
    await expect(page.locator("#res-area")).toHaveText("12.00 m²");
    await expect(page.locator("#res-tile-area")).toHaveText("13.20 m²");
    await expect(page.locator("#res-tile-count")).toHaveText("37 tiles");
    await expect(page.locator("#res-adhesive")).toHaveText("60 kg (3 × 20 kg)");
    await expect(page.locator("#res-grout")).toHaveText("1.9 kg (1 × 2.5 kg)");
    await expect(page.locator("#res-boxes")).toHaveText("enter m² per box");
  });

  test("adds extra area and takes off untiled area", async ({ page }) => {
    await fill(page, { "fl-extra": 2, "fl-deduct": 1.5 });
    await expect(page.locator("#res-area")).toHaveText("12.50 m²");
  });

  test("works out boxes once m² per box is entered", async ({ page }) => {
    await fill(page, { "calc-box-m2": 1.44 });
    await expect(page.locator("#res-boxes")).toHaveText("10 boxes (14.40 m²)");
  });

  test("layout choice sets the wastage allowance", async ({ page }) => {
    await page.locator("#calc-layout").selectOption("25");
    await expect(page.locator("#calc-waste")).toHaveValue("25");
    await page.locator("#calc-waste").dispatchEvent("input");
    await expect(page.locator("#res-tile-area")).toHaveText("15.00 m²");
  });

  test("adhesive preset fills the kg per m², custom leaves it alone", async ({ page }) => {
    await page.locator("#calc-adh-type").selectOption("3");
    await expect(page.locator("#calc-adh-rate")).toHaveValue("3");
    await page.locator("#calc-adh-type").selectOption("");
    await expect(page.locator("#calc-adh-rate")).toHaveValue("3");
  });

  test("rounds whole tiles correctly despite floating-point noise", async ({ page }) => {
    await fill(page, { "fl-len": 6, "calc-tile-w": 300 });   // 6 × 3 m = 18 m² × 1.1 ÷ 0.18 = 110
    await expect(page.locator("#res-tile-count")).toHaveText("110 tiles");
  });

  test("never shows a negative area", async ({ page }) => {
    await fill(page, { "fl-deduct": 50 });
    await expect(page.locator("#res-area")).toHaveText("0.00 m²");
    await expect(page.locator("#res-tile-count")).toHaveText("–");
  });

  test("treats blank and negative inputs as zero", async ({ page }) => {
    await fill(page, { "fl-len": "", "fl-wid": -3 });
    await expect(page.locator("#res-area")).toHaveText("0.00 m²");
  });
});

test.describe("Wall tiling calculator", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/wall-tiling-calculator/"); });

  test("takes doors off the wall area", async ({ page }) => {
    await expect(page.locator("#res-area")).toHaveText("17.60 m²");
    await expect(page.locator("#res-tile-count")).toHaveText("108 tiles");
    await fill(page, { "wl-doors": 0 });
    await expect(page.locator("#res-area")).toHaveText("19.20 m²");
    await fill(page, { "wl-doors": 2, "wl-deduct": 1.2 });
    await expect(page.locator("#res-area")).toHaveText("14.80 m²");
  });
});

test.describe("Tiling material calculator", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/tiling-material-calculator/"); });

  test("shows materials for the default 35 m²", async ({ page }) => {
    await expect(page.locator("#res-tile-area")).toHaveText("38.50 m²");
    await expect(page.locator("#res-tile-count")).toHaveText("214 tiles");
    await expect(page.locator("#res-adhesive")).toHaveText("105 kg (6 × 20 kg)");
    await expect(page.locator("#res-grout")).toHaveText("8.3 kg (4 × 2.5 kg)");
  });

  test("recalculates as the area changes", async ({ page }) => {
    await fill(page, { "calc-area": 10, "calc-tile-l": 300 });
    await expect(page.locator("#res-tile-area")).toHaveText("11.00 m²");
    await expect(page.locator("#res-tile-count")).toHaveText("123 tiles");
  });

  test("shows the working behind each result", async ({ page }) => {
    const w = page.locator("#res-working");
    await expect(w).toContainText("35 m² + 10% wastage = 38.50 m² to buy");
    await expect(w).toContainText("38.50 ÷ 0.18 m² per tile = 213.9, so 214 tiles");
    await expect(w).toContainText("35 m² × 3 kg adhesive = 105 kg");
    await expect(w).toContainText("0.216 kg grout per m² × 35 m² + 10% = 8.3 kg");
  });

  test("matches the bathroom walls worked example on the page", async ({ page }) => {
    // 18 m² × 1.1 ÷ 0.18 is 110.00000000000001 in floating point: it must still be 110 tiles
    await fill(page, { "calc-area": 18, "calc-box-m2": 1.08, "calc-joint": 2, "calc-thick": 8 });
    await expect(page.locator("#res-tile-area")).toHaveText("19.80 m²");
    await expect(page.locator("#res-tile-count")).toHaveText("110 tiles");
    await expect(page.locator("#res-boxes")).toHaveText("19 boxes (20.52 m²)");
    await expect(page.locator("#res-adhesive")).toHaveText("54 kg (3 × 20 kg)");
    await expect(page.locator("#res-grout")).toHaveText("2.5 kg (2 × 2.5 kg)");
    await expect(page.locator("#worked-example-walls")).toBeAttached();
  });

  test("materials cost is optional and blank until prices are entered", async ({ page }) => {
    await expect(page.locator("#res-cost")).toHaveText("add prices (optional)");
    await expect(page.locator("#res-working")).not.toContainText("Tiles £");
  });

  test("prices tiles per m² in whole boxes, plus adhesive and grout bags", async ({ page }) => {
    // 38.50 m² ÷ 1.44 → 27 boxes = 38.88 m² × £25 = £972; 6 bags × £12 = £72; 4 bags × £8 = £32
    await fill(page, { "calc-box-m2": 1.44, "calc-price-m2": 25, "calc-price-adh": 12, "calc-price-grout": 8 });
    await expect(page.locator("#res-cost")).toHaveText("£1,076.00");
    await expect(page.locator("#res-working")).toContainText("Tiles £972.00 + adhesive £72.00 + grout £32.00");
  });

  test("prices tiles per m² on the area to buy when the box size isn't known", async ({ page }) => {
    await fill(page, { "calc-price-m2": 20 });   // 38.50 m² × £20
    await expect(page.locator("#res-cost")).toHaveText("£770.00");
  });

  test("a price per box needs the box size", async ({ page }) => {
    await fill(page, { "calc-price-box": 30 });
    await expect(page.locator("#res-cost")).toHaveText("enter m² per box");
    await fill(page, { "calc-box-m2": 1.44 });   // 27 boxes × £30
    await expect(page.locator("#res-cost")).toHaveText("£810.00");
  });

  test("copies the results as plain text", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await fill(page, { "calc-box-m2": 1.44, "calc-price-m2": 25 });
    await page.click("#calc-copy");
    await expect(page.locator("#calc-copied")).toHaveText("Copied");
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain("Area: 35 m², 600 × 300 mm tiles, 10% wastage");
    expect(text).toContain("Tile area to buy: 38.50 m²");
    expect(text).toContain("Boxes: 27 boxes (38.88 m²)");
    expect(text).toContain("Adhesive: 105 kg (6 × 20 kg)");
    expect(text).toContain("Materials cost: £972.00");
    expect(text).toContain("Estimates only");
  });

  test("results come before the optional prices on phones", async ({ page, isMobile }) => {
    const results = await page.locator(".calc-results").boundingBox();
    const prices = await page.locator("#calc-price-m2").boundingBox();
    if (isMobile) expect(results.y).toBeLessThan(prices.y);
    else expect(prices.x).toBeLessThan(results.x);   // desktop: prices stay in the inputs column
  });
});

test.describe("Tiler day rate calculator", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/tiling-day-rate-calculator/"); });

  test("shows the day rate for the defaults", async ({ page }) => {
    await expect(page.locator("#dr-res-total")).toHaveText("£50,400");
    await expect(page.locator("#dr-res-days")).toHaveText("200 days");
    await expect(page.locator("#dr-res-day")).toHaveText("£252");
    await expect(page.locator("#dr-res-hour")).toHaveText("£31.50");
    await expect(page.locator("#dr-res-walls")).toHaveText("£21.00");
    await expect(page.locator("#dr-res-floors")).toHaveText("£25.20");
    await expect(page.locator("#dr-vat")).toBeHidden();
  });

  test("shows the VAT warning over the £90,000 threshold", async ({ page }) => {
    await fill(page, { "dr-income": 90000 });
    await expect(page.locator("#dr-res-total")).toHaveText("£95,400");
    await expect(page.locator("#dr-vat")).toBeVisible();
  });

  test("shows dashes when there are no working days left", async ({ page }) => {
    await fill(page, { "dr-hol": 300 });
    await expect(page.locator("#dr-res-days")).toHaveText("0 days");
    await expect(page.locator("#dr-res-day")).toHaveText("–");
    await expect(page.locator("#dr-res-hour")).toHaveText("–");
  });
});

test.describe("Tiling labour cost calculator", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/tiling-labour-cost-calculator/"); });

  test("prices the default job and checks it against the day rate", async ({ page }) => {
    await expect(page.locator("#lc-res-tiling")).toHaveText("£1,250");
    await expect(page.locator("#lc-res-extras")).toHaveText("£0");
    await expect(page.locator("#lc-res-total")).toHaveText("£1,250");
    await expect(page.locator("#lc-res-vat")).toHaveText("not added");
    await expect(page.locator("#lc-res-days")).toHaveText("3.5 days tiling");
    await expect(page.locator("#lc-res-perday")).toHaveText("£357");
    await expect(page.locator("#lc-check")).toHaveText("In line with your day rate.");
    await expect(page.locator("#lc-check")).toHaveClass(/\bok\b/);
  });

  test("adds extras and VAT", async ({ page }) => {
    await fill(page, { "lc-strip": 100, "lc-lev-m2": 4 });
    await page.locator("#lc-vat").selectOption("1");
    await expect(page.locator("#lc-res-extras")).toHaveText("£200");
    await expect(page.locator("#lc-res-total")).toHaveText("£1,450");
    await expect(page.locator("#lc-res-vat")).toHaveText("£1,740");
  });

  test("applies the minimum charge", async ({ page }) => {
    await fill(page, { "lc-min": 2000 });
    await expect(page.locator("#lc-res-tiling")).toHaveText("£2,000");
  });

  test("warns when the job is well below or above the day rate", async ({ page }) => {
    await fill(page, { "lc-dayrate": 500 });
    await expect(page.locator("#lc-check")).toHaveText(/29% below your day rate/);
    await expect(page.locator("#lc-check")).toHaveClass(/\blow\b/);
    await fill(page, { "lc-dayrate": 200 });
    await expect(page.locator("#lc-check")).toHaveText(/79% above your day rate/);
    await expect(page.locator("#lc-check")).toHaveClass(/\bhigh\b/);
  });

  test("matches the bathroom worked example on the page", async ({ page }) => {
    await fill(page, { "lc-walls": 18, "lc-floors": 4, "lc-wrate": 45, "lc-frate": 50,
                       "lc-tank": 250, "lc-lev-m2": 4, "lc-lev-rate": 25, "lc-other": 60 });
    await expect(page.locator("#lc-res-tiling")).toHaveText("£1,010");
    await expect(page.locator("#lc-res-extras")).toHaveText("£410");
    await expect(page.locator("#lc-res-total")).toHaveText("£1,420");
    await expect(page.locator("#lc-res-days")).toHaveText("3 days tiling");
    await expect(page.locator("#lc-res-perday")).toHaveText("£337");
    await expect(page.locator("#lc-check")).toHaveText("In line with your day rate.");
    await expect(page.locator("#worked-example")).toBeAttached();
  });

  test("rounds tiling time up to the half day", async ({ page }) => {
    await fill(page, { "lc-walls": 4, "lc-floors": 0 });
    await expect(page.locator("#lc-res-days")).toHaveText("0.5 days tiling");
    await fill(page, { "lc-walls": 8 });
    await expect(page.locator("#lc-res-days")).toHaveText("1 day tiling");
  });
});

test.describe("Tile adhesive calculator (adhesive coverage guide)", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/guides/tile-adhesive-coverage/"); });

  test("shows an estimated range and bags for the default 10 m² of normal tiles", async ({ page }) => {
    // 10 m² × 2.5–3 kg/m² + 10% = 27.5–33 kg, shown in whole kg; bags round up from 33 kg
    await expect(page.locator("#adh-res-kg")).toHaveText("about 28–33 kg");
    await expect(page.locator("#adh-res-bags")).toHaveText("2 × 20 kg");
    await expect(page.locator("#adh-res-working")).toHaveText(/10 m² × 2\.5–3 kg\/m² \+ 10% allowance\. Estimate/);
  });

  test("states its assumptions and that it is an estimate", async ({ page }) => {
    const note = page.locator("#adh-assumptions");
    await expect(note).toContainText("Estimate only, not an exact quantity");
    await expect(note).toContainText("Adesilex P9");
    await expect(note).toContainText("2 kg/m²");
    await expect(note).toContainText("2.5–3 kg/m²");
    await expect(note).toContainText("5 kg/m²");
  });

  test("presets use Mapei's published rates", async ({ page }) => {
    await page.locator("#adh-type").selectOption("2-2");
    await expect(page.locator("#adh-res-kg")).toHaveText("about 22 kg");   // 10 × 2 × 1.1
    await expect(page.locator("#adh-res-bags")).toHaveText("2 × 20 kg");
    await page.locator("#adh-type").selectOption("5-5");
    await expect(page.locator("#adh-res-kg")).toHaveText("about 55 kg");   // 10 × 5 × 1.1
    await expect(page.locator("#adh-res-bags")).toHaveText("3 × 20 kg");
  });

  test("a zero allowance shows the data sheet figure alone", async ({ page }) => {
    await fill(page, { "adh-allow": 0 });
    await expect(page.locator("#adh-res-kg")).toHaveText("about 25–30 kg");
    await expect(page.locator("#adh-res-working")).not.toContainText("allowance");
  });

  test("an exact multiple of the bag size doesn't round up an extra bag", async ({ page }) => {
    await fill(page, { "adh-area": 20, "adh-allow": 0 });   // 50–60 kg
    await expect(page.locator("#adh-res-bags")).toHaveText("3 × 20 kg");
  });

  test("custom rate is hidden until chosen, then asks for the data sheet figure", async ({ page }) => {
    await expect(page.locator("#adh-custom-row")).toBeHidden();
    await page.locator("#adh-type").selectOption("custom");
    await expect(page.locator("#adh-custom-row")).toBeVisible();
    await expect(page.locator("#adh-res-kg")).toHaveText("–");
    await expect(page.locator("#adh-res-working")).toHaveText(/data sheet/);
    await fill(page, { "adh-rate": 4 });
    await expect(page.locator("#adh-res-kg")).toHaveText("about 44 kg");   // 10 × 4 × 1.1
    await expect(page.locator("#adh-res-bags")).toHaveText("3 × 20 kg");
    await page.locator("#adh-type").selectOption("2.5-3");
    await expect(page.locator("#adh-custom-row")).toBeHidden();
  });

  test("uses the bag size entered", async ({ page }) => {
    await fill(page, { "adh-bag": 25 });
    await expect(page.locator("#adh-res-bags")).toHaveText("2 × 25 kg");
  });

  test("treats blank and negative inputs as zero", async ({ page }) => {
    await fill(page, { "adh-area": "" });
    await expect(page.locator("#adh-res-kg")).toHaveText("–");
    await expect(page.locator("#adh-res-bags")).toHaveText("–");
    await fill(page, { "adh-area": 10, "adh-bag": -5 });
    await expect(page.locator("#adh-res-bags")).toHaveText("enter a bag size");
    await fill(page, { "adh-bag": 20, "adh-allow": -10 });
    await expect(page.locator("#adh-res-kg")).toHaveText("about 25–30 kg");
  });

  test("every input has a visible label", async ({ page }) => {
    for (const id of ["adh-area", "adh-type", "adh-bag", "adh-allow"]) {
      await expect(page.locator(`label[for="${id}"]`)).toBeVisible();
    }
  });
});
