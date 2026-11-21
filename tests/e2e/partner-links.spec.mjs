// Partner links: tile-iq.com/go/<code> is what a partner company puts on its own website.
// functions/go/[[path]].js checks the code with the worker and sends the visitor to the home page
// tagged with the partner plus partner=<CODE> (the static test server doesn't run Pages Functions,
// so the function is called directly here with the worker faked). On the page, analytics.js carries
// the code to Google Play, the web app and signup, never to the demo, and stores nothing.
import fs from "node:fs";
import { test, expect } from "./fixtures.mjs";
import { onRequestGet } from "../../functions/go/[[path]].js";

const LANDING = "/signup.html?utm_source=software-for-tradespeople&utm_medium=referral&utm_campaign=partner-sft&partner=SFT";

// Run the Pages Function for /go/<path>, with the worker answering `worker` (or failing).
async function goLink(path, worker, ua = "Mozilla/5.0 (Linux; Android 14; Pixel 7)") {
  const real = globalThis.fetch, seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (worker === "down") throw new Error("unreachable");
    return new Response(JSON.stringify(worker), { status: 200 });
  };
  try {
    const parts = path.split("/").filter(Boolean);
    const res = await onRequestGet({ request: new Request("https://tile-iq.com/go/" + path, { headers: { "user-agent": ua } }), params: { path: parts } });
    return { status: res.status, location: res.headers.get("Location"), seen };
  } finally { globalThis.fetch = real; }
}
const SFT = { ok: true, name: "Software for Tradespeople", code: "SFT", test: false, utm_source: "software-for-tradespeople", utm_campaign: "partner-sft" };

