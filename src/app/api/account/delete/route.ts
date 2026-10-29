import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "@/lib/supabase-config";
import { authenticateRequest } from "@/lib/server/history-handlers";
import { verifyUnifiedToken } from "@/lib/server/auth-resolver";
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
  const rateLimit = await checkRateLimit(`account_delete:${ip}`, {
    limit: 5,
    windowSeconds: 900,
  });
  if (!rateLimit.success) {
    return rateLimitExceededResponse(rateLimit);
  }

  const auth = await authenticateRequest(request, {
    verifyToken: verifyUnifiedToken,
  });
  if (auth instanceof NextResponse) {
    return applyRateLimitHeaders(auth, rateLimit);
  }

  const uid = auth.uid;
  const config = readSupabaseServerConfig();
  if (!config) {
    const res = NextResponse.json(
      { error: "Account deletion service is unavailable.", code: "account/unavailable" },
      { status: 503 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }

  try {
    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. Try to invoke the dedicated delete_user_data procedure
    let rpcSuccess = false;
    try {
      const { error: rpcErr } = await supabase.rpc("delete_user_data", {
        target_uid: uid,
      });
      if (!rpcErr) rpcSuccess = true;
    } catch {
      rpcSuccess = false;
    }

    // 2. Direct fallback deletes if RPC is not installed
    if (!rpcSuccess) {
      await Promise.allSettled([
        supabase.from("conversions").delete().eq("user_uid", uid),
        supabase.from("reader_preferences").delete().eq("user_uid", uid),
        supabase.from("reader_annotations").delete().eq("user_uid", uid),
        supabase.from("user_consents").delete().eq("user_uid", uid),
        supabase.from("user_identities").delete().or(`supabase_uid.eq.${uid},firebase_uid.eq.${uid}`),
      ]);
    }

    // 3. Delete from Supabase Auth if UUID matches auth.users
    try {
      await supabase.auth.admin.deleteUser(uid);
    } catch {
      // Ignored if user is Firebase-only or already deleted
    }

    const res = NextResponse.json({
      success: true,
      message: "Account and associated data deleted successfully.",
    });

    // Clear session cookies
    res.cookies.set("noctra_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return applyRateLimitHeaders(res, rateLimit);
  } catch (err) {
    console.error("Account deletion error:", err);
    const res = NextResponse.json(
      { error: "Failed to delete account. Please try again.", code: "account/delete-failed" },
      { status: 500 }
    );
    return applyRateLimitHeaders(res, rateLimit);
  }
}
