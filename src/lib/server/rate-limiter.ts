/**
 * Noctra Server-Side Rate Limiter.
 *
 * Designed for serverless environments (e.g. Vercel). Uses a durable Supabase
 * table (`public.api_rate_limits`) where available, with a resilient in-memory
 * sliding window fallback if the table is unavailable or during cold starts.
 *
 * Implements IETF draft standard rate-limiting headers:
 * - RateLimit-Limit
 * - RateLimit-Remaining
 * - RateLimit-Reset
 * - Retry-After (when throttled)
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "@/lib/supabase-config";

export interface RateLimitOptions {
  /** Maximum allowed requests within the time window. */
  limit: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp in seconds
  retryAfter: number; // Seconds until quota resets
}

// In-memory fallback cache across warm invocations
interface MemoryBucket {
  count: number;
  resetAtMs: number;
}
const memoryCache = new Map<string, MemoryBucket>();

// Periodic memory cleanup (runs during warm invocations)
function cleanupMemoryCache(): void {
  const now = Date.now();
  for (const [key, bucket] of memoryCache.entries()) {
    if (bucket.resetAtMs <= now) {
      memoryCache.delete(key);
    }
  }
}

let cachedClient: SupabaseClient | null = null;
function getDbClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;
  const config = readSupabaseServerConfig();
  if (!config) return null;
  cachedClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function checkMemoryLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  cleanupMemoryCache();
  const nowMs = Date.now();
  const existing = memoryCache.get(key);

  if (!existing || existing.resetAtMs <= nowMs) {
    const resetAtMs = nowMs + windowSeconds * 1000;
    memoryCache.set(key, { count: 1, resetAtMs });
    return {
      success: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt: Math.ceil(resetAtMs / 1000),
      retryAfter: 0,
    };
  }

  existing.count += 1;
  const remaining = Math.max(0, limit - existing.count);
  const resetAt = Math.ceil(existing.resetAtMs / 1000);
  const retryAfter = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));
  const success = existing.count <= limit;

  return {
    success,
    limit,
    remaining,
    resetAt,
    retryAfter: success ? 0 : retryAfter,
  };
}

/**
 * Check and increment rate limit for a specific key (e.g. `ip:1.2.3.4` or `uid:xyz`).
 */
export async function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = options;
  const now = new Date();
  const nowMs = now.getTime();
  const db = getDbClient();

  if (!db) {
    return checkMemoryLimit(key, limit, windowSeconds);
  }

  try {
    const { data: record, error: fetchErr } = await db
      .from("api_rate_limits")
      .select("count, reset_at")
      .eq("key", key)
      .maybeSingle();

    if (fetchErr) {
      // If table does not exist (PGRST205) or query fails, fall back to memory
      return checkMemoryLimit(key, limit, windowSeconds);
    }

    if (!record || new Date(record.reset_at).getTime() <= nowMs) {
      // Expired or new window
      const newResetAt = new Date(nowMs + windowSeconds * 1000).toISOString();
      await db
        .from("api_rate_limits")
        .upsert({ key, count: 1, reset_at: newResetAt }, { onConflict: "key" });

      return {
        success: true,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt: Math.ceil((nowMs + windowSeconds * 1000) / 1000),
        retryAfter: 0,
      };
    }

    // Active window
    const newCount = (record.count || 0) + 1;
    const resetAtMs = new Date(record.reset_at).getTime();
    const retryAfter = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));
    const resetAt = Math.ceil(resetAtMs / 1000);

    await db
      .from("api_rate_limits")
      .update({ count: newCount })
      .eq("key", key);

    const success = newCount <= limit;
    const remaining = Math.max(0, limit - newCount);

    return {
      success,
      limit,
      remaining,
      resetAt,
      retryAfter: success ? 0 : retryAfter,
    };
  } catch {
    // Resilient fallback to memory on any database error
    return checkMemoryLimit(key, limit, windowSeconds);
  }
}

/**
 * Decorate an existing response with standard RateLimit headers.
 */
export function applyRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set("RateLimit-Limit", String(result.limit));
  response.headers.set("RateLimit-Remaining", String(result.remaining));
  response.headers.set("RateLimit-Reset", String(result.resetAt));
  if (!result.success) {
    response.headers.set("Retry-After", String(result.retryAfter));
  }
  return response;
}

/**
 * Create a standard 429 Too Many Requests response.
 */
export function rateLimitExceededResponse(result: RateLimitResult): NextResponse {
  const res = NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again.",
      code: "rate-limited",
      retryAfter: result.retryAfter,
    },
    { status: 429 }
  );
  return applyRateLimitHeaders(res, result);
}
