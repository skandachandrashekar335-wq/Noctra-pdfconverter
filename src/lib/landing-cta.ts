/**
 * The landing page stays public, but its primary actions depend on the
 * session-resolution state. Keep that decision pure so the three visible
 * states are easy to regression-test without a browser or Firebase session.
 */
export type LandingCtaMode =
  | "resolving-session"
  | "authenticated"
  | "unauthenticated";

export function getLandingCtaMode(
  loading: boolean,
  signedIn: boolean
): LandingCtaMode {
  if (loading) return "resolving-session";
  return signedIn ? "authenticated" : "unauthenticated";
}
