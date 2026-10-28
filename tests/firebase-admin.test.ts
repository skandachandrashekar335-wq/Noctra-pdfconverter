/**
 * Regression tests for Firebase Admin initialisation (fix 1).
 *
 * The defect: `initializeApp({ credential: undefined, projectId })` is
 * *rejected* by the Admin SDK — the `credential` key, when present at all,
 * must be a Credential instance. That exception was caught by the route
 * layer's auth handler and surfaced as a plain 401, which silently defeated
 * the documented fallback: verifying ID tokens with only a project ID (via
 * Google's public x509 certs) needs no private key.
 *
 * These tests cover both configuration paths — full service account, and
 * project-ID-only — and assert that token verification is never weakened:
 * a garbage token is still rejected in both.
 *
 * No real credentials appear here. The "present" path signs with a throwaway
 * RSA key generated in-memory for the test, and nothing is printed.
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { deleteApp, getApps } from "firebase-admin/app";

const ENV_KEYS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
] as const;

const savedEnv = new Map<string, string | undefined>();

function clearFirebaseEnv() {
  for (const key of ENV_KEYS) {
    if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
    delete process.env[key];
  }
}

async function resetAdminApps() {
  for (const app of getApps()) await deleteApp(app);
}

describe("firebase-admin initialisation", () => {
  before(async () => {
    clearFirebaseEnv();
    await resetAdminApps();
  });

  after(async () => {
    await resetAdminApps();
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  test("project-ID-only: initialises without a credential and still rejects a garbage token", async () => {
    clearFirebaseEnv();
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "noctra-test-project";
    await resetAdminApps();

    const { getAdminAuth, verifyIdToken } = await import("../src/lib/firebase-admin.ts");

    // Before the fix this threw: "The credential property must be an object
    // which implements the Credential interface."
    const auth = getAdminAuth();
    assert.equal(typeof auth.verifyIdToken, "function");

    // The app must not carry a *service-account* credential in this mode.
    // (The SDK attaches an ADC-style credential object of its own; what
    // matters is that no configured key was baked into it.)
    const app = getApps()[0];
    assert.ok(app, "an Admin app was initialised");
    const options = app.options as {
      credential?: Record<string, unknown>;
      projectId?: string;
    };
    assert.equal(options.projectId, "noctra-test-project");
    assert.ok(options.credential, "the SDK attaches its implicit credential");
    assert.equal(
      (options.credential as Record<string, unknown>).clientEmail,
      undefined,
      "no service-account credential may be attached"
    );
    assert.equal(
      (options.credential as Record<string, unknown>).privateKey,
      undefined,
      "no private key may be attached"
    );

    // Verification is not weakened: a garbage token is still refused.
    await assert.rejects(
      () => verifyIdToken("garbage-token"),
      (error: { code?: string }) => {
        assert.equal(error.code, "auth/argument-error");
        return true;
      }
    );
    await assert.rejects(() => auth.verifyIdToken(""));
  });

  test("service-account present: initialises with a credential and still rejects a garbage token", async () => {
    clearFirebaseEnv();
    // Throwaway key generated for this test only — never printed, never written.
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    process.env.FIREBASE_ADMIN_PROJECT_ID = "noctra-test-project";
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL =
      "probe@noctra-test-project.iam.gserviceaccount.com";
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = privateKey.export({
      type: "pkcs8",
      format: "pem",
    }).toString();
    await resetAdminApps();

    const { getAdminAuth, verifyIdToken } = await import("../src/lib/firebase-admin.ts");

    const auth = getAdminAuth();
    assert.equal(typeof auth.verifyIdToken, "function");

    const options = getApps()[0]!.options as {
      credential?: Record<string, unknown>;
    };
    const credential = options.credential;
    assert.ok(credential, "a Credential instance is attached when the key is configured");
    assert.equal(
      typeof (credential as { getAccessToken?: unknown }).getAccessToken,
      "function"
    );
    assert.equal(
      credential.clientEmail,
      "probe@noctra-test-project.iam.gserviceaccount.com",
      "the configured service account was baked into the credential"
    );
    assert.ok(credential.privateKey, "the private key backs the credential");

    // Verification behaves identically here: garbage is still refused.
    await assert.rejects(
      () => verifyIdToken("garbage-token"),
      (error: { code?: string }) => {
        assert.equal(error.code, "auth/argument-error");
        return true;
      }
    );
  });

  test("no project ID at all: fails with an actionable message, not an SDK cryptic", async () => {
    clearFirebaseEnv();
    await resetAdminApps();

    const { getAdminAuth } = await import("../src/lib/firebase-admin.ts");
    assert.throws(
      () => getAdminAuth(),
      (error: Error) => {
        assert.match(error.message, /FIREBASE_ADMIN_PROJECT_ID/);
        return true;
      }
    );
  });
});
