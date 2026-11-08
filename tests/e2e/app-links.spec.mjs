// The files phones read to decide whether a tile-iq.com link (e.g. /become-a-tester) may open the
// TileIQ app. Android: /.well-known/assetlinks.json must list the Play app-signing key, or Android
// opens the website instead.
import { test, expect } from "./fixtures.mjs";

const PLAY_APP_SIGNING = "B1:27:C8:06:BA:82:1E:BA:FD:A5:5A:D0:78:FD:93:D0:A2:65:A0:4F:8B:9B:64:B8:52:43:1E:7C:EB:84:AA:3B";
const UPLOAD_KEY = "25:12:E0:89:47:C4:A9:B3:87:7A:43:4A:D3:DB:61:F0:84:EC:4B:49:38:53:47:84:63:89:07:49:96:0E:6D:25";

test("Android assetlinks.json is valid and lists the Play app-signing key", async ({ request }) => {
  const res = await request.get("/.well-known/assetlinks.json");
  expect(res.status()).toBe(200);
  const links = await res.json();
  const app = links.find(l => l.target?.package_name === "com.tileiqpro.android");
  expect(app.relation).toContain("delegate_permission/common.handle_all_urls");
  expect(app.target.namespace).toBe("android_app");
  expect(app.target.sha256_cert_fingerprints).toEqual(expect.arrayContaining([PLAY_APP_SIGNING, UPLOAD_KEY]));
  for (const fp of app.target.sha256_cert_fingerprints) expect(fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

test("iOS apple-app-site-association lets the TileIQ app open /become-a-tester", async ({ request }) => {
  const res = await request.get("/.well-known/apple-app-site-association");
  expect(res.status()).toBe(200);
  const aasa = JSON.parse(await res.text());                         // served without a .json extension
  const d = aasa.applinks.details[0];
  expect(d.appIDs).toEqual(["S46AB9AH2K.com.tileiq.pro"]);
  expect(d.appID).toBe("S46AB9AH2K.com.tileiq.pro");                 // older iOS versions read appID + paths
  expect(d.components.map(c => c["/"])).toEqual(["/become-a-tester", "/become-a-tester/*"]);
  expect(d.paths).toEqual(["/become-a-tester", "/become-a-tester/*"]);
});

test("Cloudflare serves the iOS file as JSON", async () => {
  const { readFileSync } = await import("node:fs");
  const headers = readFileSync(new URL("../../_headers", import.meta.url), "utf8");
  expect(headers).toMatch(/\/\.well-known\/apple-app-site-association\n\s+Content-Type: application\/json/);
});
