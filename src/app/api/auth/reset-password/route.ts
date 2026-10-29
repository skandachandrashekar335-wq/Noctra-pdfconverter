import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "@/lib/supabase-config";
import { extractBearerToken } from "@/lib/auth-token";
import { validatePassword } from "@/lib/validation";
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
  const rateLimit = await checkRateLimit(`auth_reset:${ip}`, {
    limit: 5,
    windowSeconds: 900,
  });
  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit);
  }

  const tokenParsed = extractBearerToken(request.headers.get("authorization"));
  if (!tokenParsed.ok) {
    const res = NextResponse.json(
      { error: "A valid reset authorization token is required.", code: "auth/missing-token" },
      { status: 401 }
    );
    return applyRateLimitHeaders(res, rateLimit);
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

  const passwordValidation = validatePassword(body.password);
  if (!passwordValidation.valid) {
    const res = NextResponse.json(
      { error: passwordValidation.error, code: "auth/invalid-password" },
      { status: 400 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  const config = readSupabaseServerConfig();
  if (!config) {
    const res = NextResponse.json(
      { error: "Authentication service unavailable.", code: "auth/service-unavailable" },
      { status: 503 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  try {
    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify recovery token
    const { data: userData, error: userError } = await supabase.auth.getUser(
      tokenParsed.token
    );
    if (userError || !userData?.user) {
      const res = NextResponse.json(
        { error: "The password reset token is invalid or has expired.", code: "auth/expired-token" },
        { status: 401 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userData.user.id,
      { password: body.password as string }
    );

    if (updateError) {
      const res = NextResponse.json(
        { error: "Could not update password. Please try again.", code: "auth/update-failed" },
        { status: 400 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }

    const res = NextResponse.json({
      message: "Password updated successfully. You can now sign in with your new password.",
    });
    return applyRateLimitHeaders(res, rateLimit);
  } catch (err) {
    console.error("Password reset failure:", err);
    const res = NextResponse.json(
      { error: "Failed to reset password. Please try again.", code: "auth/internal-error" },
      { status: 500 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }
}
