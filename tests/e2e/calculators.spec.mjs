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

  test("rounds tiling time up to the half day", async ({ page }) => {
    await fill(page, { "lc-walls": 4, "lc-floors": 0 });
    await expect(page.locator("#lc-res-days")).toHaveText("0.5 days tiling");
    await fill(page, { "lc-walls": 8 });
    await expect(page.locator("#lc-res-days")).toHaveText("1 day tiling");
  });
});
