// Every Google Play / App Store link on the site points at the real TileIQ app. (The sign-up
// success message linked to "com.tileiqpros.android", which doesn't exist, until Nov 2026.)
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "./fixtures.mjs";

const root = new URL("../../", import.meta.url).pathname;
const skip = new Set(["node_modules", "tests", ".git", "app", "functions", "functions-lib", "guides-src"]);
function htmlFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!skip.has(e.name) && !e.name.startsWith(".")) htmlFiles(path.join(dir, e.name), out); }
    else if (e.name.endsWith(".html")) out.push(path.join(dir, e.name));
  }
  return out;
}

test("Google Play and App Store links use the real app", async () => {
  const bad = [];
  for (const f of htmlFiles(root)) {
    const html = fs.readFileSync(f, "utf8");
    for (const m of html.matchAll(/play\.google\.com\/store\/apps\/details\?id=([\w.]+)/g))
      if (m[1] !== "com.tileiqpro.android") bad.push(`${path.relative(root, f)}: ${m[1]}`);
    for (const m of html.matchAll(/apps\.apple\.com\/[^"'\s]*?\/id(\d+)/g))
      if (m[1] !== "6787447373") bad.push(`${path.relative(root, f)}: App Store id${m[1]}`);
  }
  expect(bad).toEqual([]);
});
