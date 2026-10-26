import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildUserProfile,
  canAccessConversion,
} from "../src/lib/access-control.ts";

describe("buildUserProfile", () => {
  test("copies only whitelisted fields", () => {
    const input = {
      uid: "u123",
      displayName: "Ada",
      email: "ada@example.com",
      photoURL: "https://example.com/a.png",
      // Extra fields some auth providers attach — must NOT reach Firestore
      accessToken: "secret-token",
      providerData: [{ providerId: "google.com" }],
      stsTokenManager: { refreshToken: "rt" },
    };

    const profile = buildUserProfile(input, 1700000000000);

    assert.deepEqual(profile, {
      uid: "u123",
      displayName: "Ada",
      email: "ada@example.com",
      photoURL: "https://example.com/a.png",
      createdAt: 1700000000000,
    });
    assert.ok(!("accessToken" in profile));
    assert.ok(!("providerData" in profile));
    assert.ok(!("stsTokenManager" in profile));
  });

  test("keeps null provider fields as null (no undefined written)", () => {
    const profile = buildUserProfile(
      { uid: "u1", displayName: null, email: null, photoURL: null },
      42
    );
    assert.equal(profile.displayName, null);
    assert.equal(profile.email, null);
    assert.equal(profile.photoURL, null);
    assert.equal(profile.createdAt, 42);
  });

  test("throws when uid is missing", () => {
    assert.throws(() =>
      buildUserProfile({
        uid: "",
        displayName: null,
        email: null,
        photoURL: null,
      })
    );
  });
});

describe("canAccessConversion (data isolation)", () => {
  const doc = { userId: "owner-uid" };

  test("owner can access", () => {
    assert.equal(canAccessConversion(doc, "owner-uid"), true);
  });

  test("another user cannot access", () => {
    assert.equal(canAccessConversion(doc, "someone-else"), false);
  });

  test("unauthenticated user cannot access", () => {
    assert.equal(canAccessConversion(doc, null), false);
    assert.equal(canAccessConversion(doc, undefined), false);
    assert.equal(canAccessConversion(doc, ""), false);
  });

  test("malformed documents are denied", () => {
    assert.equal(canAccessConversion(null, "owner-uid"), false);
    assert.equal(canAccessConversion(undefined, "owner-uid"), false);
    assert.equal(canAccessConversion({}, "owner-uid"), false);
    assert.equal(canAccessConversion({ userId: 42 } as never, "owner-uid"), false);
  });
});
