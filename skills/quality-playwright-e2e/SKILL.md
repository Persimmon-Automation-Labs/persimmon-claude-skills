---
name: quality-playwright-e2e
description: Automated end-to-end testing for Persimmon Next.js 16 apps using Playwright against a deployed or preview site (Railway). Covers HTTP/console-error pre-flight, NextAuth login flows, Server Action form submission and revalidation, presigned-URL uploads, RAG query flows, responsive breakpoints, Core Web Vitals, and axe accessibility — via the Playwright MCP plugin or @playwright/test in the repo. Use after deploy, before a demo, or to wire repeatable E2E into CI. Trigger keywords — e2e, playwright, end-to-end, test the deployed site, verify the deployment, browser test, smoke test.
---

# Playwright E2E — Persimmon Patterns

Automated end-to-end tests against a **deployed or preview** Persimmon app. Two ways to run:

- **Playwright MCP plugin** — drive a live URL with `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill_form`, `browser_evaluate`, `browser_network_requests`. No repo setup; load tools via `ToolSearch` ("+playwright navigate"). Best for ad-hoc verification of a deployed site.
- **`@playwright/test` in the repo** — committed specs under `e2e/`, run in `infra-github-ci`. Best for repeatable regression gates.

Complements `quality-testing-validation` (manual checklists) by automating its flows. Stays in lane: this verifies user-facing behavior on a running site, not code internals (those → `quality-review-*`).

## Trigger

After a deploy / sprint, before a client demo, or "run e2e", "test the deployed site", "verify the deployment", "smoke test".

## Targets & Inputs

- `BASE_URL` — preview (`https://*.up.railway.app`) or prod (`https://sistema.piccino.com.br`). Prefer a **preview** env so tests never mutate client prod data.
- Test credentials for a non-privileged seeded account (never real client logins).
- Never run destructive mutations against production.

## Next 16 specifics that bite E2E

- **Server Actions** post to the same URL with no separate JSON endpoint — assert on the **resulting UI / redirect / revalidated list**, not a fetch response.
- **`force-dynamic` pages** render at request time — wait for content, not just `domcontentloaded`.
- **NextAuth v5 behind Railway** — login should land on the custom domain; a bounce to `*.up.railway.app` means `trustHost`/`x-forwarded-host` is misconfigured (`security-nextauth`).
- **Presigned uploads** — the browser PUTs straight to the bucket; assert the bucket request succeeds (CORS), not a Next route.

## @playwright/test scaffold (repo mode)

```bash
npm i -D @playwright/test @axe-core/playwright && npx playwright install --with-deps chromium
```

```ts
// playwright.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", trace: "on-first-retry" },
  retries: process.env.CI ? 2 : 0,
});
```

## 1. Pre-flight — status + console errors

```ts
// e2e/preflight.spec.ts
import { test, expect } from "@playwright/test";
const routes = ["/", "/login", "/processes", "/dashboard"];
for (const path of routes) {
  test(`200 + no console errors: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const res = await page.goto(path, { waitUntil: "networkidle" });
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    expect(errors, `${path} console`).toEqual([]);
  });
}
```

MCP equivalent: `browser_navigate` each route, then `browser_console_messages` and `browser_network_requests` to confirm 2xx + no errors.

## 2. NextAuth login flow

```ts
test("login redirects to dashboard on custom domain", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(process.env.E2E_USER!);
  await page.getByLabel(/password/i).fill(process.env.E2E_PASS!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/);
  expect(page.url()).not.toContain("up.railway.app"); // trustHost / x-forwarded-host sanity
});

test("protected route bounces anonymous user to login", async ({ page }) => {
  await page.goto("/processes");
  await page.waitForURL(/\/login/);
});
```

Reuse auth across specs with a stored state:

```ts
// e2e/auth.setup.ts → projects: [{ name:"setup", testMatch:/auth.setup/ }, { use:{ storageState:"e2e/.auth/user.json" }, dependencies:["setup"] }]
```

## 3. Server Action form — submit + revalidation

Assert on the resulting UI, not a network response:

```ts
test("create process persists and revalidates the list", async ({ page }) => {
  await page.goto("/processes/new");
  await page.getByLabel(/title/i).fill("E2E Test Process");
  await page.getByRole("button", { name: /create/i }).click();
  await page.waitForURL(/\/processes/);
  await expect(page.getByText("E2E Test Process")).toBeVisible(); // revalidatePath worked
});

