import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getLandingCtaMode } from "../src/lib/landing-cta.ts";

const ROOT = resolve(import.meta.dirname, "..");
const landingSource = readFileSync(resolve(ROOT, "src/app/page.tsx"), "utf8");
const authButtonSource = readFileSync(
  resolve(ROOT, "src/components/GoogleSignInButton.tsx"),
  "utf8"
);
const authHookSource = readFileSync(
  resolve(ROOT, "src/hooks/useAuth.tsx"),
  "utf8"
);

describe("landing CTA session state", () => {
  test("auth loading wins over either user value", () => {
    assert.equal(getLandingCtaMode(true, false), "resolving-session");
    assert.equal(getLandingCtaMode(true, true), "resolving-session");
  });

  test("an authenticated visitor gets a dashboard action", () => {
    assert.equal(getLandingCtaMode(false, true), "authenticated");
    assert.match(landingSource, /<Link href="\/dashboard" className="pill-cta">/);
    assert.match(landingSource, /Get started/);
  });

  test("an unauthenticated visitor gets the existing Google sign-in action", () => {
    assert.equal(getLandingCtaMode(false, false), "unauthenticated");
    assert.match(
      landingSource,
      /<GoogleSignInButton[\s\S]*?label="Get started"/
    );
    assert.doesNotMatch(
      landingSource,
      /<a href="#hero-cta" className="pill-cta">\s*Get started/
    );
  });

  test("successful sign-in waits for the observed user before navigating", () => {
    assert.match(landingSource, /if \(authRedirectPending && user\) router\.push\("\/dashboard"\)/);
    assert.match(authButtonSource, /const started = await signInWithGoogle\(\)/);
    assert.match(authButtonSource, /if \(started\) onSuccess\?\.\(\)/);
  });

  test("duplicate popup submissions are guarded at the auth provider and button", () => {
    assert.match(authHookSource, /if \(signInInFlight\.current\) return false/);
    assert.match(authHookSource, /signInInFlight\.current = true/);
    assert.match(authButtonSource, /if \(busy\) return/);
    assert.match(authButtonSource, /disabled=\{busy \|\| Boolean\(configError\)\}/);
  });
});

describe("landing CTA audit", () => {
  test("navigation CTAs use real routes or existing section targets", () => {
    assert.doesNotMatch(landingSource, /href=["']#["']/);
    assert.match(landingSource, /href: "#philosophy"/);
    assert.match(landingSource, /href: "#showcase"/);
    assert.match(landingSource, /href: "#features"/);
    assert.match(
      landingSource,
      /href=\{f\.href \?\? \(signedIn \? "\/dashboard" : "#hero-cta"\)\}/
    );
  });

  test("the landing page remains public and does not redirect itself", () => {
    assert.match(landingSource, /export default function LandingPage/);
    assert.match(
      landingSource,
      /if \(authRedirectPending && user\) router\.push\("\/dashboard"\)/
    );
    assert.doesNotMatch(landingSource, /if \(!user\)[\s\S]{0,120}router\.replace/);
  });
});
