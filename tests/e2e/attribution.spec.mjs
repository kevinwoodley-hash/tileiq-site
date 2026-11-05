import fs from "node:fs";
import { test, expect } from "./fixtures.mjs";

// Links from the site into the app carry tq_src / tq_med instead of UTM tags. A UTM on an internal
// link makes Google Analytics restart the session and credit our own page, hiding where the visitor
// really came from. These tests check the links, that a hop between our own pages isn't counted as
// a new visit, and that the app still learns which page sent the visitor (for sign-up attribution).
test.describe("Internal link attribution", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for attribution checks");

  const ROOT = new URL("../../", import.meta.url);
  const sitemap = fs.readFileSync(new URL("sitemap.xml", ROOT), "utf8");
  const paths = [...sitemap.matchAll(/<loc>https:\/\/tile-iq\.com([^<]*)<\/loc>/g)].map(m => m[1]);
  const fileFor = p => new URL((p.replace(/^\//, "") || "") + (p.endsWith("/") || p === "" ? "index.html" : ".html"), ROOT);

  test("no link from a site page to another tile-iq.com page carries UTM tags", () => {
    const offenders = [];
    for (const p of paths) {
      const f = fileFor(p);
      if (!fs.existsSync(f)) continue;
      const html = fs.readFileSync(f, "utf8");
      for (const m of html.matchAll(/href="((?:https:\/\/tile-iq\.com)?\/[^"]*)"/g)) {
        if (/[?&](amp;)?utm_/.test(m[1])) offenders.push(`${p} → ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("guide and calculator calls to action tag the page that sent the visitor", async ({ page }) => {
    await page.goto("/guides/tile-adhesive-coverage/");
    await expect(page.locator('.guide-cta a[data-cta-kind="web_app"]'))
      .toHaveAttribute("href", "/app/?tq_src=guide-tile-adhesive-coverage&tq_med=guide");
    await expect(page.locator('.guide-cta a[data-cta-kind="demo"]'))
      .toHaveAttribute("href", "/app/demo?tq_src=guide-tile-adhesive-coverage&tq_med=guide");
    await page.goto("/tiling-material-calculator/");
    await expect(page.locator('a[href^="/app/?tq_src=calc-tiling-material-calculator&tq_med=calculator"]').first()).toBeAttached();
  });

  const visitBeacons = page => {
    const sent = [];
    page.on("request", r => { if (/\/api\/site-visit$/.test(r.url())) sent.push(r.postData() || ""); });
    return sent;
  };
  const sources = page => page.evaluate(() => ({ source: window.tileiqConsent.source(), visit: window.tileiqConsent.visitSource() }));

  test("a visit from Google is recorded as Google organic", async ({ page }) => {
    const sent = visitBeacons(page);
    await page.goto("/guides/tile-adhesive-coverage/", { referer: "https://www.google.com/" });
    expect((await sources(page)).visit).toMatchObject({ s: "google", m: "organic" });
    await expect.poll(() => sent.filter(b => b.includes('"k":"visit"')).length).toBe(1);
    expect(sent[0]).toContain('"s":"google"');
  });

  test("a tagged hop from our own page isn't a new visit, but tells the app which page sent them", async ({ page }) => {
    const sent = visitBeacons(page);
    await page.goto("/features?tq_src=guide-tile-adhesive-coverage&tq_med=guide",
      { referer: "https://tile-iq.com/guides/tile-adhesive-coverage/" });
    const s = await sources(page);
    expect(s.visit).toBeNull();
    expect(s.source).toEqual({ s: "guide-tile-adhesive-coverage", m: "guide" });
    await page.waitForTimeout(300);
    expect(sent.filter(b => b.includes('"k":"visit"'))).toEqual([]);
  });

  test("an outside source wins over a tq_src left in a shared link", async ({ page }) => {
    await page.goto("/features?tq_src=guide-tile-adhesive-coverage&tq_med=guide", { referer: "https://www.google.com/" });
    expect((await sources(page)).source).toMatchObject({ s: "google", m: "organic" });
  });

  test("UTM tags on outside links still work", async ({ page }) => {
    await page.goto("/features?utm_source=facebook&utm_medium=paid_social&utm_campaign=disto");
    expect((await sources(page)).visit).toEqual({ s: "facebook", m: "paid_social", c: "disto" });
  });
});

test.describe("In-text guide link events", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for event checks");

  test.beforeEach(async ({ page }) => {
    await page.goto("/guides/how-to-quote-bathroom-tiling/");
    // Stand-in for Google Analytics (consent is "denied" in tests) and keep the click on this page
    await page.evaluate(() => {
      window.__events = [];
      window.gtag = (...args) => window.__events.push(args);
      document.addEventListener("click", e => e.preventDefault());
    });
  });

  test("clicking a link in the guide text sends guide_link_click", async ({ page }) => {
    await page.locator('.guide-body a[href="/tiling-material-calculator/"]').first().click();
    const events = await page.evaluate(() => window.__events);
    expect(events).toContainEqual(["event", "guide_link_click",
      { guide: "how-to-quote-bathroom-tiling", link_type: "calculator", link_path: "/tiling-material-calculator/" }]);
  });

  test("links to other guides and to TileIQ pages are labelled by kind", async ({ page }) => {
    await page.evaluate(() => {
      const body = document.querySelector(".guide-body");
      for (const href of ["/guides/tiling-labour-rates-uk/", "/tiling-estimating-software/", "/app/demo"]) {
        const a = document.createElement("a"); a.href = href; a.textContent = href; body.appendChild(a); a.click();
      }
    });
    const kinds = (await page.evaluate(() => window.__events)).filter(e => e[1] === "guide_link_click").map(e => e[2].link_type);
    expect(kinds).toEqual(["guide", "tileiq", "demo"]);
  });

  test("the call-to-action block keeps its own event and doesn't double count", async ({ page }) => {
    await page.locator('.guide-cta a[data-cta-kind="web_app"]').click();
    const names = (await page.evaluate(() => window.__events)).map(e => e[1]);
    expect(names).toContain("guide_cta_click");
    expect(names).not.toContain("guide_link_click");
  });
});
