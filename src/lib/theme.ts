/**
 * Theme resolution, persistence and the app-vs-conversion theme boundary.
 *
 * Pure and framework-free so it is unit-testable in Node with no DOM. The
 * React provider (`ThemeProvider`) is a thin wrapper around these functions.
 *
 * Two independent concepts, deliberately never conflated:
 *  - The **app theme** (`AppTheme`) is how the *website chrome* looks
 *    (Light / Dark / System). It is what this module manages.
 *  - The **conversion theme** (`ConversionProfile`) is the palette a
 *    *document* is converted to (OLED Black, Warm Sepia, …). It is owned by
 *    `conversion-profiles.ts` and only affects output bytes — never the UI.
 *    A user can browse Noctra in Light Mode while converting to OLED Black.
 */

export type AppTheme = "light" | "dark";
export type ThemePreference = AppTheme | "system";

/** Every value the control can hold, in the order they are offered. */
export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
] as const;

/** localStorage key — namespaced so it never collides with other apps. */
export const THEME_STORAGE_KEY = "noctra:app-theme";

/** Narrow an untrusted stored/raw value to a valid preference. */
export function normalizePreference(value: unknown): ThemePreference | null {
  if (value === "light" || value === "dark" || value === "system") return value;
  return null;
}

/**
 * Resolve a preference against the OS `prefers-color-scheme`.
 * `system` (and any invalid input) falls back to the media query, which
 * itself defaults to dark — Noctra is OLED-first, so an unknown state is dark.
 */
export function resolveTheme(
  preference: ThemePreference | null | undefined,
  systemPrefersDark: boolean | undefined
): AppTheme {
  if (preference === "light" || preference === "dark") return preference;
  return systemPrefersDark === false ? "light" : "dark";
}

/** Read the stored preference, tolerating SSR, disabled storage and bad data. */
export function readStoredPreference(
  storage: Pick<Storage, "getItem"> | null | undefined
): ThemePreference | null {
  if (!storage) return null;
  try {
    return normalizePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    // Storage can throw (Safari private mode, quota, sandboxed iframe).
    return null;
  }
}

/** Persist a preference. Returns true when the write actually landed. */
export function writePreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  preference: ThemePreference
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(THEME_STORAGE_KEY, preference);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read `prefers-color-scheme: dark` from a MediaQueryList-like object.
 * Accepts the legacy `matches` shape so both addEventListener and
 * addListener eras are supported.
 */
export function systemPrefersDark(
  mql: { matches?: boolean } | null | undefined
): boolean | undefined {
  if (!mql || typeof mql.matches !== "boolean") return undefined;
  return mql.matches;
}

/** Accessible label for the theme control given the current preference. */
export function themeLabel(preference: ThemePreference): string {
  switch (preference) {
    case "light":
      return "Light theme";
    case "dark":
      return "Dark theme";
    default:
      return "System theme";
  }
}