test("Zod rejects empty required field", async ({ page }) => {
  await page.goto("/processes/new");
  await page.getByRole("button", { name: /create/i }).click();
  await expect(page.getByText(/required/i)).toBeVisible(); // stayed on form, error shown
});
```

## 4. Presigned-URL upload (S3/Tigris)

```ts
test("file uploads directly to bucket", async ({ page }) => {
  await page.goto("/documents");
  const reqs: string[] = [];
  page.on("request", (r) => r.method() === "PUT" && reqs.push(new URL(r.url()).host));
  await page.getByLabel(/upload/i).setInputFiles("e2e/fixtures/sample.pdf");
  await expect(page.getByText(/sample\.pdf/)).toBeVisible({ timeout: 15000 });
  expect(reqs.some((h) => h.includes("tigris") || h.includes("r2") || h.includes("s3")), "PUT went to bucket, not Next").toBeTruthy();
});
```

A failed PUT with no server log usually = bucket CORS missing the current origin.

## 5. RAG query flow + persistence

```ts
test("query returns an answer and persists across reload", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("textbox").fill("Summarize the latest filing");
  await page.getByRole("button", { name: /send/i }).click();
  const answer = page.getByTestId("answer").first();
  await expect(answer).toBeVisible({ timeout: 30000 });
  const text = await answer.innerText();
  await page.reload();
  await expect(page.getByText(text.slice(0, 40))).toBeVisible(); // read from DB, not regenerated
});
```

## 6. Responsive breakpoints

```ts
for (const vp of [{ w: 375, h: 812 }, { w: 768, h: 1024 }, { w: 1024, h: 768 }, { w: 1440, h: 900 }]) {
  test(`no horizontal overflow @ ${vp.w}px`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `overflow @ ${vp.w}`).toBeFalsy();
  });
}
```

## 7. Core Web Vitals

```ts
test("LCP under budget", async ({ page }) => {
  await page.goto("/", { waitUntil: "networkidle" });
  const lcp = await page.evaluate(() => new Promise<number>((resolve) => {
    new PerformanceObserver((l) => { const e = l.getEntries(); resolve(e[e.length - 1]?.startTime ?? 0); })
      .observe({ type: "largest-contentful-paint", buffered: true });
    setTimeout(() => resolve(-1), 5000);
  }));
  expect(lcp, `LCP ${Math.round(lcp)}ms`).toBeLessThan(2500);
});
```

Deep perf analysis (bundle, RSC boundaries, Lighthouse) → `quality-review-performance`. This is a smoke budget only.

## 8. Accessibility via axe

```ts
import AxeBuilder from "@axe-core/playwright";
test("home has no serious a11y violations", async ({ page }) => {
  await page.goto("/");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  const serious = violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
});
```

## CI wiring

Add to `infra-github-ci` against a **preview** deployment (never client prod):

```yaml
- run: npx playwright install --with-deps chromium
- run: npx playwright test
  env: { BASE_URL: ${{ steps.preview.outputs.url }}, E2E_USER: ${{ secrets.E2E_USER }}, E2E_PASS: ${{ secrets.E2E_PASS }} }
```

## One-Screen Summary

1. **Run against preview, not prod** — non-privileged seeded creds; no destructive mutations on client data.
2. **Pre-flight** every route: <400 status + zero console errors.
3. **Auth**: login lands on the custom domain (not `*.up.railway.app`); anon hits redirect.
4. **Server Actions**: assert resulting UI / revalidated list, not a fetch response; Zod errors keep you on the form.
5. **Uploads**: PUT goes to the bucket host; **RAG**: answer persists across reload.
6. **375/768/1024/1440** no overflow; **LCP < 2500ms** smoke; **axe** zero serious/critical.
7. Commit as `@playwright/test` specs and run in CI against the preview URL.

## When NOT to use

- Unit-testing pure functions — use Vitest/Jest.
- Deep perf/bundle analysis — `quality-review-performance`.
- Security/injection auditing — `security-review`.
- Code-internal review (N+1, types, prompt hygiene) — `quality-review-*`.

## Anti-patterns banned

- Running E2E against client **production** with live data.
- Using real client/admin credentials in tests.
- Waiting on a Server Action's network response instead of asserting the revalidated UI.
- Asserting upload "worked" without confirming the PUT hit the bucket (misses CORS failures).
- Checking AI output once without reloading to prove it persisted.
- Hard-coded `waitForTimeout` as the only sync — wait for elements/URLs, reserve timeouts for slow AI calls only.
