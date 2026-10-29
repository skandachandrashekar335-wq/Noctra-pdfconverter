"use client";

/**
 * App-theme provider — owns the Light / Dark / System chrome theme.
 *
 * Applies `data-theme="light|dark"` to `<html>` so `globals.css` can swap
 * semantic tokens, persists the preference, and tracks the OS
 * `prefers-color-scheme` while the preference is `system`.
 *
 * Deliberately separate from the **conversion** theme (the palette a document
 * is converted to). This provider never touches the output pipeline.
 *
 * No-flash: `layout.tsx` injects a tiny inline script that sets `data-theme`
 * before first paint. This provider mounts afterwards and takes over
 * synchronously from the same stored value, so there is no flicker and no
 * divergence between the pre-paint value and React state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  THEME_STORAGE_KEY,
  normalizePreference,
  readStoredPreference,
  resolveTheme,
  systemPrefersDark,
  type AppTheme,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeContextValue {
  /** What the user chose (may be `system`). */
  preference: ThemePreference;
  /** The theme actually rendered right now. */
  resolved: AppTheme;
  /** True while the preference is `system` and following the OS. */
  isSystem: boolean;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialPreference(): ThemePreference {
  // On the server there is no storage and no OS signal, so return "system" —
  // the same value the client computes when nothing is stored. This keeps the
  // server and client renders identical (no hydration mismatch on the toggle's
  // aria-checked), while the pre-paint inline script in layout.tsx has already
  // set the correct `data-theme` for the resolved appearance.
  if (typeof window === "undefined") return "system";
  return readStoredPreference(window.localStorage) ?? "system";
}

function systemDarkNow(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return systemPrefersDark(window.matchMedia("(prefers-color-scheme: dark)")) ?? true;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(initialPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemDarkNow);

  // Track the OS preference so `system` stays live. Only subscribed while the
  // preference is `system` — an explicit choice should not fight the OS. The
  // initial value comes from `useState(systemDarkNow)`; this only reacts to
  // subsequent changes, so no synchronous setState occurs inside the effect.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (preference !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  const resolved = resolveTheme(preference, systemDark);

  // Reflect the resolved theme onto <html> for the CSS token swap.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    // Keep a stable meta color for browsers/chrome that honour it.
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", resolved === "dark" ? "#08080b" : "#faf7f0");
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    const safe = normalizePreference(next) ?? "system";
    setPreferenceState(safe);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, safe);
    } catch {
      // Storage may be unavailable — the in-memory choice still applies.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      isSystem: preference === "system",
      setPreference,
    }),
    [preference, resolved, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Access the app theme. Throws if used outside the provider (a bug). */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
