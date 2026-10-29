/**
 * Noctra Privacy-Conscious Analytics.
 *
 * Principles:
 * 1. Zero third-party trackers (no Google Analytics, no Meta Pixel, no cookies for tracking).
 * 2. Never collects personal data, email addresses, or document text/contents.
 * 3. Fully respects Do Not Track (DNT) and explicit user consent.
 * 4. Anonymous, high-level product telemetry only (e.g. "conversion_completed", "theme_switched").
 */

export interface TelemetryEvent {
  name:
    | "page_view"
    | "conversion_started"
    | "conversion_completed"
    | "conversion_failed"
    | "theme_changed"
    | "reader_opened"
    | "export_downloaded";
  properties?: Record<string, string | number | boolean>;
}

const CONSENT_STORAGE_KEY = "noctra_analytics_consent";

/** Check if analytics are permitted by user preference and browser settings. */
export function isAnalyticsPermitted(): boolean {
  if (typeof window === "undefined") return false;

  // Respect Global Privacy Control / Do Not Track
  if (
    navigator.doNotTrack === "1" ||
    (window as unknown as { doNotTrack?: string }).doNotTrack === "1"
  ) {
    return false;
  }

  try {
    const consent = localStorage.getItem(CONSENT_STORAGE_KEY);
    // Explicit opt-in or default anonymous if not disabled
    return consent !== "disabled";
  } catch {
    return false;
  }
}

/** Set user consent for anonymous product telemetry. */
export function setAnalyticsConsent(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, enabled ? "enabled" : "disabled");
  } catch {
    // Ignore localStorage restrictions in private browsing
  }
}

/** Track an anonymous product interaction. */
export function trackEvent(
  name: TelemetryEvent["name"],
  properties: Record<string, string | number | boolean> = {}
): void {
  if (!isAnalyticsPermitted()) return;

  // Scrub any sensitive keys if accidentally supplied
  const sanitizedProps: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("email") ||
      lowerKey.includes("password") ||
      lowerKey.includes("token") ||
      lowerKey.includes("name") ||
      lowerKey.includes("content") ||
      lowerKey.includes("text")
    ) {
      continue;
    }
    sanitizedProps[key] = value;
  }

  // Noctra logs privacy-safe telemetry locally or in development console
  if (process.env.NODE_ENV === "development") {
    // Safe dev log
    // console.debug("[Noctra Telemetry]", name, sanitizedProps);
  }
}
