import { test, expect } from "./fixtures.mjs";

const FORMSPREE = "https://formspree.io/f/xkjwkzrr";
const DEMO_WORKER = "https://damp-bread-e0f9.kevin-woodley.workers.dev/book-demo";

test.describe("Contact form (/contact.html)", () => {
  test.beforeEach(async ({ page }) => { await page.goto("/contact.html"); });

  const fillIn = async page => {
    await page.locator("#contact-name").fill("Test Tiler");
    await page.locator("#contact-business").fill("Test Tiling Ltd");
    await page.locator("#contact-email").fill("test@example.com");
    await page.locator("#contact-message").fill("Does TileIQ work with a Disto D2?");
  };

  test("sends the enquiry to Formspree and shows the thank-you message", async ({ page }) => {
    let body = "";
    await page.route(FORMSPREE, route => {
      body = route.request().postData() || "";
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await fillIn(page);
    await page.locator("#contact-submit").click();
    await expect(page.locator("#contact-success")).toBeVisible();
    await expect(page.locator("#website-contact-form")).toBeHidden();
    for (const value of ["Test Tiler", "Test Tiling Ltd", "test@example.com", "Disto D2", "TileIQ website enquiry"]) {
      expect(body).toContain(value);
    }
  });

  test("shows the error from Formspree and lets the visitor try again", async ({ page }) => {
    await page.route(FORMSPREE, route => route.fulfill({
      status: 422, contentType: "application/json", body: '{"errors":[{"message":"Email is invalid"}]}',
    }));
    await fillIn(page);
    await page.locator("#contact-submit").click();
    await expect(page.locator("#contact-error")).toHaveText("Email is invalid");
    await expect(page.locator("#contact-submit")).toBeEnabled();
    await expect(page.locator("#contact-success")).toBeHidden();
  });

  test("required fields stop an empty form being sent", async ({ page }) => {
    let sent = false;
    await page.route(FORMSPREE, route => { sent = true; route.abort(); });
    await page.locator("#contact-submit").click();
    await expect(page.locator("#contact-name")).toHaveJSProperty("validity.valueMissing", true);
    expect(sent).toBe(false);
  });
});

test.describe("Contact form (/contact/)", () => {
  test("posts the form and resets it", async ({ page }) => {
    await page.route(FORMSPREE, route =>
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
    await page.goto("/contact/");
    await page.locator("#name").fill("Test Tiler");
    await page.locator("#email").fill("test@example.com");
    await page.locator("#message").fill("Hello");
    await page.locator("#send-btn").click();
    await expect(page.locator("#success-msg")).toBeVisible();
    await expect(page.locator("#name")).toHaveValue("");
  });
});

test.describe("Book a demo form", () => {
  test("sends the request as JSON and shows confirmation", async ({ page }) => {
    let payload;
    await page.route(DEMO_WORKER, route => {
      payload = route.request().postDataJSON();
      route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.goto("/book-demo.html");
    await page.locator("#demo-name").fill("Test Tiler");
    await page.locator("#demo-email").fill("test@example.com");
    await page.locator("#demo-notes").fill("Quoting speed");
    await page.locator("#demo-submit").click();
    await expect(page.locator("#demo-success")).toBeVisible();
    await expect(page.locator("#book-demo-form")).toBeHidden();
    expect(payload).toMatchObject({ name: "Test Tiler", email: "test@example.com", notes: "Quoting speed" });
  });

  test("shows the server's error message", async ({ page }) => {
    await page.route(DEMO_WORKER, route =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Calendar unavailable"}' }));
    await page.goto("/book-demo.html");
    await page.locator("#demo-name").fill("Test Tiler");
    await page.locator("#demo-email").fill("test@example.com");
    await page.locator("#demo-submit").click();
    await expect(page.locator("#demo-error")).toHaveText("Calendar unavailable");
  });
});
