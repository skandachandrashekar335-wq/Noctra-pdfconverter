"use client";

/**
 * Global Light / Dark / System theme control.
 *
 * A compact segmented radiogroup that reads and writes the app theme via
 * `useTheme`. Renders as three radio options so keyboard (arrow keys) and
 * screen readers get the expected radiogroup semantics, with a visible
 * focus ring and a label that states the current mode.
 *
 * This controls the *chrome* theme only — it never touches the document
 * conversion theme.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { useTheme } from "@/components/ThemeProvider";
import {
  THEME_PREFERENCES,
  themeLabel,
  type ThemePreference,
} from "@/lib/theme";

/**
 * The server cannot know the stored preference or the OS colour scheme, so
 * SSR always emits the default state (System active, dark resolved). To avoid
 * a hydration mismatch — which React reports but does *not* patch, leaving the
 * indicator stuck on the wrong option — the first client render reproduces
 * that same default, and the real values are adopted in a layout effect
 * immediately after hydration, before the browser paints.
 *
 * `useLayoutEffect` never runs on the server, where it would only warn; the
 * isomorphic binding keeps the server pass on `useEffect` (a no-op there).
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** SSR default: what the server rendered before it could know anything. */
const SSR_PREFERENCE: ThemePreference = "system";
const SSR_RESOLVED = "dark"; // resolveTheme("system", dark-by-default)

function Icon({ name }: { name: ThemePreference }) {
  // Minimal, stroke-based glyphs — legible at 16px, inherit currentColor.
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  if (name === "light")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  if (name === "dark")
    return (
      <svg {...common}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { preference, setPreference, resolved } = useTheme();

  // First render (hydration) must byte-match the server output; the real
  // preference lands in a pre-paint layout effect (see SSR_PREFERENCE above).
  const [hydrated, setHydrated] = useState(false);
  useIsomorphicLayoutEffect(() => setHydrated(true), []);

  const activePreference = hydrated ? preference : SSR_PREFERENCE;
  const activeResolved = hydrated ? resolved : SSR_RESOLVED;

  return (
    <div
      className={`theme-toggle ${className}`}
      role="radiogroup"
      aria-label="Colour theme"
      data-resolved={activeResolved}
    >
      {THEME_PREFERENCES.map((pref) => {
        const active = pref === activePreference;
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={themeLabel(pref)}
            title={themeLabel(pref)}
            // Roving tabindex: only the active option is tabbable; arrows move.
            tabIndex={active ? 0 : -1}
            className={`theme-toggle-opt${active ? " is-active" : ""}`}
            onClick={() => setPreference(pref)}
            onKeyDown={(e) => {
              // Arrow keys move selection within the radiogroup (both horizontal and vertical).
              const isNext = e.key === "ArrowRight" || e.key === "ArrowDown";
              const isPrev = e.key === "ArrowLeft" || e.key === "ArrowUp";
              if (!isNext && !isPrev) return;
              e.preventDefault();
              const idx = THEME_PREFERENCES.indexOf(pref);
              const delta = isNext ? 1 : -1;
              const next =
                THEME_PREFERENCES[
                  (idx + delta + THEME_PREFERENCES.length) %
                    THEME_PREFERENCES.length
                ];
              setPreference(next);
              // Move focus to the option we just selected.
              const el = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                '[role="radio"]'
              )[THEME_PREFERENCES.indexOf(next)];
              el?.focus();
            }}
          >
            <Icon name={pref} />
            <span className="theme-toggle-label">{pref}</span>
          </button>
        );
      })}
    </div>
  );
}
