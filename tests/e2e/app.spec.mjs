import { test, expect } from "./fixtures.mjs";

// The web app at /app/, signed in against a fake Supabase so nothing touches real accounts.
const USER = { id: "11111111-2222-3333-4444-555555555555", email: "tiler@example.com", aud: "authenticated",
  role: "authenticated", user_metadata: { full_name: "Test Tiler" }, app_metadata: { provider: "email" } };

async function fakeBackend(page) {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  const json = (route, body, status = 200) =>
    route.fulfill({ status, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify(body) });
  await page.route(/supabase\.co\//, route => {
    const req = route.request(), url = req.url();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (/\/auth\/v1\/token/.test(url)) return json(route, { access_token: "test", refresh_token: "test", expires_in: 3600, token_type: "bearer", user: USER });
    if (/\/auth\/v1\/user/.test(url)) return json(route, USER);
    if (/\/rest\/v1\/settings/.test(url) && req.method() === "GET") return json(route, [{ data: { companyName: "Test Tiling" } }]);
    if (/\/rest\/v1\/(?!rpc)/.test(url)) {
      if (req.method() !== "GET") return json(route, [], 201);
      return /pgrst\.object/.test(req.headers()["accept"] || "") ? json(route, { code: "PGRST116" }, 406) : json(route, []);
    }
    return json(route, {});
  });
  await page.route(/workers\.dev\//, route => json(route, {}));
}

const money = s => parseFloat(s.replace(/[^0-9.]/g, ""));

test.describe("Web app", () => {
  test.skip(({ isMobile }) => !isMobile, "the app is laid out for phones");

  test.beforeEach(async ({ page }) => {
    await fakeBackend(page);
    await page.goto("/app/");
    await page.locator("#si-email").fill(USER.email);
    await page.locator("#si-password").fill("password123");
    await page.locator("#si-submit").click();
    await expect(page.locator("#screen-home")).toBeVisible();
  });

  test("add a customer, measure a room and the quote matches the room card", async ({ page }) => {
    await page.locator("#bnav-customers").click();
    await page.locator("#screen-customers").getByText("+ Add").first().click();
    await page.locator("#ac-name").fill("Sarah Thompson");
    await page.locator("#ac-email").fill("sarah@example.com");
    await page.locator("#screen-add-customer").getByRole("button", { name: "Save Customer" }).click();
    await expect(page.locator("#customers-list")).toContainText("Sarah Thompson");

    await page.locator("#screen-customers").getByRole("button", { name: "+ Job" }).first().click();
    await page.locator("#rm-name").fill("Main Bathroom");
    await page.locator("#rm-r-length").fill("2.8");
    await page.locator("#rm-r-width").fill("2.2");
    await page.locator("#rm-r-height").fill("2.4");
    await page.locator("#screen-room").getByRole("button", { name: "Save Room" }).click();

    // The room card's Materials + Labour add up to the room total (sealant is a material)
    const card = page.locator(".room-card").first();
    await expect(card).toContainText("Main Bathroom");
    const total = money(await card.locator(".room-card-total").textContent());
    const [mats, lab] = await card.locator(".rcb-value").allTextContents().then(v => v.map(money));
    expect(total).toBeGreaterThan(0);
    expect(mats + lab).toBeCloseTo(total, 1);

    await page.locator("#job-quote-btn").click();
    const quote = page.locator("#screen-quote");
    await expect(quote).toContainText("Sarah Thompson");
    await expect(quote).toContainText("Test Tiling");
    const row = name => quote.locator("tr", { hasText: name }).first().locator("td").last();
    expect(money(await row("Materials").textContent())).toBeCloseTo(mats, 1);
    expect(money(await row("Labour").textContent())).toBeCloseTo(lab, 1);
    expect(money(await quote.locator(".quote-grand span").last().textContent())).toBeCloseTo(total * 1.2, 1);
  });
});
