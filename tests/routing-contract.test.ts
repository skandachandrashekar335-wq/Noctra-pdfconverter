import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const landingSource = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");
const dashboardSource = readFileSync(
  resolve(ROOT, "src/app/dashboard/page.tsx"),
  "utf8"
);
const authGuardSource = readFileSync(
  resolve(ROOT, "src/components/AuthGuard.tsx"),
  "utf8"
);

describe("App Router route contracts", () => {
  test("the root route remains a public landing page", () => {
    assert.match(landingSource, /export default function LandingPage/);
    assert.doesNotMatch(
      landingSource,
      /if \(!loading && !user[\s\S]{0,160}router\.(push|replace)\(["']\/dashboard["']\)/
    );
    assert.match(
      landingSource,
      /if \(authRedirectPending && user\) router\.push\("\/dashboard"\)/
    );
  });

  test("the dashboard keeps its authentication guard", () => {
    assert.match(dashboardSource, /<AuthGuard>/);
    assert.match(authGuardSource, /if \(!loading && !user && !configError\)/);
    assert.match(authGuardSource, /router\.replace\(["']\/["']\)/);
  });
});
