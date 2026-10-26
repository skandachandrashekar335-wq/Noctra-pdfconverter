/**
 * Firebase ID-token request plumbing — pure helpers.
 *
 * Split out from the Admin SDK wrapper so the parts that decide *who is
 * calling* and *what status code a failure deserves* are unit testable with
 * `node --test` and no live credentials or network.
 *
 * No Firebase imports (only `import type`), so nothing here pulls the Admin
 * SDK into a test process.
 */

/** Everything a route needs in order to act as a specific, verified user. */
export interface VerifiedIdentity {
  /** The Firebase UID, taken from the verified token — never the body. */
  uid: string;
}

/** Why a request was rejected. Drives the HTTP status the route returns. */
export type AuthFailureReason =
  | "missing-token"
  | "malformed-header"
  | "invalid-token"
  | "expired-token"
  | "verification-unavailable"
  | "configuration-error";

/**
 * HTTP status for each failure mode.
 *
 * 401 for anything meaning "your credentials are absent, bad or expired" —
 * the client can react by signing in again. 503 for "we could not check"
 * (Admin SDK not configured, network blip): that is a server problem, and
 * telling the client its session was bad would be a lie.
 */
export function statusForAuthFailure(reason: AuthFailureReason): 401 | 503 {
  return reason === "verification-unavailable" || reason === "configuration-error"
    ? 503
    : 401;
}

/** Safe, user-facing message for each failure mode. Never echoes the token. */
export function authFailureMessage(reason: AuthFailureReason): string {
  switch (reason) {
    case "missing-token":
      return "Sign in to save or view your conversion history.";
    case "malformed-header":
    case "invalid-token":
      return "Your session could not be verified. Sign in again.";
    case "expired-token":
      return "Your session has expired. Sign in again.";
    case "verification-unavailable":
      // Deliberately vague about *which* dependency failed (Firebase
      // verification or Supabase) — the client doesn't need to know, and the
      // `code` field carries the precise reason for debugging.
      return "History is unavailable right now. Your conversions still work.";
    case "configuration-error":
      return "History is unavailable because server authentication is misconfigured. Your conversions still work.";
  }
}

/**
 * Pull the bearer token out of an `Authorization` header.
 *
 * Returns a discriminated result rather than throwing, so callers map it
 * straight onto a status code. Case-insensitive on the scheme, tolerant of
 * extra whitespace, and never logs or echoes the credential.
 */
export function extractBearerToken(
  authorization: string | null | undefined
):
  | { ok: true; token: string }
  | { ok: false; reason: Extract<AuthFailureReason, "missing-token" | "malformed-header"> } {
  if (authorization == null) return { ok: false, reason: "missing-token" };

  const trimmed = authorization.trim();
  if (trimmed.length === 0) return { ok: false, reason: "missing-token" };

  // `Bearer <token>` — exactly one space-separated token after the scheme.
  const match = /^Bearer[ \t]+(\S+)$/i.exec(trimmed);
  if (!match) return { ok: false, reason: "malformed-header" };

  return { ok: true, token: match[1] };
}

/**
 * Map a thrown `verifyIdToken()` error onto a failure reason.
 *
 * Firebase reports token problems as `auth/<code>` (see `FirebaseError.code`).
 * Matching on the code rather than the message keeps this correct across SDK
 * versions and locales — the same lesson that produced `lib/auth-errors.ts`
 * for the client side.
 *
 * The split matters because it decides whether we blame the *user* or the
 * *server*:
 *   - an `auth/*` code means the credential itself is bad → 401;
 *   - no code at all means we could not even check (service account missing,
 *     cert fetch failed, network error) → 503, because telling someone their
 *     session expired when our own credential is broken would be a lie, and
 *     re-signing in would not fix it.
 *
 * Either way the request is refused; this only decides the honest message.
 */
export function classifyTokenError(error: unknown): AuthFailureReason {
  const code =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
  const codeText = typeof code === "string" ? code : "";

  const message = error instanceof Error ? error.message : String(error);

  if (
    codeText === "app/invalid-credential" ||
    (codeText.length === 0 &&
      /service account|private key|project id|failed to determine/i.test(message))
  ) {
    return "configuration-error";
  }

  if (codeText.length === 0) {
    // No Firebase code: an infrastructure failure rather than a bad token.
    return "verification-unavailable";
  }

  if (!codeText.startsWith("auth/")) {
    return "verification-unavailable";
  }

  switch (codeText) {
    case "auth/id-token-expired":
      return "expired-token";
    case "auth/internal-error":
      // The Admin SDK could not reach Google's public certs.
      return "verification-unavailable";
    case "auth/id-token-revoked":
    // A token minted before a custom claim was set still verifies, but if the
    // underlying user is gone the SDK reports argument-error.
    case "auth/user-disabled":
    case "auth/argument-error":
    case "auth/invalid-id-token":
    case "auth/invalid-credential":
      return "invalid-token";
    default:
      return "invalid-token";
  }
}
