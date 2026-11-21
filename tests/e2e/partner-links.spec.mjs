// Partner links: tile-iq.com/go/<code> is what a partner puts on their own website. For now each one
// is a _redirects rule to the home page tagged with the partner (the static test server doesn't run
// _redirects, so the rules are checked as text), and the tagged landing must carry the partner on to
// the store links like any other source. -test links are the partner's own test links.
import fs from "node:fs";
import { test, expect } from "./fixtures.mjs";

const rules = () => fs.readFileSync(new URL("../../_redirects", import.meta.url), "utf8");
const SFT = "/?utm_source=software-for-tradespeople&utm_medium=referral&utm_campaign=partner-sft";

test.describe("Partner links", () => {
  test.skip(({ isMobile }) => isMobile, "desktop is enough for link checks");

  test("/go/sft and its test link redirect to the home page tagged with the partner", () => {
    const r = rules();
    for (const from of ["/go/sft", "/go/SFT", "/go/sft/"]) {
      expect(r).toContain(`${from} ${SFT} 302\n`);
    }
    for (const from of ["/go/sft-test", "/go/SFT-TEST", "/go/sft-test/"]) {
      expect(r).toContain(`${from} ${SFT}-test 302\n`);
    }
  });

  test("partner links are temporary (302) so Phase 2 can take over the same addresses", () => {
    const goLines = rules().split("\n").filter(l => l.startsWith("/go/"));
    expect(goLines.length).toBeGreaterThan(0);
    for (const l of goLines) expect(l.endsWith(" 302")).toBe(true);
  });

  test("a visit from the partner link carries the partner to Google Play", async ({ page }) => {
    await page.goto(SFT);
    const href = await page.evaluate(() => {
      const a = document.querySelector('a[href*="play.google.com"]');
      a.addEventListener("click", e => e.preventDefault());
      a.click();
      return a.href;
    });
    const ref = new URL(href).searchParams.get("referrer");
    expect(ref).toContain("utm_source=software-for-tradespeople");
    expect(ref).toContain("utm_medium=referral");
    expect(ref).toContain("utm_campaign=partner-sft");
  });
});
