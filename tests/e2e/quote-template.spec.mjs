import { test, expect } from "./fixtures.mjs";

// The free tiling quote template on /guides/tiling-quote-template/: the sums, the printed quote,
// and that nothing a tiler types is stored or sent anywhere.
const PAGE = "/guides/tiling-quote-template/";
const line = (page, i) => page.locator(".qt-line").nth(i);
const setLine = async (page, i, { desc, qty, rate }) => {
  if (desc != null) await line(page, i).locator(".qt-desc").fill(String(desc));
  if (qty != null) await line(page, i).locator(".qt-qty").fill(String(qty));
  if (rate != null) await line(page, i).locator(".qt-rate").fill(String(rate));
};

test.describe("Tiling quote template", () => {
  test.beforeEach(async ({ page }) => { await page.goto(PAGE); });

  test("starts with four lines, today's date and no total", async ({ page }) => {
    await expect(page.locator(".qt-line")).toHaveCount(4);
    await expect(line(page, 0).locator(".qt-desc")).toHaveValue("Wall tiling labour");
    expect(await page.locator("#qt-date").inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.locator("#qt-total")).toHaveText("£0.00");
  });

  test("works out qty × rate, fixed prices and the total", async ({ page }) => {
    await setLine(page, 0, { qty: 20, rate: 45 });          // 20 m² × £45
    await setLine(page, 2, { rate: 250 });                   // fixed price: Qty left blank
    await expect(line(page, 0).locator(".qt-amt")).toHaveText("£900.00");
    await expect(line(page, 2).locator(".qt-amt")).toHaveText("£250.00");
    await expect(page.locator("#qt-sub")).toHaveText("£1,150.00");
    await expect(page.locator("#qt-total")).toHaveText("£1,150.00");
    await expect(page.locator("#qt-vat-row")).toBeHidden();
  });

  test("adds VAT at 20% and a deposit", async ({ page }) => {
    await page.click("#qt-example");                         // £1,580.00 of example lines
    await expect(page.locator("#qt-sub")).toHaveText("£1,580.00");
    await page.locator("#qt-vat").selectOption("20");
    await expect(page.locator("#qt-vatamt")).toHaveText("£316.00");
    await expect(page.locator("#qt-total")).toHaveText("£1,896.00");
    await page.locator("#qt-dep").fill("25");
    await expect(page.locator("#qt-depamt")).toHaveText("£474.00 (25%)");
  });

  test("the example is labelled as example figures, not price guidance", async ({ page }) => {
    await expect(page.locator(".qt-example-note")).toBeHidden();
    await page.click("#qt-example");
    await expect(page.locator(".qt-example-note")).toBeVisible();
    await page.click("#qt-clear");
    await expect(page.locator(".qt-example-note")).toBeHidden();
  });

  test("lines can be added and removed, and the total follows", async ({ page }) => {
    await page.click("#qt-add");
    await expect(page.locator(".qt-line")).toHaveCount(5);
    await setLine(page, 4, { desc: "Skip hire", rate: 120 });
    await expect(page.locator("#qt-total")).toHaveText("£120.00");
    await line(page, 4).locator(".qt-del").click();
    await expect(page.locator(".qt-line")).toHaveCount(4);
    await expect(page.locator("#qt-total")).toHaveText("£0.00");
  });

  test("blank and negative numbers count as zero", async ({ page }) => {
    await setLine(page, 0, { qty: -5, rate: 40 });
    await expect(line(page, 0).locator(".qt-amt")).toHaveText("£0.00");
    await setLine(page, 1, { qty: 2, rate: -10 });
    await expect(page.locator("#qt-total")).toHaveText("£0.00");
  });

  test("Clear puts the template back to its starting state", async ({ page }) => {
    await page.click("#qt-example");
    await page.locator("#qt-vat").selectOption("20");
    await page.click("#qt-clear");
    await expect(page.locator("#qt-biz")).toHaveValue("");
    await expect(page.locator("#qt-num")).toHaveValue("Q-0001");
    await expect(page.locator("#qt-vat")).toHaveValue("0");
    await expect(page.locator(".qt-line")).toHaveCount(4);
    await expect(page.locator("#qt-total")).toHaveText("£0.00");
    await expect(page.locator("#qt-excl")).toHaveValue(/Removing the existing suite/);
  });

  test("the printed quote shows the details, lines and totals", async ({ page }) => {
    await page.click("#qt-example");
    await page.locator("#qt-vat").selectOption("20");
    await page.locator("#qt-vatno").fill("GB123456789");
    await page.evaluate(() => window.tileiqQuoteTemplate.buildDoc());
    const doc = page.locator("#qt-doc");
    await expect(doc).toContainText("Your Tiling Ltd");
    await expect(doc).toContainText("VAT no. GB123456789");
    await expect(doc).toContainText("Q-0001");
    await expect(doc).toContainText(/Valid until \d{1,2} \w+ \d{4}/);
    await expect(doc).toContainText("Mrs A Customer, 12 Example Road, Anytown");
    await expect(doc.locator("tbody tr")).toHaveCount(4);
    await expect(doc.locator("tbody tr").first()).toContainText("£45.00/m²");
    await expect(doc).toContainText("Total including VAT");
    await expect(doc).toContainText("£1,896.00");
    await expect(doc).toContainText("Supplied by the customer.");
  });

  test("leaves out empty lines and says no VAT is charged when not registered", async ({ page }) => {
    await setLine(page, 0, { qty: 10, rate: 40 });
    await page.evaluate(() => window.tileiqQuoteTemplate.buildDoc());
    await expect(page.locator("#qt-doc tbody tr")).toHaveCount(1);
    await expect(page.locator("#qt-doc")).toContainText("No VAT charged");
  });

  test("what's typed is shown as text, never as page markup", async ({ page }) => {
    await page.locator("#qt-biz").fill('<img src=x onerror="window.__xss=1">Tiles & Co');
    await page.evaluate(() => window.tileiqQuoteTemplate.buildDoc());
    await expect(page.locator("#qt-doc .qtd-biz")).toHaveText('<img src=x onerror="window.__xss=1">Tiles & Co');
    await expect(page.locator("#qt-doc img")).toHaveCount(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test("printing from the template shows only the quote", async ({ page }) => {
    await page.click("#qt-example");
    await page.evaluate(() => { window.tileiqQuoteTemplate.buildDoc(); document.documentElement.classList.add("qt-printing"); });
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#qt-doc")).toBeVisible();
    await expect(page.locator(".site-header")).toBeHidden();
    await expect(page.locator(".guide-toc")).toBeHidden();
    await expect(page.locator("#qt-biz")).toBeHidden();
    await expect(page.locator("footer")).toBeHidden();
  });

  test("printing the page any other way prints the guide as normal", async ({ page }) => {
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("#qt-doc")).toBeHidden();
    await expect(page.locator("h1")).toBeVisible();
  });

  test("nothing typed is stored or sent anywhere", async ({ page }) => {
    const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()));
    const sent = [];
    page.on("request", r => { if (r.method() !== "GET") sent.push(r.url()); });
    await page.locator("#qt-biz").fill("Private Tiling Co");
    await page.locator("#qt-cust").fill("Customer Name");
    await setLine(page, 0, { qty: 3, rate: 30 });
    await page.evaluate(() => window.tileiqQuoteTemplate.buildDoc());
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))).toBe(before);
    expect(await page.evaluate(() => Object.keys(sessionStorage).length)).toBe(0);
    expect(await page.evaluate(() => document.cookie)).not.toMatch(/Private|Customer/);
    expect(sent).toEqual([]);
  });
});

