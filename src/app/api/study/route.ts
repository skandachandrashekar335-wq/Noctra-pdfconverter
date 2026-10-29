import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifyUnifiedToken } from "@/lib/server/auth-resolver";
import { authenticateRequest } from "@/lib/server/history-handlers";
import {
  createStudyProvider,
  StudyInputError,
  StudyProviderUnavailableError,
  studyConfigMessage,
  validateStudyRequest,
} from "@/lib/ai-study";
import {
  checkRateLimit,
  applyRateLimitHeaders,
  rateLimitExceededResponse,
} from "@/lib/server/rate-limiter";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, { verifyToken: verifyUnifiedToken });
  if (auth instanceof NextResponse) return auth;

  // Enforce server-side rate limiting per user UID
  const rateLimit = await checkRateLimit(`study:${auth.uid}`, {
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
    const provider = createStudyProvider();
    if (!provider) throw new StudyProviderUnavailableError();
    const result = await provider.generate(input);
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
        { error: studyConfigMessage(), code: "study/not-configured" },
        { status: 503 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }
    console.error("Noctra study provider failure", { code: "study/provider-error" });
    const res = NextResponse.json(
      {
        error: "The study provider could not complete this request.",
        code: "study/provider-error",
      },
      { status: 502 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }
}

