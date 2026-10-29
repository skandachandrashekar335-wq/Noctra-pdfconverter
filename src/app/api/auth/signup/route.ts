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
  const rateLimit = await checkRateLimit(`auth_signup:${ip}`, {
    limit: 10,
    windowSeconds: 3600, // 10 signups per hour per IP
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

    const email = (body.email as string).trim();
    const password = body.password as string;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      // Safe sanitization: don't reveal internal database details
      const msg = error.message.toLowerCase().includes("already registered")
        ? "An account with this email already exists or registration is pending."
        : "Failed to create account. Please check your credentials.";
      const res = NextResponse.json({ error: msg, code: "auth/signup-failed" }, { status: 400 });
      return applyRateLimitHeaders(res, rateLimit);
    }

    if (data.user) {
      // Record identity mapping if table exists
      try {
        await supabase.from("user_identities").upsert(
          {
            supabase_uid: data.user.id,
            email: data.user.email,
          },
          { onConflict: "supabase_uid" }
        );
      } catch {
        // Migration may be pending
      }
    }

    const res = NextResponse.json({
      message:
        "Account created successfully. Please check your inbox to verify your email, or sign in.",
      user: data.user
        ? {
            uid: data.user.id,
            email: data.user.email,
          }
        : null,
      session: data.session
        ? {
            token: data.session.access_token,
          }
        : null,
    });

    if (data.session) {
      res.cookies.set("noctra_session", data.session.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });
    }

    return applyRateLimitHeaders(res, rateLimit);
  } catch (err) {
    console.error("Sign-up server error:", err);
    const res = NextResponse.json(
      { error: "An unexpected error occurred during registration.", code: "auth/internal-error" },
      { status: 500 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }
}
