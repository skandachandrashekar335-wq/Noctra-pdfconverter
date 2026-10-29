import type { NextRequest } from "next/server";
import { verifyUnifiedToken } from "@/lib/server/auth-resolver";
import { createReaderAnnotation, getReaderState, upsertReaderPreferences } from "@/lib/server/reader-store";
import { handleReaderGet, handleReaderWrite, type ReaderHandlers } from "@/lib/server/reader-handlers";
import {
  checkRateLimit,
  applyRateLimitHeaders,
  rateLimitExceededResponse,
} from "@/lib/server/rate-limiter";

const handlers: ReaderHandlers = {
  verifyToken: verifyUnifiedToken,
  state: getReaderState,
  savePreferences: upsertReaderPreferences,
  createAnnotation: createReaderAnnotation,
  deleteAnnotation: async () => false,
};

function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "anonymous";
}

export async function GET(request: NextRequest) {
  const clientKey = `reader:${getClientIdentifier(request)}`;
  const rateLimit = await checkRateLimit(clientKey, { limit: 120, windowSeconds: 60 });
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);
  const response = await handleReaderGet(request, handlers);
  return applyRateLimitHeaders(response, rateLimit);
}

export async function POST(request: NextRequest) {
  const clientKey = `reader:${getClientIdentifier(request)}`;
  const rateLimit = await checkRateLimit(clientKey, { limit: 60, windowSeconds: 60 });
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);
  const response = await handleReaderWrite(request, handlers);
  return applyRateLimitHeaders(response, rateLimit);
}

export async function PUT(request: NextRequest) {
  const clientKey = `reader:${getClientIdentifier(request)}`;
  const rateLimit = await checkRateLimit(clientKey, { limit: 60, windowSeconds: 60 });
  if (!rateLimit.success) return rateLimitExceededResponse(rateLimit);
  const response = await handleReaderWrite(request, handlers);
  return applyRateLimitHeaders(response, rateLimit);
}

