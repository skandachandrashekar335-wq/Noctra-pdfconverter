import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAuthError,
  extractAuthErrorCode,
  isSessionInvalidError,
} from "../src/lib/auth-errors.ts";

/** Shape of the FirebaseError the SDK actually throws. */
function firebaseError(code: string, message?: string): Error {
  const e = new Error(message ?? `Firebase: Error (${code}).`);
  (e as Error & { code: string }).code = code;
  return e;
}

describe("extractAuthErrorCode", () => {
  test("reads the code property from a FirebaseError", () => {
    assert.equal(
      extractAuthErrorCode(firebaseError("auth/popup-blocked")),
      "auth/popup-blocked"
    );
  });

  test("falls back to parsing the message when .code is absent", () => {
    const e = new Error("Firebase: Error (auth/network-request-failed).");
    assert.equal(extractAuthErrorCode(e), "auth/network-request-failed");
  });

  test("returns null for non-Firebase errors", () => {
    assert.equal(extractAuthErrorCode(new Error("boom")), null);
    assert.equal(extractAuthErrorCode(undefined), null);
    assert.equal(extractAuthErrorCode("just a string"), null);
  });
});

describe("classifyAuthError — popup cancellation is acknowledged", () => {
  test("user closing the popup gets a clear retry message", () => {
    const result = classifyAuthError(
      firebaseError("auth/popup-closed-by-user")
    );
    assert.equal(result.kind, "popup-cancelled");
    assert.equal(result.shouldStaySilent, false);
    assert.match(result.message, /cancelled/i);
  });

  test("a superseded popup request is also acknowledged", () => {
    const result = classifyAuthError(
      firebaseError("auth/cancelled-popup-request")
    );
    assert.equal(result.shouldStaySilent, false);
    assert.match(result.message, /try again/i);
  });

  test("cancellation classification works from the message alone", () => {
    const bare = new Error(
      "Firebase: Error (auth/popup-closed-by-user)."
    );
    assert.equal(classifyAuthError(bare).shouldStaySilent, false);
  });
});

describe("classifyAuthError — actionable messages", () => {
  test("blocked popup tells the user how to fix it", () => {
    const result = classifyAuthError(firebaseError("auth/popup-blocked"));
    assert.equal(result.kind, "popup-blocked");
    assert.equal(result.shouldStaySilent, false);
    assert.match(result.message, /popups/i);
  });

  test("disabled provider points at the Firebase console", () => {
    const result = classifyAuthError(
      firebaseError("auth/operation-not-allowed")
    );
    assert.equal(result.kind, "operation-not-allowed");
    assert.match(result.message, /Firebase console/i);
  });

  test("unauthorized domain points at the authorized-domains list", () => {
    const result = classifyAuthError(
      firebaseError("auth/unauthorized-domain")
    );
    assert.equal(result.kind, "unauthorized-domain");
    assert.match(result.message, /authorized domains/i);
  });

  test("rate limiting asks the user to wait", () => {
    const result = classifyAuthError(
      firebaseError("auth/too-many-requests")
    );
    assert.equal(result.kind, "too-many-requests");
    assert.match(result.message, /wait/i);
  });

  test("offline is reported as a network problem", () => {
    const result = classifyAuthError(
      firebaseError("auth/network-request-failed")
    );
    assert.equal(result.kind, "network");
  });
});

describe("classifyAuthError — never leaks raw SDK text", () => {
  test("unknown codes get a generic, safe message", () => {
    const result = classifyAuthError(
      firebaseError("auth/some-future-code", "Firebase: Error (auth/some-future-code).")
    );
    assert.equal(result.kind, "unknown");
    assert.equal(result.message, "Sign-in failed. Please try again.");
    assert.ok(!result.message.includes("Firebase:"));
  });

  test("non-Firebase throws are also sanitised", () => {
    const result = classifyAuthError(new Error("Cannot read property 'x' of undefined"));
    assert.equal(result.kind, "unknown");
    assert.equal(result.message, "Sign-in failed. Please try again.");
  });

  test("misconfigured API key reports internal-error", () => {
    const result = classifyAuthError(firebaseError("auth/invalid-api-key"));
    assert.equal(result.kind, "internal-error");
  });
});

describe("isSessionInvalidError", () => {
  test("flags expired tokens as requiring re-auth", () => {
    assert.equal(isSessionInvalidError(firebaseError("auth/user-token-expired")), true);
    assert.equal(isSessionInvalidError(firebaseError("auth/requires-recent-login")), true);
    assert.equal(isSessionInvalidError(firebaseError("auth/user-disabled")), true);
  });

  test("does not flag ordinary sign-in failures", () => {
    assert.equal(isSessionInvalidError(firebaseError("auth/popup-blocked")), false);
    assert.equal(isSessionInvalidError(firebaseError("auth/popup-closed-by-user")), false);
    assert.equal(isSessionInvalidError(null), false);
  });
});
