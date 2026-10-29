import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "@/lib/supabase-config";
import { validateEmail } from "@/lib/validation";
import {
  checkRateLimit,
  applyRateLimitHeaders,
  rateLimitExceededResponse,
} from "@/lib/server/rate-limiter";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "anonymous"
  );
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(`auth_forgot:${ip}`, {
    limit: 5,
    windowSeconds: 900, // 5 requests per 15 minutes
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

  const emailValidation = validateEmail(body.email);
  if (!emailValidation.valid) {
    const res = NextResponse.json(
      { error: emailValidation.error, code: "auth/invalid-email" },
      { status: 400 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  const config = readSupabaseServerConfig();
  if (!config) {
    const res = NextResponse.json(
      {
        error: "Password reset service is temporarily unavailable.",
        code: "auth/service-unavailable",
      },
      { status: 503 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  // Consistent message returned on all branches to prevent account enumeration
  const SAFE_RESPONSE = {
    message: "If an account exists with this email, a password reset link has been sent.",
  };

  try {
    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = (body.email as string).trim();
    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://noctra-pdfconverter.vercel.app";

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/reset-password`,
    });

    const res = NextResponse.json(SAFE_RESPONSE);
    return applyRateLimitHeaders(res, rateLimit);
  } catch (err) {
    console.error("Password reset error:", err);
    // Still return the generic safe message so attackers cannot probe valid emails
    const res = NextResponse.json(SAFE_RESPONSE);
    return applyRateLimitHeaders(res, rateLimit);
  }
}
