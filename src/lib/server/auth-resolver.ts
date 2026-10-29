/**
 * Noctra Unified Server Authentication Resolver.
 *
 * Supports both Supabase Auth and legacy Firebase Auth seamlessly:
 * 1. Inspects the incoming JWT payload claims.
 * 2. If issued by Supabase (`iss` contains `supabase.co`), verifies against Supabase Auth
 *    and maps to any existing legacy Firebase identity to preserve document ownership.
 * 3. Otherwise, verifies against Firebase Admin SDK.
 *
 * Retains strict server-side validation without leaking secrets to the client.
 */

import { createClient } from "@supabase/supabase-js";
import { readSupabaseServerConfig } from "@/lib/supabase-config";
import { verifyIdToken } from "@/lib/firebase-admin";

interface ParsedJwtClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  role?: string;
  email?: string;
}

function parseJwtClaimsUnverified(token: string): ParsedJwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = Buffer.from(parts[1], "base64").toString("utf8");
    return JSON.parse(json) as ParsedJwtClaims;
  } catch {
    return null;
  }
}

/**
 * Verifies an ID token from either Supabase Auth or Firebase Auth.
 * Returns the verified user identifier (UID) for query scoping.
 */
export async function verifyUnifiedToken(token: string): Promise<string> {
  const claims = parseJwtClaimsUnverified(token);

  // If token was issued by Supabase Auth:
  if (claims?.iss && claims.iss.includes("supabase.co")) {
    const config = readSupabaseServerConfig();
    if (!config) {
      throw new Error("Supabase is not configured on this server.");
    }

    const supabase = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      const err = new Error(error?.message || "Invalid Supabase session token.");
      (err as { code?: string }).code = "auth/invalid-token";
      throw err;
    }

    const supabaseUid = data.user.id;

    // Check if there is an existing mapped legacy Firebase UID to preserve document history
    try {
      const { data: mapping } = await supabase
        .from("user_identities")
        .select("firebase_uid")
        .eq("supabase_uid", supabaseUid)
        .maybeSingle();

      if (mapping?.firebase_uid) {
        return mapping.firebase_uid;
      }
    } catch {
      // If table not present yet, return supabase UID
    }

    return supabaseUid;
  }

  // Fallback / default: Verify with Firebase Admin
  return verifyIdToken(token);
}
