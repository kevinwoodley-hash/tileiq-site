import { test as base, expect } from "@playwright/test";

// Every test runs offline: requests to anything other than the local server are aborted
// (Google Analytics, PostHog, Supabase, fonts) unless a test routes them itself first.
// The cookie choice is pre-set to "denied" so the consent banner doesn't cover the page;
// tests that exercise the banner use `freshVisitor`.
export const test = base.extend({
  freshVisitor: [false, { option: true }],
  page: async ({ page, baseURL, freshVisitor }, use) => {
    await page.route(url => !url.href.startsWith(baseURL), route => route.abort());
    // /signup/ loads Supabase from a CDN; give it an inert stand-in so the page still runs.
    await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, route => route.fulfill({
      contentType: "text/javascript",
      body: "window.supabase = { createClient: () => ({ auth: { signUp: async () => ({ data: {}, error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({ insert: async () => ({}) }) }) };",
    }));
    if (!freshVisitor) {
      await page.addInitScript(() => {
        try { localStorage.setItem("tileiq-analytics-consent", "denied"); } catch (e) {}
      });
    }
    await use(page);
  },
});

export { expect };
