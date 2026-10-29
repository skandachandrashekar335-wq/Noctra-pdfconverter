import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextResponse } from "next/server";
import {
  checkRateLimit,
  applyRateLimitHeaders,
  rateLimitExceededResponse,
} from "../src/lib/server/rate-limiter.ts";

describe("server-side rate limiter", () => {
  test("allows requests within quota and returns accurate remaining count", async () => {
    const key = `test_rate_${Date.now()}_allowed`;
    const res1 = await checkRateLimit(key, { limit: 5, windowSeconds: 10 });
    assert.equal(res1.success, true);
    assert.equal(res1.limit, 5);
    assert.equal(res1.remaining, 4);

    const res2 = await checkRateLimit(key, { limit: 5, windowSeconds: 10 });
    assert.equal(res2.success, true);
    assert.equal(res2.remaining, 3);
  });

  test("throttles requests that exceed quota with Retry-After", async () => {
    const key = `test_rate_${Date.now()}_exceeded`;
    const options = { limit: 2, windowSeconds: 5 };

    const first = await checkRateLimit(key, options);
    assert.equal(first.success, true);

    const second = await checkRateLimit(key, options);
    assert.equal(second.success, true);

    const third = await checkRateLimit(key, options);
    assert.equal(third.success, false);
    assert.equal(third.remaining, 0);
    assert.ok(third.retryAfter > 0);
  });

  test("applies standard IETF rate-limit headers to responses", () => {
    const initial = NextResponse.json({ ok: true });
    const result = {
      success: true,
      limit: 100,
      remaining: 99,
      resetAt: 1700000000,
      retryAfter: 0,
    };
    const decorated = applyRateLimitHeaders(initial, result);
    assert.equal(decorated.headers.get("RateLimit-Limit"), "100");
    assert.equal(decorated.headers.get("RateLimit-Remaining"), "99");
    assert.equal(decorated.headers.get("RateLimit-Reset"), "1700000000");
    assert.equal(decorated.headers.get("Retry-After"), null);
  });

  test("rateLimitExceededResponse creates a 429 response with Retry-After header", () => {
    const result = {
      success: false,
      limit: 10,
      remaining: 0,
      resetAt: 1700000060,
      retryAfter: 45,
    };
    const response = rateLimitExceededResponse(result);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("RateLimit-Limit"), "10");
    assert.equal(response.headers.get("RateLimit-Remaining"), "0");
    assert.equal(response.headers.get("Retry-After"), "45");
  });
});
