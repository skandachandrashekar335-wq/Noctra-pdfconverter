import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  redactSensitiveString,
  sanitizeLogData,
  captureSafeError,
} from "../src/lib/error-monitoring.ts";

describe("error monitoring and sensitive data redaction", () => {
  test("redacts Bearer tokens from string", () => {
    const input = "Request failed with Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID";
    const redacted = redactSensitiveString(input);
    assert.ok(!redacted.includes("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"));
    assert.match(redacted, /\[REDACTED_TOKEN\]/);
  });

  test("redacts email addresses from error text", () => {
    const input = "Failed to process document for user student@university.edu on page 4";
    const redacted = redactSensitiveString(input);
    assert.ok(!redacted.includes("student@university.edu"));
    assert.match(redacted, /\[REDACTED_EMAIL\]/);
  });

  test("redacts filesystem paths containing personal usernames", () => {
    const macPath = "Error at /Users/john_doe/documents/test.pdf:12";
    const winPath = "Error at C:\\Users\\jane_smith\\documents\\test.pdf:12";

    assert.ok(!redactSensitiveString(macPath).includes("john_doe"));
    assert.ok(!redactSensitiveString(winPath).includes("jane_smith"));
    assert.match(redactSensitiveString(macPath), /\[REDACTED_USER\]/);
    assert.match(redactSensitiveString(winPath), /\[REDACTED_USER\]/);
  });

  test("redacts Google / Supabase API keys", () => {
    const googleKey = "AIzaSyD-1234567890abcdefghijklmnopqrstuv";
    assert.equal(redactSensitiveString(googleKey), "[REDACTED_API_KEY]");
  });

  test("recursively sanitizes complex log context objects", () => {
    const context = {
      user: {
        email: "alice@example.com",
        password: "secret_password_123",
      },
      headers: {
        authorization: "Bearer my-secret-token",
      },
      file: {
        name: "test.pdf",
        path: "/Users/alice/test.pdf",
      },
    };

    const sanitized = sanitizeLogData(context);
    assert.equal(sanitized.user.password, "[REDACTED]");
    assert.equal(sanitized.headers.authorization, "[REDACTED]");
    assert.ok(!JSON.stringify(sanitized).includes("alice@example.com"));
    assert.ok(!JSON.stringify(sanitized).includes("/Users/alice"));
  });

  test("captureSafeError sanitizes Error instances and preserves codes", () => {
    const err = new Error("Connection failed for user test@example.com at /Users/developer/app.ts");
    (err as { code?: string }).code = "ERR_NETWORK";

    const captured = captureSafeError(err);
    assert.equal(captured.code, "ERR_NETWORK");
    assert.ok(!captured.message.includes("test@example.com"));
    assert.ok(!captured.message.includes("developer"));
    assert.match(captured.message, /\[REDACTED_EMAIL\]/);
  });
});
