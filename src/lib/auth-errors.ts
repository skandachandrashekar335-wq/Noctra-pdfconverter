/**
 * Pure classification of Firebase Authentication errors.
 *
 * No Firebase SDK imports — it inspects the `code` field that every
 * `FirebaseError` carries (plus a couple of stable `name`s), so it is unit
 * tested with `node --test` and no live credentials.
 *
 * The sign-in button uses this to decide between:
 *   - showing a short cancellation acknowledgement, and
 *   - showing a specific, actionable failure message.
 * Matching on the raw `error.message` text is fragile — Firebase rewords
 * messages across SDK versions and localises them — so we always key off
 * `error.code`.
 */

export type AuthErrorKind =
  | "popup-cancelled" // user closed the popup — not an error, stay silent
  | "popup-blocked" // browser blocked the popup — needs an actionable hint
  | "operation-not-allowed" // Google provider disabled in the console
  | "unauthorized-domain" // domain missing from Authorized domains
  | "account-exists" // email already registered via another provider
  | "user-disabled" // account suspended
  | "too-many-requests" // rate limited
  | "network" // offline / request failed
  | "expired" // token/session no longer valid — re-auth needed
  | "internal-error" // misconfiguration (e.g. invalid API key)
  | "unknown";

export interface ClassifiedAuthError {
  kind: AuthErrorKind;
  /** Safe to render to the user. Never contains raw SDK internals. */
  message: string;
  /** True when the user should not be shown any error at all. */
  shouldStaySilent: boolean;
}

/** Codes Firebase uses when the user dismisses or the browser suppresses the
 *  popup. Both are "the user changed their mind", not a failure. */
const CANCEL_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

/**
 * Best-effort extraction of a `auth/...` code from an unknown thrown value.
 * Firebase errors expose `.code`; a few paths (network layer) only put the
 * code inside the message, so we fall back to a regex over the string form.
 */
export function extractAuthErrorCode(e: unknown): string | null {
  if (e && typeof e === "object") {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("auth/")) return code;
  }
  const text = e instanceof Error ? e.message : String(e);
  const match = text.match(/auth\/[a-z-]+(?:-[a-z]+)*/);
  return match ? match[0] : null;
}

const MESSAGES: Record<AuthErrorKind, string> = {
  "popup-cancelled":
    "Sign-in cancelled. You can try again whenever you’re ready.",
  "popup-blocked":
    "Your browser blocked the sign-in popup. Allow popups for this site, then try again.",
  "operation-not-allowed":
    "Google sign-in is not enabled for this project. Turn it on in the Firebase console.",
  "unauthorized-domain":
    "This domain is not authorised for sign-in. Add it to the Firebase authorized domains list.",
  "account-exists":
    "An account with this email already exists. Sign in with the method you used originally.",
  "user-disabled": "This account has been disabled.",
  "too-many-requests": "Too many attempts. Please wait a moment and try again.",
  network: "Could not reach the sign-in service. Check your connection and retry.",
  expired: "Your session has expired. Please sign in again.",
  "internal-error":
    "Sign-in is misconfigured. Check the Firebase configuration and try again.",
  unknown: "Sign-in failed. Please try again.",
};

/**
 * Classify a thrown value from `signInWithPopup` / `signInWithCredential`.
 */
export function classifyAuthError(e: unknown): ClassifiedAuthError {
  const code = extractAuthErrorCode(e);

  if (code && CANCEL_CODES.has(code)) {
    return {
      kind: "popup-cancelled",
      message: MESSAGES["popup-cancelled"],
      shouldStaySilent: false,
    };
  }

  const kind: AuthErrorKind = (() => {
    switch (code) {
      case "auth/popup-blocked":
        return "popup-blocked";
      case "auth/operation-not-allowed":
        return "operation-not-allowed";
      case "auth/unauthorized-domain":
        return "unauthorized-domain";
      case "auth/account-exists-with-different-credential":
        return "account-exists";
      case "auth/user-disabled":
        return "user-disabled";
      case "auth/too-many-requests":
        return "too-many-requests";
      case "auth/network-request-failed":
        return "network";
      // Session/credential expiry surfaces through a few different codes.
      case "auth/user-token-expired":
      case "auth/requires-recent-login":
        return "expired";
      case "auth/invalid-api-key":
      case "auth/config-invalid":
        return "internal-error";
      default:
        return "unknown";
    }
  })();

  return {
    kind,
    message: MESSAGES[kind],
    shouldStaySilent: false,
  };
}

/**
 * True when an error means the user is no longer (or never was) authenticated
 * and a fresh sign-in is required. Used to tear down stale session state.
 */
export function isSessionInvalidError(e: unknown): boolean {
  const code = extractAuthErrorCode(e);
  return (
    code === "auth/user-token-expired" ||
    code === "auth/requires-recent-login" ||
    code === "auth/user-disabled"
  );
}
