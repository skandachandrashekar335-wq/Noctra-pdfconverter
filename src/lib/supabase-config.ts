/**
 * Supabase configuration — server-side only.
 *
 * Under this architecture the browser never talks to Supabase directly: the
 * Next.js route handlers verify the Firebase ID token and then act with a
 * server-only secret key. So there is deliberately NO `NEXT_PUBLIC_SUPABASE_*`
 * variable here — nothing Supabase-identifying is bundled into the client.
 *
 * No imports beyond this file's own types, so it is unit tested with
 * `node --test` and no live credentials.
 */

/** The server-only Supabase settings, as read from the environment. */
export interface SupabaseServerConfig {
  /** e.g. `https://abcdefgh.supabase.co` (no trailing slash). */
  url: string;
  /** Modern secret key preferred; legacy service-role key remains supported. */
  serviceRoleKey: string;
}

type SupabaseServerKeyName =
  | "SUPABASE_SECRET_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY";

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Prefer the modern secret key, with a legacy service-role fallback. */
export function supabaseServerKeyName(
  env: Record<string, string | undefined> = process.env
): SupabaseServerKeyName | null {
  if (hasValue(env.SUPABASE_SECRET_KEY)) return "SUPABASE_SECRET_KEY";
  if (hasValue(env.SUPABASE_SERVICE_ROLE_KEY)) return "SUPABASE_SERVICE_ROLE_KEY";
  return null;
}

/**
 * Returns the names of the server-only Supabase variables that are missing or
 * blank. Empty array means the integration is fully configured.
 */
export function missingSupabaseConfigKeys(
  env: Record<string, string | undefined> = process.env
): string[] {
  const missing: string[] = [];
  if (!hasValue(env.SUPABASE_URL)) missing.push("SUPABASE_URL");
  if (!supabaseServerKeyName(env)) {
    missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");
  }
  return missing;
}

/** Human-readable explanation of an incomplete config, else null. */
export function supabaseConfigErrorMessage(
  missingKeys: string[]
): string | null {
  if (missingKeys.length === 0) return null;
  return (
    "History storage is not configured. Missing environment variable" +
    (missingKeys.length === 1 ? ": " : "s: ") +
    missingKeys.join(", ") +
    ". Conversions still work — only the saved history is unavailable."
  );
}

/** True when both server-only Supabase variables are present. */
export function isSupabaseConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return missingSupabaseConfigKeys(env).length === 0;
}

/**
 * Validate and normalise the config. Returns `null` when incomplete so that
 * callers are forced to handle the unconfigured case explicitly instead of
 * handing a half-filled object to the SDK.
 */
export function readSupabaseServerConfig(
  env: Record<string, string | undefined> = process.env
): SupabaseServerConfig | null {
  if (!isSupabaseConfigured(env)) return null;
  const keyName = supabaseServerKeyName(env);
  if (!keyName) return null;
  return {
    // Trim a trailing slash so `${url}/rest/v1/...` never doubles up.
    url: (env.SUPABASE_URL as string).trim().replace(/\/+$/, ""),
    serviceRoleKey: env[keyName]!.trim(),
  };
}

/**
 * Guard against the single worst mistake this integration could make: shipping
 * a server key to the browser. Call this from any module that handles
 * the key so a mis-labelled env var fails loudly at startup rather than
 * silently exposing full database access.
 */
export function assertServerOnlyKey(name: string): void {
  if (name.startsWith("NEXT_PUBLIC_")) {
    throw new Error(
      `Refusing to use "${name}": NEXT_PUBLIC_ variables are bundled into the ` +
        "browser. The Supabase server key must stay server-side."
    );
  }
}
