// PATCH /api/history/[id] — update a history record the caller owns.
//
// Ownership is enforced in the query itself (`eq user_uid`), so patching a
// record that belongs to someone else returns 404 — indistinguishable from a
// record that does not exist, which avoids leaking the existence of other
// users' rows.
//
// Runs on the default Node.js runtime; `runtime` cannot be exported alongside
// `cacheComponents`, and nothing here is edge-compatible anyway.

import type { NextRequest } from "next/server";
import { verifyUnifiedToken } from "@/lib/server/auth-resolver";
import { deleteConversion, updateConversion } from "@/lib/server/history-store";
import {
  handleDelete,
  handleUpdate,
  type HistoryHandlers,
} from "@/lib/server/history-handlers";
import {
  checkRateLimit,
  applyRateLimitHeaders,
  rateLimitExceededResponse,
} from "@/lib/server/rate-limiter";

const handlers: HistoryHandlers = {
  verifyToken: verifyUnifiedToken,
  // Not reachable from this route; required to satisfy the shared contract.
  list: async () => [],
  create: async () => {
    throw new Error("create() is not reachable from PATCH /api/history/[id]");
  },
  update: updateConversion,
  remove: deleteConversion,
};

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "anonymous";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const clientKey = `history_mod:${getClientIdentifier(request)}`;
  const rateLimit = await checkRateLimit(clientKey, { limit: 60, windowSeconds: 60 });
  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit);
  }
  const { id } = await params;
  const response = await handleUpdate(request, handlers, id);
  return applyRateLimitHeaders(response, rateLimit);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const clientKey = `history_mod:${getClientIdentifier(request)}`;
  const rateLimit = await checkRateLimit(clientKey, { limit: 60, windowSeconds: 60 });
  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit);
  }
  const { id } = await params;
  const response = await handleDelete(request, handlers, id);
  return applyRateLimitHeaders(response, rateLimit);
}