test.describe("Partner links", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for link checks");

  test("/go/sft (any case, with or without a slash) goes to signup tagged with the partner and its code", async () => {
    for (const p of ["sft", "SFT", "sft/"]) {
      const r = await goLink(p, SFT);
      expect(r.status).toBe(302);
      expect(r.location).toBe(LANDING);
      expect(r.seen[0]).toContain("/api/partner-link?code=SFT");
    }
  });

  test("the test link is tagged as the partner's test", async () => {
    const r = await goLink("sft-test", { ...SFT, code: "SFT-TEST", test: true, utm_campaign: "partner-sft-test" });
    expect(r.location).toBe("/signup.html?utm_source=software-for-tradespeople&utm_medium=referral&utm_campaign=partner-sft-test&partner=SFT-TEST");
  });

  test("unknown or paused codes, and nonsense, go to the plain signup page", async () => {
    expect((await goLink("nope", { ok: false })).location).toBe("/signup.html");
    const bad = await goLink("<script>", SFT);
    expect(bad.location).toBe("/signup.html");
    expect(bad.seen.length).toBe(0);                                  // never even asked
    expect((await goLink("", SFT)).location).toBe("/signup.html");
  });

  test("iPhone and iPad go to the same signup page", async () => {
    const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    const IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
    for (const ua of [IPHONE, IPAD]) expect((await goLink("sft", SFT, ua)).location).toBe(LANDING);
    expect((await goLink("sft", "down", IPHONE)).location).toBe("/signup.html?partner=SFT");
    expect((await goLink("nope", { ok: false }, IPHONE)).location).toBe("/signup.html");          // unknown code: signup without a partner
  });

  test("worker unreachable: the visitor still gets the code", async () => {
    expect((await goLink("sft", "down")).location).toBe("/signup.html?partner=SFT");
    expect((await goLink("sft", { error: "Not found" })).location).toBe("/signup.html?partner=SFT");   // worker not updated yet
    expect((await goLink("sft", { ok: true })).location).toBe("/signup.html?partner=SFT");            // half an answer
  });

  test("the old temporary redirects are gone (they would override the function)", () => {
    expect(fs.readFileSync(new URL("../../_redirects", import.meta.url), "utf8")).not.toMatch(/^\/go\//m);
  });

  // Tap a link without leaving the page; returns where it would go.
  const tap = (page, sel) => page.evaluate(sel => {
    const a = document.querySelector(sel);
    a.addEventListener("click", e => e.preventDefault());
    a.click();
    return a.href;
  }, sel);

  test("on the landing page: a note with the code, and the code goes on to Google Play", async ({ page }) => {
    await page.goto(LANDING.replace("/signup.html?", "/?"));
    await expect(page.locator("#partner-note")).toContainText("Your partner code is SFT");
    const ref = new URL(await tap(page, 'a[href*="play.google.com"]')).searchParams.get("referrer");
    const q = new URLSearchParams(ref);
    expect([q.get("utm_source"), q.get("utm_medium"), q.get("utm_campaign"), q.get("partner")])
      .toEqual(["software-for-tradespeople", "referral", "partner-sft", "SFT"]);
    expect(await page.evaluate(() => JSON.stringify(localStorage) + document.cookie)).not.toContain("SFT");   // nothing stored
  });

  test("the code goes on to signup and the web app, but not the demo", async ({ page }) => {
    await page.goto(LANDING.replace("/signup.html?", "/?"));
    await page.evaluate(() => document.body.insertAdjacentHTML("beforeend",
      '<a id="t-signup" href="/signup.html">s</a><a id="t-app" href="https://tile-iq.com/app">a</a><a id="t-demo" href="https://tile-iq.com/app/demo">d</a><a id="t-out" href="https://example.com/app">o</a>'));
    expect(new URL(await tap(page, "#t-signup")).searchParams.get("partner")).toBe("SFT");
    expect(new URL(await tap(page, "#t-app")).searchParams.get("partner")).toBe("SFT");
    expect(new URL(await tap(page, "#t-demo")).searchParams.get("partner")).toBeNull();
    expect(new URL(await tap(page, "#t-out")).searchParams.get("partner")).toBeNull();
  });

  test("signup from a partner link on iPhone: told to make the account here first, and the app is opened with the code", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
    const page = await ctx.newPage();
    await page.route(/supabase|jsdelivr|workers\.dev/, r => r.fulfill({ status: 200, body: "" }));
    await page.goto(LANDING);
    await expect(page.locator("#partner-note")).toContainText("Create your free account here first");
    await expect(page.locator("#partner-note")).toContainText("same email");
    await expect.poll(() => page.locator("#tileiq-app").getAttribute("src")).toBe("/app?partner=SFT");
    await ctx.close();
  });

  test("iPhone landing on the home page: the note's main button is website signup with the code", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
    const page = await ctx.newPage();
    await page.goto("/?partner=SFT");
    await expect(page.locator("#partner-note-signup")).toHaveAttribute("href", "/signup.html?partner=SFT");
    await expect(page.locator("#partner-note")).toContainText("On iPhone, create your free account here first");
    await ctx.close();
  });

  test("Android and computers: the signup page from the link shows the code is added", async ({ page }) => {
    await page.route(/supabase|jsdelivr|workers\.dev/, r => r.fulfill({ status: 200, body: "" }));
    await page.goto(LANDING);
    await expect(page.locator("#partner-note")).toContainText("Partner code SFT is added for you");
    await expect.poll(() => page.locator("#tileiq-app").getAttribute("src")).toBe("/app?partner=SFT");
    // UK by default (the framed app can't start offline here, so the call is checked in the page)
    expect(fs.readFileSync(new URL("../../signup.html", import.meta.url), "utf8")).toContain("w.setSignupRegion('uk')");
  });

  test("signup never opens the demo: a demo session left from tile-iq.com/app/demo is dropped first", async ({ page }) => {
    await page.route(/supabase|jsdelivr|workers\.dev/, r => r.fulfill({ status: 200, body: "" }));
    const K = "sb-lzwmqabxpxuuznhbpewm-auth-token";
    await page.goto("/privacy.html");
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ access_token: "x", user: { email: "demo@tile-iq.com" } })), K);
    await page.goto(LANDING);
    await expect.poll(() => page.locator("#tileiq-app").getAttribute("src")).toBe("/app?partner=SFT");
    expect(await page.evaluate(k => localStorage.getItem(k), K)).toBeNull();
    // a real account's session is left alone
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ access_token: "y", user: { email: "tiler@example.com" } })), K);
    await page.goto("/signup.html");
    await expect.poll(() => page.locator("#tileiq-app").getAttribute("src")).toBe("/app");
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).user.email, K)).toBe("tiler@example.com");
  });

  test("without a partner: no note and no partner on the Play link", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#partner-note")).toHaveCount(0);
    const ref = new URL(await tap(page, 'a[href*="play.google.com"]')).searchParams.get("referrer");
    expect(ref).not.toContain("partner=");
  });

  test("the website signup form is filled in from the link", async ({ page }) => {
    await page.route(/supabase/, r => r.fulfill({ status: 200, body: "" }));
    await page.goto("/signup/?partner=SFT");
    await expect(page.locator("#partner-code")).toHaveValue("SFT");
  });

  test("the privacy policy explains partner links", async ({ page }) => {
    await page.goto("/privacy.html");
    await expect(page.getByRole("heading", { name: "Partner Companies" })).toBeVisible();
  });
});
