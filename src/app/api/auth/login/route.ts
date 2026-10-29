import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "@/lib/supabase-config";
import { validateEmail, validatePassword } from "@/lib/validation";
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
  const rateLimit = await checkRateLimit(`auth_login:${ip}`, {
    limit: 10,
    windowSeconds: 900, // 10 attempts per 15 minutes
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
      {
        error: "Authentication service is currently unavailable.",
        code: "auth/service-unavailable",
      },
      { status: 503 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  try {
    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: (body.email as string).trim(),
      password: body.password as string,
    });

    if (error || !data.user || !data.session) {
      // Safe generic message — never disclose if email exists or password was wrong
      const res = NextResponse.json(
        { error: "Invalid email or password.", code: "auth/invalid-credentials" },
        { status: 401 }
      );
      return applyRateLimitHeaders(res, rateLimit);
    }

    const displayName =
      (data.user.user_metadata?.full_name as string) ||
      data.user.email?.split("@")[0] ||
      "User";

    const res = NextResponse.json({
      user: {
        uid: data.user.id,
        email: data.user.email,
        displayName,
        photoURL: null,
      },
      token: data.session.access_token,
      expiresAt: data.session.expires_at,
    });

    // Set secure HTTP-only session cookie
    res.cookies.set("noctra_session", data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: "/",
    });

    return applyRateLimitHeaders(res, rateLimit);
  } catch (err) {
    console.error("Sign-in server error:", err);
    const res = NextResponse.json(
      { error: "An unexpected error occurred during sign-in.", code: "auth/internal-error" },
      { status: 500 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }
}
