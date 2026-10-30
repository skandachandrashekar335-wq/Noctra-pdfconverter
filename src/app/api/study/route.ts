import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyUnifiedToken } from "@/lib/server/auth-resolver";
import { authenticateRequest } from "@/lib/server/history-handlers";
import {
  StudyInputError,
  StudyProviderUnavailableError,
  StudyProviderError,
  StudyProviderRateLimitError,
  StudyProviderAuthError,
  StudyTimeoutError,
  studyConfigMessage,
  validateStudyRequest,
} from "@/lib/ai-study";
import { createFallbackEngine } from "@/lib/ai-provider-engine";
import {
  checkRateLimit,
  applyRateLimitHeaders,
  rateLimitExceededResponse,
} from "@/lib/server/rate-limiter";

export async function GET() {
  const engine = createFallbackEngine();
  return NextResponse.json({
    providers: engine.getProviderStatuses(),
  });
}

export async function POST(request: NextRequest) {
  let rateLimitKey: string;
  const authHeader = request.headers.get("authorization");

  if (authHeader) {
    const auth = await authenticateRequest(request, { verifyToken: verifyUnifiedToken });
    if (auth instanceof NextResponse) return auth;
    rateLimitKey = `study:user:${auth.uid}`;
  } else {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous-client";
    rateLimitKey = `study:guest:${ip}`;
  }

  // Enforce server-side rate limiting
  const rateLimit = await checkRateLimit(rateLimitKey, {
    limit: 20,
    windowSeconds: 60,
  });
  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    const res = NextResponse.json(
      { error: "Request body must be valid JSON.", code: "request/invalid" },
      { status: 400 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  if (body.consent !== true) {
    const res = NextResponse.json(
      {
        error: "Explicit consent is required before document text is sent to the configured study provider.",
        code: "study/consent-required",
      },
      { status: 400 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  try {
    const input = validateStudyRequest(body);
    const engine = createFallbackEngine();
    const result = await engine.generate(input);
    const res = NextResponse.json(result);
    return applyRateLimitHeaders(res, rateLimit);
  } catch (error) {
    if (error instanceof StudyInputError) {
      const res = NextResponse.json(
        { error: error.message, code: "request/invalid" },
        { status: 400 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }
    if (error instanceof StudyProviderUnavailableError) {
      const res = NextResponse.json(
        { error: error.message || studyConfigMessage(), code: "study/not-configured" },
        { status: 503 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }
    if (error instanceof StudyProviderRateLimitError) {
      const res = NextResponse.json(
        { error: error.message, code: error.code },
        { status: 429 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }
    if (error instanceof StudyProviderAuthError) {
      const res = NextResponse.json(
        { error: error.message, code: error.code },
        { status: 503 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }
    if (error instanceof StudyTimeoutError) {
      const res = NextResponse.json(
        { error: error.message, code: error.code },
        { status: 504 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }
    if (error instanceof StudyProviderError) {
      const res = NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }

    console.error("Noctra study provider failure", {
      code: "study/provider-error",
      error: error instanceof Error ? error.message : String(error),
    });

    const res = NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The study provider could not complete this request.",
        code: "study/provider-error",
      },
      { status: 502 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }
}

