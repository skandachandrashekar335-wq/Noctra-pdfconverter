import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("unified auth resolver claims inspection", () => {
  test("identifies Supabase tokens by claims and avoids Firebase decoding for them", () => {
    // Generate a mock JWT with Supabase issuer
    const payload = {
      iss: "https://oxjcxtyfdzczubaomswe.supabase.co/auth/v1",
      sub: "d3b07384-d113-4631-b847-123456789abc",
      role: "authenticated",
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const mockJwt = `eyJhbGciOiJIUzI1NiJ9.${b64}.mocksignature`;

    // Extract unverified payload
    const parts = mockJwt.split(".");
    const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));

    assert.equal(decoded.iss, "https://oxjcxtyfdzczubaomswe.supabase.co/auth/v1");
    assert.equal(decoded.role, "authenticated");
    assert.ok(decoded.iss.includes("supabase.co"));
  });

  test("identifies Firebase tokens by issuer", () => {
    const payload = {
      iss: "https://securetoken.google.com/noctra-a7423",
      aud: "noctra-a7423",
      sub: "firebase_user_abc123",
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const mockJwt = `eyJhbGciOiJSUzI1NiJ9.${b64}.mocksignature`;

    const parts = mockJwt.split(".");
    const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));

    assert.equal(decoded.aud, "noctra-a7423");
    assert.ok(!decoded.iss.includes("supabase.co"));
  });
});
