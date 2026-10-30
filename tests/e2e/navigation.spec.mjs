import { test, expect } from "./fixtures.mjs";

test.describe("Header navigation", () => {
  test("desktop nav links are visible and go to the right pages", async ({ page, isMobile }) => {
    test.skip(isMobile, "desktop layout only");
    await page.goto("/");
    const nav = page.locator("#site-nav");
    await expect(nav.getByRole("link", { name: "Features" })).toBeVisible();
    await expect(page.locator(".mobile-menu-btn")).toBeHidden();
    await nav.getByRole("link", { name: "Guides" }).click();
    await expect(page).toHaveURL(/\/guides\/$/);
  });

  test("mobile menu opens, closes on Escape and on outside click", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile layout only");
    await page.goto("/");
    const button = page.locator(".mobile-menu-btn");
    const nav = page.locator("#site-nav");
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await expect(nav).toHaveClass(/mobile-open/);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(nav.getByRole("link", { name: "Features" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(nav).not.toHaveClass(/mobile-open/);
    await expect(button).toHaveAttribute("aria-expanded", "false");

    await button.click();
    await expect(nav).toHaveClass(/mobile-open/);
    await page.locator("main").click({ position: { x: 5, y: 400 } });
    await expect(nav).not.toHaveClass(/mobile-open/);
  });

  test("tapping a mobile menu link closes the menu and navigates", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile layout only");
    await page.goto("/floor-tiling-calculator/");
    await page.locator(".mobile-menu-btn").click();
    await page.locator("#site-nav").getByRole("link", { name: "Guides" }).click();
    await expect(page).toHaveURL(/\/guides\/$/);
  });

  test("pages fit the screen without sideways scrolling", async ({ page }) => {
    for (const path of ["/", "/features", "/floor-tiling-calculator/", "/guides/", "/blog/"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });
});
