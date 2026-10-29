// GET  /api/history        — list the signed-in user's conversion history
// POST /api/history        — create a history record owned by the caller
//
// Identity comes from the verified Firebase ID token in the Authorization
// header. The UID is never read from the request body, so a caller cannot
// create or read another user's records by supplying a different UID.
//
// Node.js runtime: `firebase-admin` and the Supabase service-role client must
// never be bundled for the edge or the browser. `runtime` cannot be exported
// alongside `cacheComponents`, but Node is the default and this route has no
// edge-compatible dependency, so no config is needed.

import type { NextRequest } from "next/server";
import { verifyUnifiedToken } from "@/lib/server/auth-resolver";
import {
  createConversion,
  listConversions,
} from "@/lib/server/history-store";
import {
  handleCreate,
  handleList,
  type HistoryHandlers,
} from "@/lib/server/history-handlers";
import {
  checkRateLimit,
  applyRateLimitHeaders,
  rateLimitExceededResponse,
} from "@/lib/server/rate-limiter";

const handlers: HistoryHandlers = {
  verifyToken: verifyUnifiedToken,
  list: listConversions,
  create: createConversion,
  // Not reachable from this route; required to satisfy the shared contract.
  update: async () => null,
};

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "anonymous";
}

export async function GET(request: NextRequest) {
  const clientKey = `history:${getClientIdentifier(request)}`;
  const rateLimit = await checkRateLimit(clientKey, { limit: 120, windowSeconds: 60 });
  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit);
  }
  const response = await handleList(request, handlers);
  return applyRateLimitHeaders(response, rateLimit);
}

export async function POST(request: NextRequest) {
  const clientKey = `history:${getClientIdentifier(request)}`;
  const rateLimit = await checkRateLimit(clientKey, { limit: 60, windowSeconds: 60 });
  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit);
  }
  const response = await handleCreate(request, handlers);
  return applyRateLimitHeaders(response, rateLimit);
}

