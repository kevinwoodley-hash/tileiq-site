import { test, expect } from "./fixtures.mjs";

test.describe("Cookie banner", () => {
  test.use({ freshVisitor: true });

  const banner = page => page.getByRole("dialog", { name: "Cookie choices" });

  test("asks a first-time visitor and remembers Reject", async ({ page }) => {
    await page.goto("/");
    await expect(banner(page)).toBeVisible();
    await banner(page).getByRole("button", { name: "Reject" }).click();
    await expect(banner(page)).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("tileiq-analytics-consent"))).toBe("denied");
    expect(await page.evaluate(() => typeof window.gtag)).toBe("undefined");

    await page.goto("/features");
    await expect(banner(page)).toBeHidden();
  });

  test("Accept loads Google Analytics", async ({ page }) => {
    await page.goto("/");
    const gaRequest = page.waitForRequest(/googletagmanager\.com\/gtag\/js/);
    await banner(page).getByRole("button", { name: "Accept" }).click();
    await gaRequest;
    expect(await page.evaluate(() => localStorage.getItem("tileiq-analytics-consent"))).toBe("granted");
    expect(await page.evaluate(() => typeof window.gtag)).toBe("function");
  });

  test("no analytics script loads before a choice is made", async ({ page }) => {
    const gaRequests = [];
    page.on("request", r => { if (/googletagmanager|posthog/.test(r.url())) gaRequests.push(r.url()); });
    await page.goto("/");
    await expect(banner(page)).toBeVisible();
    expect(gaRequests).toEqual([]);
  });

  test("Settings lets the visitor save a choice, and the footer link reopens it", async ({ page }) => {
    await page.goto("/");
    await banner(page).getByRole("button", { name: "Settings" }).click();
    const analytics = banner(page).locator("#tileiq-consent-analytics");
    await expect(analytics).not.toBeChecked();
    await analytics.check();
    await banner(page).getByRole("button", { name: "Save choices" }).click();
    expect(await page.evaluate(() => localStorage.getItem("tileiq-analytics-consent"))).toBe("granted");

    await page.locator("footer").getByRole("link", { name: "Cookie settings" }).click();
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).locator("#tileiq-consent-analytics")).toBeChecked();
  });
});
